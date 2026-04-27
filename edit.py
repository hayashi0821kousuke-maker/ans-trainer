#!/usr/bin/env python3
"""
Auto Video Editor for YouTube Shorts
Kling AI clips + ElevenLabs voices → YouTube Shorts (9:16, ≤60s)

Usage:
    python edit.py --project ./project/
    python edit.py --project ./project/ --no-bgm --no-sfx
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
import pysubs2
from dotenv import load_dotenv

# ─── Constants ────────────────────────────────────────────────────────────────
MAX_DURATION   = 60.0   # YouTube Shorts hard cap (seconds)
SPEED_LIMIT    = 0.15   # clip speed adjustment cap (±15%)
BGM_DUCK       = 0.3    # BGM volume during narration
BGM_FULL       = 0.8    # BGM volume otherwise
SFX_VOL        = 0.8    # SFX gain in the mix
TARGET_W       = 1080   # YouTube Shorts width
TARGET_H       = 1920   # YouTube Shorts height

# ASS color format: &HAABBGGRR  (A=alpha, B=blue, G=green, R=red)
SPEAKER_COLORS: dict[str, str] = {
    "narrator": "&H00FFFFFF",   # white
    "cat":      "&H0000FF00",   # green
    "customer": "&H000080FF",   # orange
}
DEFAULT_COLOR = "&H00FFFF00"    # yellow fallback

SFX_QUERY_MAP: dict[str, str] = {
    "intro":  "intro fanfare jingle short",
    "whoosh": "whoosh swipe transition",
    "outro":  "outro end chime",
    "pop":    "pop bubble sound effect",
    "laugh":  "laugh audience funny",
    "ding":   "ding bell notification",
}


# ─── Process helpers ──────────────────────────────────────────────────────────

def _run(cmd: list, desc: str) -> str:
    """Run a subprocess, printing stderr and raising on non-zero exit."""
    print(f"  ▶ {desc}")
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:] + "\n")
        raise RuntimeError(f"Command failed [{r.returncode}]: {desc}")
    return r.stdout


def ff(*args, desc: str = "ffmpeg") -> str:
    return _run(["ffmpeg", "-y", *args], desc)


def ffprobe(path: Path) -> dict:
    out = _run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        desc=f"probe {path.name}",
    )
    return json.loads(out)


def duration(path: Path) -> float:
    return float(ffprobe(path)["format"]["duration"])


# ─── Freesound client ─────────────────────────────────────────────────────────

class FreesoundClient:
    BASE = "https://freesound.org/apiv2"

    def __init__(self, api_key: str) -> None:
        self.key = api_key
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Token {api_key}"

    def search(self, query: str, max_dur: float = 30.0) -> Optional[dict]:
        params = {
            "query": query,
            "filter": f"duration:[1 TO {int(max_dur)}]",
            "sort": "rating_desc",
            "page_size": 5,
            "fields": "id,name,duration,previews",
        }
        r = self.s.get(f"{self.BASE}/search/text/", params=params, timeout=15)
        r.raise_for_status()
        results = r.json().get("results", [])
        return results[0] if results else None

    def download(self, sound: dict, dest: Path) -> Path:
        # Use HQ MP3 preview (no login required beyond token)
        url = sound["previews"]["preview-hq-mp3"]
        r = self.s.get(url, stream=True, timeout=60)
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return dest


# ─── Voice track ──────────────────────────────────────────────────────────────

def merge_voices(scenes: list[dict], voice_dir: Path, out: Path) -> list[float]:
    """
    Concatenate per-scene voice mp3 files.
    Returns the start time (seconds) of each scene's voice segment.
    """
    parts: list[Path] = []
    for scene in scenes:
        p = voice_dir / f"{scene['voice']}.mp3"
        if not p.exists():
            raise FileNotFoundError(f"Voice file missing: {p}")
        parts.append(p)

    inputs: list[str] = []
    for p in parts:
        inputs += ["-i", str(p)]

    flt = "".join(f"[{i}:a]" for i in range(len(parts)))
    flt += f"concat=n={len(parts)}:v=0:a=1[aout]"

    ff(*inputs,
       "-filter_complex", flt,
       "-map", "[aout]",
       "-ar", "44100", "-ac", "2",
       str(out),
       desc="merge voice tracks")

    # Accumulate start timestamps
    starts: list[float] = []
    t = 0.0
    for p in parts:
        starts.append(t)
        t += duration(p)
    return starts


# ─── Clip speed adjustment ────────────────────────────────────────────────────

def adjust_clip(src: Path, target_dur: float, out: Path) -> None:
    """
    Speed-adjust a clip so its duration ≈ target_dur.
    Clamps ratio to ±15% to keep motion natural.
    Scales/pads to 1080×1920 (9:16) and strips audio.
    """
    src_dur = duration(src)
    ratio = src_dur / target_dur          # >1 means need to speed up
    ratio = max(1.0 - SPEED_LIMIT, min(1.0 + SPEED_LIMIT, ratio))
    pts   = 1.0 / ratio                   # setpts multiplier

    vf = (
        f"setpts={pts:.5f}*PTS,"
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2:black"
    )
    ff("-i", str(src),
       "-vf", vf,
       "-an",
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       str(out),
       desc=f"speed-adjust {src.name}")


# ─── Subtitle generation ──────────────────────────────────────────────────────

def _parse_ass_color(s: str) -> pysubs2.Color:
    """Parse ASS &HAABBGGRR to pysubs2.Color(r,g,b,a)."""
    h = s.lstrip("&H")
    v = int(h, 16)
    a = (v >> 24) & 0xFF
    b = (v >> 16) & 0xFF
    g = (v >> 8)  & 0xFF
    r =  v        & 0xFF
    return pysubs2.Color(r=r, g=g, b=b, a=a)


def build_subtitles(
    scenes: list[dict],
    voice_starts: list[float],
    voice_dir: Path,
    out: Path,
) -> None:
    """Create an ASS subtitle file with per-speaker colour coding."""
    subs = pysubs2.SSAFile()
    subs.info["PlayResX"] = str(TARGET_W)
    subs.info["PlayResY"] = str(TARGET_H)

    # One style per speaker
    seen_speakers: set[str] = set()
    for scene in scenes:
        spk = scene["voice"]
        if spk in seen_speakers:
            continue
        seen_speakers.add(spk)
        style = pysubs2.SSAStyle()
        style.fontname     = "Arial"
        style.fontsize     = 62
        style.primarycolor = _parse_ass_color(
            SPEAKER_COLORS.get(spk, DEFAULT_COLOR)
        )
        style.bold         = True
        style.outline      = 3
        style.shadow       = 1
        style.alignment    = 2    # bottom-center
        style.marginv      = 90
        subs.styles[spk]   = style

    for i, scene in enumerate(scenes):
        spk      = scene["voice"]
        start_ms = int(voice_starts[i] * 1000)
        dur_s    = duration(voice_dir / f"{spk}.mp3")
        end_ms   = int((voice_starts[i] + dur_s) * 1000)
        subs.append(pysubs2.SSAEvent(
            start=start_ms,
            end=end_ms,
            text=scene["text"],
            style=spk,
        ))

    subs.save(str(out))
    print(f"  ▶ subtitles saved → {out.name}")


# ─── BGM with ducking ─────────────────────────────────────────────────────────

def build_ducked_bgm(
    bgm: Path,
    voice_starts: list[float],
    voice_dir: Path,
    scenes: list[dict],
    total_dur: float,
    out: Path,
) -> None:
    """
    Loop BGM to total_dur and duck it to BGM_DUCK during narration windows.
    Fades out the last 2 seconds.
    """
    ranges = []
    for i, scene in enumerate(scenes):
        t0 = voice_starts[i]
        t1 = t0 + duration(voice_dir / f"{scene['voice']}.mp3")
        ranges.append((t0, t1))

    # volume expression: duck when any narration window is active
    duck_expr = "+".join(f"between(t,{t0:.3f},{t1:.3f})" for t0, t1 in ranges)
    vol_expr  = f"if(gt({duck_expr},0),{BGM_DUCK},{BGM_FULL})"

    fade_start = max(0.0, total_dur - 2.0)
    af = (
        f"volume='{vol_expr}':eval=frame,"
        f"afade=t=out:st={fade_start:.3f}:d=2"
    )

    ff("-stream_loop", "-1", "-i", str(bgm),
       "-t", str(total_dur),
       "-af", af,
       "-ar", "44100", "-ac", "2",
       str(out),
       desc="duck BGM")


# ─── SFX track ────────────────────────────────────────────────────────────────

def build_sfx_track(
    scenes: list[dict],
    voice_starts: list[float],
    sfx_dir: Path,
    total_dur: float,
    fs: Optional[FreesoundClient],
    out: Path,
) -> None:
    """
    Download SFX for each scene that has an 'sfx' field and mix them into a
    single audio track, placing each SFX at the scene's start time.
    """
    # Collect (offset_seconds, file_path) pairs
    sfx_items: list[tuple[float, Path]] = []

    for i, scene in enumerate(scenes):
        sfx_key = scene.get("sfx")
        if not sfx_key:
            continue
        query    = SFX_QUERY_MAP.get(sfx_key, sfx_key)
        sfx_file = sfx_dir / f"sfx_{i:02d}_{sfx_key}.mp3"

        if sfx_file.exists():
            print(f"  ▶ SFX cache hit: {sfx_file.name}")
        elif fs is not None:
            print(f"  ▶ Searching Freesound SFX: {query!r}")
            try:
                sound = fs.search(query, max_dur=5.0)
                if sound:
                    fs.download(sound, sfx_file)
                    print(f"    ✓ {sound['name']} ({sound['duration']:.1f}s)")
                else:
                    print(f"    ⚠ No result for {query!r} — skipped")
                    continue
            except Exception as exc:
                print(f"    ⚠ SFX download failed: {exc} — skipped")
                continue
        else:
            continue  # no client, skip

        sfx_items.append((voice_starts[i], sfx_file))

    if not sfx_items:
        # Silent placeholder track
        ff("-f", "lavfi",
           "-i", "anullsrc=r=44100:cl=stereo",
           "-t", str(total_dur),
           "-c:a", "aac",
           str(out),
           desc="silent SFX track (no SFX found)")
        return

    # Build filter: silence base + delayed SFX inputs, then amix
    inputs: list[str] = [
        "-f", "lavfi",
        "-i", f"anullsrc=r=44100:cl=stereo",
    ]
    for _, sfx_path in sfx_items:
        inputs += ["-i", str(sfx_path)]

    filter_parts: list[str] = []
    for j, (t_start, _) in enumerate(sfx_items):
        delay_ms = int(t_start * 1000)
        filter_parts.append(
            f"[{j + 1}:a]adelay={delay_ms}|{delay_ms},"
            f"volume={SFX_VOL}[sfx{j}]"
        )

    mix_in = "[0:a]" + "".join(f"[sfx{j}]" for j in range(len(sfx_items)))
    filter_parts.append(
        f"{mix_in}amix=inputs={1 + len(sfx_items)}:duration=first:normalize=0[aout]"
    )

    ff(*inputs,
       "-filter_complex", ";".join(filter_parts),
       "-map", "[aout]",
       "-t", str(total_dur),
       "-ar", "44100", "-ac", "2",
       str(out),
       desc="mix SFX track")


# ─── Core pipeline ────────────────────────────────────────────────────────────

def build_main_content(
    scenes:   list[dict],
    clips_dir: Path,
    voice_dir: Path,
    tmp_dir:   Path,
    bgm_path:  Optional[Path],
    sfx_dir:   Path,
    fs:        Optional[FreesoundClient],
) -> Path:
    """
    Produce the main video segment (clips + voice + BGM + SFX + subtitles).
    Returns the path to the composed .mp4.
    """
    # ── 1. Merge voice tracks ─────────────────────────────────────────────
    print("\n[1/6] Merging voice tracks …")
    voice_merged = tmp_dir / "voice_merged.mp3"
    voice_starts = merge_voices(scenes, voice_dir, voice_merged)
    total_voice  = duration(voice_merged)
    print(f"      Total voice duration: {total_voice:.2f}s")

    # ── 2. Speed-adjust each clip to its scene's voice duration ───────────
    print("\n[2/6] Speed-adjusting clips …")
    adj_clips: list[Path] = []
    for i, scene in enumerate(scenes):
        src = clips_dir / scene["clip"]
        if not src.exists():
            raise FileNotFoundError(f"Clip not found: {src}")
        scene_voice_dur = duration(voice_dir / f"{scene['voice']}.mp3")
        adj = tmp_dir / f"clip_adj_{i:02d}.mp4"
        adjust_clip(src, scene_voice_dur, adj)
        adj_clips.append(adj)

    # ── 3. Concatenate adjusted clips ─────────────────────────────────────
    print("\n[3/6] Concatenating clips …")
    concat_txt = tmp_dir / "concat.txt"
    concat_txt.write_text("\n".join(f"file '{p}'" for p in adj_clips))
    clips_merged = tmp_dir / "clips_merged.mp4"
    ff("-f", "concat", "-safe", "0",
       "-i", str(concat_txt),
       "-c", "copy",
       str(clips_merged),
       desc="concat clips")

    # ── 4. Subtitles ──────────────────────────────────────────────────────
    print("\n[4/6] Generating subtitles …")
    subs_path = tmp_dir / "subtitles.ass"
    build_subtitles(scenes, voice_starts, voice_dir, subs_path)

    # ── 5. Build audio mix (voice + optional BGM + SFX) ───────────────────
    print("\n[5/6] Building audio mix …")
    audio_final = tmp_dir / "audio_mix.aac"

    if bgm_path:
        bgm_ducked = tmp_dir / "bgm_ducked.aac"
        build_ducked_bgm(bgm_path, voice_starts, voice_dir,
                         scenes, total_voice, bgm_ducked)
        sfx_track = tmp_dir / "sfx_track.aac"
        build_sfx_track(scenes, voice_starts, sfx_dir,
                        total_voice, fs, sfx_track)

        ff("-i", str(voice_merged),
           "-i", str(bgm_ducked),
           "-i", str(sfx_track),
           "-filter_complex",
           "[0:a][1:a][2:a]amix=inputs=3:normalize=0[aout]",
           "-map", "[aout]",
           "-c:a", "aac",
           str(audio_final),
           desc="mix voice + BGM + SFX")
    else:
        sfx_track = tmp_dir / "sfx_track.aac"
        build_sfx_track(scenes, voice_starts, sfx_dir,
                        total_voice, fs, sfx_track)

        ff("-i", str(voice_merged),
           "-i", str(sfx_track),
           "-filter_complex",
           "[0:a][1:a]amix=inputs=2:normalize=0[aout]",
           "-map", "[aout]",
           "-c:a", "aac",
           str(audio_final),
           desc="mix voice + SFX")

    # ── 6. Composite: video + audio + burned-in subtitles ─────────────────
    print("\n[6/6] Compositing video with subtitles …")
    # Escape the ass path for ffmpeg filter (colons need escaping on Windows,
    # but absolute POSIX paths are fine on Linux/macOS).
    subs_escaped = str(subs_path).replace("\\", "/").replace(":", "\\:")
    vf = f"ass={subs_escaped}"

    main_out = tmp_dir / "main_content.mp4"
    ff("-i", str(clips_merged),
       "-i", str(audio_final),
       "-vf", vf,
       "-map", "0:v",
       "-map", "1:a",
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       "-c:a", "aac",
       "-shortest",
       str(main_out),
       desc="composite with subtitles")

    return main_out


def _normalize_clip(src: Path, idx: int, tmp_dir: Path) -> Path:
    """Re-encode a clip to uniform 1080×1920 specs for safe concatenation."""
    out = tmp_dir / f"norm_{idx:02d}.mp4"
    vf = (
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=decrease,"
        f"pad={TARGET_W}:{TARGET_H}:(ow-iw)/2:(oh-ih)/2:black,"
        f"fps=30"
    )
    ff("-i", str(src),
       "-vf", vf,
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       "-c:a", "aac", "-ar", "44100", "-ac", "2",
       str(out),
       desc=f"normalize {src.name}")
    return out


def concat_bookends(
    main:    Path,
    op:      Optional[Path],
    ed:      Optional[Path],
    tmp_dir: Path,
) -> Path:
    """Prepend op.mp4 and append ed.mp4 to the main content."""
    parts: list[Optional[Path]] = [op, main, ed]
    existing = [p for p in parts if p and p.exists()]

    if len(existing) == 1:
        return existing[0]

    normalized = [_normalize_clip(p, i, tmp_dir) for i, p in enumerate(existing)]

    concat_txt = tmp_dir / "bookend_concat.txt"
    concat_txt.write_text("\n".join(f"file '{p}'" for p in normalized))
    out = tmp_dir / "with_bookends.mp4"
    ff("-f", "concat", "-safe", "0",
       "-i", str(concat_txt),
       "-c", "copy",
       str(out),
       desc="concat OP + main + ED")
    return out


def _chain_atempo(ratio: float) -> str:
    """
    Build a chained atempo filter string for ratios outside [0.5, 2.0].
    FFmpeg's atempo filter accepts only [0.5, 2.0] per instance.
    """
    filters: list[str] = []
    r = ratio
    while r > 2.0:
        filters.append("atempo=2.0")
        r /= 2.0
    while r < 0.5:
        filters.append("atempo=0.5")
        r /= 0.5
    filters.append(f"atempo={r:.4f}")
    return ",".join(filters)


def enforce_60s(video: Path, tmp_dir: Path) -> Path:
    """Speed-up the final video uniformly if it exceeds 60 seconds."""
    dur = duration(video)
    if dur <= MAX_DURATION:
        print(f"  ✓ Duration {dur:.2f}s ≤ {MAX_DURATION}s — no adjustment needed")
        return video

    ratio = dur / MAX_DURATION
    print(f"  ⚠ Duration {dur:.2f}s > {MAX_DURATION}s — speeding up ×{ratio:.3f}")
    pts    = 1.0 / ratio
    atempo = _chain_atempo(ratio)

    out = tmp_dir / "enforced.mp4"
    ff("-i", str(video),
       "-filter:v", f"setpts={pts:.5f}*PTS",
       "-filter:a", atempo,
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       "-c:a", "aac",
       str(out),
       desc=f"enforce ≤{MAX_DURATION}s")
    return out


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Auto-edit YouTube Shorts from Kling AI clips + ElevenLabs voices"
    )
    parser.add_argument("--project", required=True,
                        help="Root project folder (must contain clips/, voice/, template/, script.json)")
    parser.add_argument("--no-bgm", action="store_true",
                        help="Skip BGM download from Freesound")
    parser.add_argument("--no-sfx", action="store_true",
                        help="Skip SFX download from Freesound")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    print(f"\n{'='*50}")
    print(f"  Auto Video Editor — YouTube Shorts")
    print(f"  Project: {project}")
    print(f"{'='*50}\n")

    # Load .env from project dir, then cwd fallback
    load_dotenv(project / ".env")
    load_dotenv(".env")

    freesound_key = os.getenv("FREESOUND_API_KEY", "")
    use_freesound = bool(freesound_key) and not (args.no_bgm and args.no_sfx)
    if not freesound_key:
        print("⚠  FREESOUND_API_KEY not set — BGM and SFX will be skipped.\n")
    fs: Optional[FreesoundClient] = FreesoundClient(freesound_key) if use_freesound else None

    # Validate directories
    clips_dir    = project / "clips"
    voice_dir    = project / "voice"
    template_dir = project / "template"
    output_dir   = project / "output"
    sfx_dir      = project / "sfx_cache"
    bgm_dir      = project / "bgm_cache"
    script_path  = project / "script.json"

    for d in (clips_dir, voice_dir, template_dir):
        if not d.exists():
            sys.exit(f"✗ Required directory missing: {d}")
    if not script_path.exists():
        sys.exit(f"✗ script.json not found: {script_path}")

    output_dir.mkdir(exist_ok=True)
    sfx_dir.mkdir(exist_ok=True)
    bgm_dir.mkdir(exist_ok=True)

    with open(script_path, encoding="utf-8") as f:
        script = json.load(f)
    scenes: list[dict] = script["scenes"]
    print(f"Loaded {len(scenes)} scene(s) from script.json")
    for i, sc in enumerate(scenes):
        print(f"  Scene {i+1}: clip={sc['clip']}  voice={sc['voice']}  sfx={sc.get('sfx','—')}")

    op_path = template_dir / "op.mp4"
    ed_path = template_dir / "ed.mp4"

    # ── Fetch BGM from Freesound ──────────────────────────────────────────────
    bgm_path: Optional[Path] = None
    if not args.no_bgm and fs is not None:
        bgm_cache = bgm_dir / "bgm.mp3"
        if bgm_cache.exists():
            print(f"\n[BGM] Cached BGM found: {bgm_cache.name}")
            bgm_path = bgm_cache
        else:
            print("\n[BGM] Searching Freesound for background music …")
            bgm_query = os.getenv("BGM_QUERY", "cute background music lofi upbeat")
            try:
                sound = fs.search(bgm_query, max_dur=180.0)
                if sound:
                    bgm_path = fs.download(sound, bgm_cache)
                    print(f"  ✓ BGM: {sound['name']} ({sound['duration']:.1f}s)")
                else:
                    print("  ⚠ No BGM found — proceeding without BGM")
            except Exception as exc:
                print(f"  ⚠ BGM search failed: {exc} — proceeding without BGM")

    # ── Main pipeline ─────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory(prefix="auto_edit_") as tmpdir:
        tmp = Path(tmpdir)

        print("\n=== Building main content ===")
        main_video = build_main_content(
            scenes=scenes,
            clips_dir=clips_dir,
            voice_dir=voice_dir,
            tmp_dir=tmp,
            bgm_path=bgm_path,
            sfx_dir=sfx_dir,
            fs=None if args.no_sfx else fs,
        )

        print("\n=== Adding OP / ED ===")
        with_bookends = concat_bookends(main_video, op_path, ed_path, tmp)

        print("\n=== Checking 60-second limit ===")
        final = enforce_60s(with_bookends, tmp)

        # ── Final encode ──────────────────────────────────────────────────────
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = output_dir / f"finished_{ts}.mp4"

        print(f"\n=== Final encode → {out_path.name} ===")
        ff("-i", str(final),
           "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-c:a", "aac", "-b:a", "192k",
           "-pix_fmt", "yuv420p",
           "-movflags", "+faststart",
           str(out_path),
           desc="final encode")

    final_dur  = duration(out_path)
    size_mb    = out_path.stat().st_size / 1_048_576
    print(f"\n{'='*50}")
    print(f"  ✅  Done!")
    print(f"  Output  : {out_path}")
    print(f"  Duration: {final_dur:.2f}s")
    print(f"  Size    : {size_mb:.1f} MB")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()

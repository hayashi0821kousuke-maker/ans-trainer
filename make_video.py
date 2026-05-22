#!/usr/bin/env python3
"""
YouTube Shorts 動画自動生成スクリプト
GASで生成した画像・台本・設定ファイルから動画を自動生成します

使い方:
    python make_video.py --project ./downloaded_folder/
    python make_video.py --project ./downloaded_folder/ --voice ./voice.mp3
    python make_video.py --project ./downloaded_folder/ --no-bgm
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# ─── 定数 ─────────────────────────────────────────────────────────────────────

TARGET_W = 1080
TARGET_H = 1920
FPS      = 30
BGM_DUCK = 0.25
BGM_FULL = 0.7

# ─── FFmpegヘルパー ────────────────────────────────────────────────────────────

def _run(cmd: list, desc: str) -> str:
    print(f"  ▶ {desc}")
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:] + "\n")
        raise RuntimeError(f"コマンド失敗: {desc}")
    return r.stdout

def ff(*args, desc="ffmpeg") -> str:
    return _run(["ffmpeg", "-y", *args], desc)

def ffprobe_duration(path: Path) -> float:
    out = _run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", str(path)],
        desc=f"probe {path.name}"
    )
    return float(json.loads(out)["format"]["duration"])

# ─── ケン・バーンズ効果（画像→動画クリップ） ─────────────────────────────────

def image_to_clip(image_path: Path, duration: float, output: Path, effect: str = "zoom_in") -> None:
    """
    静止画にズームイン/アウト効果をつけて動画クリップに変換する
    effect: "zoom_in" or "zoom_out"
    """
    frames    = int(duration * FPS)
    zoom_step = 0.15 / max(frames, 1)

    if effect == "zoom_in":
        zoom_expr = f"min(1+{zoom_step:.6f}*on,1.15)"
    else:
        zoom_expr = f"if(eq(on,1),1.15,max(1.0,zoom-{zoom_step:.6f}))"

    x_expr = "iw/2-(iw/zoom/2)"
    y_expr = "ih/2-(ih/zoom/2)"

    zoompan = (
        f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
        f"d={frames}:s={TARGET_W}x{TARGET_H}:fps={FPS}"
    )

    scale_pad = (
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=increase,"
        f"crop={TARGET_W}:{TARGET_H}"
    )

    vf = f"{scale_pad},{zoompan}"

    ff("-loop", "1",
       "-i", str(image_path),
       "-vf", vf,
       "-t", str(duration),
       "-an",
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       "-pix_fmt", "yuv420p",
       str(output),
       desc=f"ケン・バーンズ効果 ({effect}): {image_path.name}")

# ─── 動画クリップの結合 ────────────────────────────────────────────────────────

def concat_clips(clip_paths: list, output: Path, tmp_dir: Path) -> None:
    list_file = tmp_dir / "concat_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))
    ff("-f", "concat", "-safe", "0",
       "-i", str(list_file),
       "-c", "copy",
       str(output),
       desc="クリップを結合")

# ─── BGMのダッキング処理 ───────────────────────────────────────────────────────

def mix_audio_with_bgm(voice_path: Path, bgm_path: Path, total_dur: float, output: Path) -> None:
    fade_start = max(0.0, total_dur - 2.0)
    af = (
        f"volume={BGM_DUCK},"
        f"afade=t=out:st={fade_start:.2f}:d=2"
    )
    ff("-i", str(voice_path),
       "-stream_loop", "-1", "-i", str(bgm_path),
       "-t", str(total_dur),
       "-filter_complex",
       f"[1:a]{af}[bgm];[0:a][bgm]amix=inputs=2:duration=first:normalize=0[aout]",
       "-map", "[aout]",
       "-c:a", "aac", "-ar", "44100",
       str(output),
       desc="音声とBGMをミックス")

# ─── テロップ（ASS字幕）生成 ───────────────────────────────────────────────────

def build_subtitles(script_text: str, scenes: list, output: Path) -> None:
    """
    台本テキストから各シーンのテロップファイル（ASS）を生成する
    """
    ass_header = f"""[Script Info]
PlayResX: {TARGET_W}
PlayResY: {TARGET_H}
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Outline, Shadow, Alignment, MarginV
Style: Default,Arial,72,&H00FFFFFF,&H00000000,-1,4,1,2,{int(TARGET_H * 0.18)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    t = 0.0
    for scene in scenes:
        dur   = scene.get("duration", 8)
        start = _format_ass_time(t)
        end   = _format_ass_time(t + dur)
        text  = scene.get("subtitle", f"シーン{scene['scene']}")
        text  = _wrap_text(text, 14)
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")
        t += dur

    output.write_text(ass_header + "\n".join(events), encoding="utf-8")

def _format_ass_time(seconds: float) -> str:
    h   = int(seconds // 3600)
    m   = int((seconds % 3600) // 60)
    s   = int(seconds % 60)
    cs  = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def _wrap_text(text: str, max_chars: int = 14) -> str:
    chunks = [text[i:i+max_chars] for i in range(0, len(text), max_chars)]
    return r"\N".join(chunks)

# ─── メインパイプライン ────────────────────────────────────────────────────────

def build_video(project_dir: Path, voice_path: Path = None, no_bgm: bool = False) -> Path:
    config_path = project_dir / "production_config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"production_config.json が見つかりません: {config_path}")

    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)

    scenes        = config["scenes"]
    total_duration = config["target_duration"]
    theme         = config["theme"]

    print(f"\n{'='*55}")
    print(f"  YouTube Shorts 動画生成")
    print(f"  テーマ: {theme}")
    print(f"  目標尺: {total_duration}秒 / {len(scenes)}シーン")
    print(f"{'='*55}\n")

    output_dir = project_dir / "output"
    output_dir.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="yt_shorts_") as tmp:
        tmp_dir = Path(tmp)

        # ── 1. 各シーンの画像→動画クリップ ─────────────────────────────────
        print("[1/4] 画像からケン・バーンズ動画クリップを生成中...")
        clip_paths = []
        for scene in scenes:
            img_path = project_dir / scene["image"]
            if not img_path.exists():
                # 画像がない場合はブラックフレームで代用
                print(f"  ⚠ {img_path.name} が見つかりません → 黒画面で代用")
                img_path = None

            clip_out = tmp_dir / f"clip_{scene['scene']:02d}.mp4"
            dur      = scene.get("duration", total_duration // len(scenes))
            effect   = scene.get("effect", "zoom_in")

            if img_path:
                image_to_clip(img_path, dur, clip_out, effect)
            else:
                # 黒画面クリップ生成
                ff("-f", "lavfi",
                   "-i", f"color=black:s={TARGET_W}x{TARGET_H}:r={FPS}",
                   "-t", str(dur),
                   "-c:v", "libx264", "-preset", "fast",
                   str(clip_out),
                   desc=f"黒画面クリップ（シーン{scene['scene']}）")

            clip_paths.append(clip_out)

        # ── 2. クリップを結合 ────────────────────────────────────────────────
        print("\n[2/4] クリップを結合中...")
        merged_video = tmp_dir / "merged_video.mp4"
        concat_clips(clip_paths, merged_video, tmp_dir)

        # ── 3. 音声処理 ──────────────────────────────────────────────────────
        print("\n[3/4] 音声を処理中...")
        audio_final = None

        if voice_path and voice_path.exists():
            bgm_path = project_dir / "bgm.mp3"
            if not no_bgm and bgm_path.exists():
                audio_final = tmp_dir / "audio_final.aac"
                mix_audio_with_bgm(voice_path, bgm_path, total_duration, audio_final)
            else:
                # 声のみ
                audio_final = tmp_dir / "voice_only.aac"
                ff("-i", str(voice_path),
                   "-c:a", "aac", "-ar", "44100",
                   "-t", str(total_duration),
                   str(audio_final),
                   desc="音声変換")
        else:
            print("  ⚠ 音声ファイルなし → 無音で出力します")
            print("    （台本.txt をもとにNotebookLMで音声を生成し、")
            print("     voice.mp3 としてプロジェクトフォルダに入れてから再実行してください）")

        # ── 4. 最終合成 ──────────────────────────────────────────────────────
        print("\n[4/4] 最終動画を合成中...")
        from datetime import datetime
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = output_dir / f"shorts_{ts}.mp4"

        # テロップ用のシーンデータを準備
        script_path = project_dir / "台本.txt"
        for scene in scenes:
            scene["subtitle"] = f"シーン{scene['scene']}"  # デフォルト

        subs_path = tmp_dir / "subs.ass"
        build_subtitles("", scenes, subs_path)
        subs_escaped = str(subs_path).replace("\\", "/").replace(":", "\\:")

        if audio_final:
            ff("-i", str(merged_video),
               "-i", str(audio_final),
               "-vf", f"ass={subs_escaped}",
               "-map", "0:v", "-map", "1:a",
               "-c:v", "libx264", "-preset", "medium", "-crf", "20",
               "-c:a", "aac", "-b:a", "192k",
               "-pix_fmt", "yuv420p",
               "-movflags", "+faststart",
               "-t", str(total_duration),
               str(out_path),
               desc="最終合成（映像＋音声＋テロップ）")
        else:
            ff("-i", str(merged_video),
               "-vf", f"ass={subs_escaped}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "20",
               "-pix_fmt", "yuv420p",
               "-movflags", "+faststart",
               "-t", str(total_duration),
               str(out_path),
               desc="最終合成（映像＋テロップ、音声なし）")

    size_mb = out_path.stat().st_size / 1_048_576
    print(f"\n{'='*55}")
    print(f"  ✅ 完成！")
    print(f"  出力: {out_path}")
    print(f"  サイズ: {size_mb:.1f} MB")
    print(f"{'='*55}\n")
    return out_path

# ─── エントリーポイント ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="YouTube Shorts 動画自動生成")
    parser.add_argument("--project", required=True,
                        help="GASで生成したプロジェクトフォルダのパス")
    parser.add_argument("--voice", default=None,
                        help="音声ファイルのパス（mp3/wav）。省略可（無音で出力）")
    parser.add_argument("--no-bgm", action="store_true",
                        help="BGMを使用しない")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    voice   = Path(args.voice).resolve() if args.voice else (project / "voice.mp3")

    build_video(project, voice_path=voice if voice.exists() else None, no_bgm=args.no_bgm)

if __name__ == "__main__":
    main()

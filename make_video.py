#!/usr/bin/env python3
"""
YouTube Shorts 動画自動生成スクリプト（VoiceVox / gTTS 音声生成対応）
GASで生成した画像・台本・設定ファイルから動画を全自動生成します

使い方:
    python make_video.py --project ./プロジェクトフォルダ/
    python make_video.py --project ./プロジェクトフォルダ/ --tts gtts
    python make_video.py --project ./プロジェクトフォルダ/ --speaker 1 --no-bgm

TTSエンジン（--ttsで指定）:
    auto     = VoiceVoxが起動していれば使用、なければgTTS（デフォルト）
    voicevox = VoiceVoxのみ（ローカルサーバー必要）
    gtts     = Google TTS（インターネット接続のみ・Colab推奨）

VoiceVoxのキャラクターID（--speakerで指定）:
    1  = ずんだもん（ノーマル）
    3  = ずんだもん（あまあま）
    2  = 四国めたん（ノーマル）
    8  = 春日部つむぎ
    10 = 玄野武宏
    13 = 青山龍星
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# 依存ライブラリを自動インストール
def _ensure_pkg(pkg_import: str, pip_name: str):
    try:
        __import__(pkg_import)
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", pip_name, "-q"], check=True)

_ensure_pkg("requests", "requests")
_ensure_pkg("gtts",     "gtts")

import requests
from gtts import gTTS

# ─── 定数 ─────────────────────────────────────────────────────────────────────

TARGET_W      = 1080
TARGET_H      = 1920
FPS           = 30
BGM_DUCK      = 0.25
BGM_FULL      = 0.7
VOICEVOX_URL    = "http://localhost:50021"
DEFAULT_SPEAKER = 1   # ずんだもん
DEFAULT_TTS     = "auto"

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

# ─── VoiceVox 音声生成 ────────────────────────────────────────────────────────

def check_voicevox() -> bool:
    """VoiceVoxが起動しているか確認"""
    try:
        r = requests.get(f"{VOICEVOX_URL}/version", timeout=3)
        return r.status_code == 200
    except Exception:
        return False

def clean_script_text(text: str) -> str:
    """台本テキストからタグと不要な記号を除去"""
    text = re.sub(r'\[速く\]|\[ゆっくり\]|\[強調\]', '', text)
    text = re.sub(r'\[間\d+\.?\d*\]', '、', text)
    text = re.sub(r'（ここにセリフ）', '', text)
    text = re.sub(r'\(ここにセリフ\)', '', text)
    text = re.sub(r'シーン\d+（[^）]+）:', '', text)
    text = re.sub(r'シーン\d+[：:][^\n]*', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_pause_duration(text: str) -> float:
    """[間X.X]タグから無音の長さを取得"""
    pauses = re.findall(r'\[間(\d+\.?\d*)\]', text)
    return sum(float(p) for p in pauses)

def voicevox_tts(text: str, speaker_id: int, output: Path) -> bool:
    """テキストをVoiceVoxで音声変換してWAVで保存"""
    clean = clean_script_text(text)
    if not clean or len(clean) < 2:
        return False

    try:
        r = requests.post(
            f"{VOICEVOX_URL}/audio_query",
            params={"text": clean, "speaker": speaker_id},
            timeout=30
        )
        r.raise_for_status()
        query = r.json()
        query["speedScale"]  = 1.05
        query["volumeScale"] = 1.2
        query["prePhonemeLength"]  = 0.1
        query["postPhonemeLength"] = 0.1

        r2 = requests.post(
            f"{VOICEVOX_URL}/synthesis",
            params={"speaker": speaker_id},
            json=query,
            timeout=60
        )
        r2.raise_for_status()
        output.write_bytes(r2.content)
        return True

    except Exception as e:
        print(f"  ⚠ VoiceVox エラー: {e}")
        return False

def gtts_tts(text: str, output: Path) -> bool:
    """gTTS（Google TTS）でテキストを音声変換してWAVで保存"""
    clean = clean_script_text(text)
    if not clean or len(clean) < 2:
        return False
    try:
        mp3_path = output.with_suffix(".mp3")
        tts = gTTS(text=clean, lang="ja")
        tts.save(str(mp3_path))
        ff("-i", str(mp3_path),
           "-ar", "44100", "-ac", "1",
           str(output),
           desc=f"gTTS MP3→WAV: {output.name}")
        mp3_path.unlink(missing_ok=True)
        return True
    except Exception as e:
        print(f"  ⚠ gTTS エラー: {e}")
        return False

def generate_silence(duration: float, output: Path) -> None:
    """指定秒数の無音WAVを生成"""
    ff("-f", "lavfi",
       "-i", "anullsrc=r=44100:cl=stereo",
       "-t", str(duration),
       "-c:a", "pcm_s16le",
       str(output),
       desc=f"無音生成 ({duration}秒)")

def generate_voice_from_script(
    script_path: Path,
    scenes: list,
    speaker_id: int,
    output: Path,
    tmp_dir: Path,
    tts_engine: str = "auto",
) -> bool:
    """台本ファイルから全シーン分の音声を生成して結合

    tts_engine: 'voicevox' | 'gtts' | 'auto'
        auto = VoiceVox起動中なら使用、なければgTTSにフォールバック
    """

    use_voicevox = False
    if tts_engine in ("voicevox", "auto"):
        if check_voicevox():
            use_voicevox = True
            print(f"  TTS: VoiceVox（キャラクターID: {speaker_id}）")
        elif tts_engine == "voicevox":
            print("\n" + "="*55)
            print("  ⚠ VoiceVoxが起動していません")
            print("  1. VoiceVoxアプリを開く")
            print("  2. このスクリプトを再実行")
            print("="*55 + "\n")
            return False
        else:
            print("  TTS: VoiceVox未起動 → gTTSにフォールバック")

    if not use_voicevox:
        print("  TTS: gTTS（Google Text-to-Speech）")

    # 台本を読み込む
    if not script_path.exists():
        print(f"  ⚠ 台本ファイルが見つかりません: {script_path}")
        return False

    script_content = script_path.read_text(encoding="utf-8")

    # シーンごとのテキストを抽出
    scene_texts = []
    scene_pattern = re.split(r'シーン\d+[（(][^)）]*[)）]\s*[:：]', script_content)
    if len(scene_pattern) > 1:
        scene_texts = [s.strip() for s in scene_pattern[1:] if s.strip()]

    if not scene_texts:
        lines = [l.strip() for l in script_content.split('\n')
                 if l.strip() and not l.startswith('=') and not l.startswith('テーマ') and not l.startswith('想定')]
        scene_texts = lines[:len(scenes)] if lines else []

    if not scene_texts:
        print("  ⚠ 台本からテキストを抽出できませんでした")
        return False

    print(f"  {len(scene_texts)} シーン分のテキストを取得しました")

    # 各シーンの音声を生成
    wav_parts = []
    for i, text in enumerate(scene_texts[:len(scenes)]):
        scene_wav = tmp_dir / f"voice_scene_{i+1:02d}.wav"

        # [間X.X]タグで無音を挿入
        pause_dur = extract_pause_duration(text)

        if use_voicevox:
            ok = voicevox_tts(text, speaker_id, scene_wav)
        else:
            ok = gtts_tts(text, scene_wav)
        if ok:
            wav_parts.append(scene_wav)
            print(f"    ✓ シーン{i+1} 音声生成完了")

        if pause_dur > 0:
            pause_wav = tmp_dir / f"pause_{i+1:02d}.wav"
            generate_silence(pause_dur, pause_wav)
            wav_parts.append(pause_wav)

    if not wav_parts:
        print("  ⚠ 音声ファイルが1つも生成されませんでした")
        return False

    # 全シーンを結合
    if len(wav_parts) == 1:
        ff("-i", str(wav_parts[0]),
           "-c:a", "aac", "-ar", "44100",
           str(output),
           desc="音声変換")
    else:
        list_file = tmp_dir / "voice_list.txt"
        list_file.write_text("\n".join(f"file '{p}'" for p in wav_parts))
        combined_wav = tmp_dir / "voice_combined.wav"
        ff("-f", "concat", "-safe", "0",
           "-i", str(list_file),
           "-c", "copy",
           str(combined_wav),
           desc="音声クリップを結合")
        ff("-i", str(combined_wav),
           "-c:a", "aac", "-ar", "44100",
           str(output),
           desc="音声をAAC変換")

    print(f"  ✅ 音声生成完了: {output.name}")
    return True

# ─── ケン・バーンズ効果 ────────────────────────────────────────────────────────

def image_to_clip(image_path: Path, duration: float, output: Path, effect: str = "zoom_in") -> None:
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

    ff("-loop", "1",
       "-i", str(image_path),
       "-vf", f"{scale_pad},{zoompan}",
       "-t", str(duration),
       "-an",
       "-c:v", "libx264", "-preset", "fast", "-crf", "22",
       "-pix_fmt", "yuv420p",
       str(output),
       desc=f"ケン・バーンズ ({effect}): {image_path.name}")

# ─── クリップ結合 ──────────────────────────────────────────────────────────────

def concat_clips(clip_paths: list, output: Path, tmp_dir: Path) -> None:
    list_file = tmp_dir / "clip_list.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clip_paths))
    ff("-f", "concat", "-safe", "0",
       "-i", str(list_file),
       "-c", "copy",
       str(output),
       desc="クリップを結合")

# ─── BGMミックス ───────────────────────────────────────────────────────────────

def mix_with_bgm(voice: Path, bgm: Path, total_dur: float, output: Path) -> None:
    fade_start = max(0.0, total_dur - 2.0)
    af = f"volume={BGM_DUCK},afade=t=out:st={fade_start:.2f}:d=2"
    ff("-i", str(voice),
       "-stream_loop", "-1", "-i", str(bgm),
       "-t", str(total_dur),
       "-filter_complex",
       f"[1:a]{af}[bgm];[0:a][bgm]amix=inputs=2:duration=first:normalize=0[aout]",
       "-map", "[aout]",
       "-c:a", "aac", "-ar", "44100",
       str(output),
       desc="音声＋BGMミックス")

# ─── テロップ ──────────────────────────────────────────────────────────────────

def build_subtitles(scenes: list, script_path: Path, output: Path) -> None:
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
        start = _ass_time(t)
        end   = _ass_time(t + dur)
        kw    = scene.get("keyword", f"シーン{scene['scene']}")
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{_wrap(kw, 14)}")
        t += dur

    output.write_text(ass_header + "\n".join(events), encoding="utf-8")

def _ass_time(s: float) -> str:
    h  = int(s // 3600)
    m  = int((s % 3600) // 60)
    sc = int(s % 60)
    cs = int((s % 1) * 100)
    return f"{h}:{m:02d}:{sc:02d}.{cs:02d}"

def _wrap(text: str, n: int = 14) -> str:
    return r"\N".join(text[i:i+n] for i in range(0, len(text), n))

# ─── メインパイプライン ────────────────────────────────────────────────────────

def build_video(
    project_dir: Path,
    speaker_id:  int  = DEFAULT_SPEAKER,
    no_bgm:      bool = False,
    tts_engine:  str  = DEFAULT_TTS,
) -> Path:
    config_path = project_dir / "production_config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"production_config.json が見つかりません: {config_path}")

    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)

    scenes         = config["scenes"]
    total_duration = config["target_duration"]
    theme          = config["theme"]
    script_path    = project_dir / "台本.txt"

    print(f"\n{'='*55}")
    print(f"  YouTube Shorts 動画生成")
    print(f"  テーマ: {theme}")
    print(f"  目標尺: {total_duration}秒 / {len(scenes)}シーン")
    print(f"{'='*55}\n")

    output_dir = project_dir / "output"
    output_dir.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="yt_shorts_") as tmp:
        tmp_dir = Path(tmp)

        # ── 1. 音声を自動生成 ─────────────────────────────────────────────────
        print(f"[1/4] 音声を生成中（TTS: {tts_engine}）...")
        voice_path  = tmp_dir / "voice.aac"
        voice_ready = generate_voice_from_script(
            script_path, scenes, speaker_id, voice_path, tmp_dir, tts_engine
        )
        if not voice_ready:
            print("  → 音声なしで動画を生成します")

        # ── 2. 画像→ケン・バーンズ動画クリップ ──────────────────────────────
        print("\n[2/4] 画像からケン・バーンズ動画クリップを生成中...")
        clip_paths = []
        for scene in scenes:
            img_path = project_dir / scene["image"]
            clip_out = tmp_dir / f"clip_{scene['scene']:02d}.mp4"
            dur      = scene.get("duration", total_duration // len(scenes))
            effect   = scene.get("effect", "zoom_in")

            if img_path.exists():
                image_to_clip(img_path, dur, clip_out, effect)
            else:
                print(f"  ⚠ {img_path.name} なし → 黒画面で代用")
                ff("-f", "lavfi",
                   "-i", f"color=black:s={TARGET_W}x{TARGET_H}:r={FPS}",
                   "-t", str(dur),
                   "-c:v", "libx264", "-preset", "fast",
                   str(clip_out),
                   desc=f"黒画面（シーン{scene['scene']}）")
            clip_paths.append(clip_out)

        # ── 3. クリップ結合 ───────────────────────────────────────────────────
        print("\n[3/4] クリップを結合中...")
        merged_video = tmp_dir / "merged.mp4"
        concat_clips(clip_paths, merged_video, tmp_dir)

        # ── 4. 最終合成（映像＋音声＋テロップ） ──────────────────────────────
        print("\n[4/4] 最終動画を合成中...")

        # BGMミックス
        audio_final = None
        if voice_ready:
            bgm_path = project_dir / "bgm.mp3"
            if not no_bgm and bgm_path.exists():
                audio_final = tmp_dir / "audio_final.aac"
                mix_with_bgm(voice_path, bgm_path, total_duration, audio_final)
            else:
                audio_final = voice_path

        # テロップ
        subs_path   = tmp_dir / "subs.ass"
        build_subtitles(scenes, script_path, subs_path)
        subs_escaped = str(subs_path).replace("\\", "/").replace(":", "\\:")

        from datetime import datetime
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = output_dir / f"shorts_{ts}.mp4"

        base_cmd = [
            "-i", str(merged_video),
            "-vf", f"ass={subs_escaped}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-t", str(total_duration),
        ]

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
            ff(*base_cmd, str(out_path),
               desc="最終合成（映像＋テロップのみ）")

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
    parser.add_argument("--project",  required=True, help="プロジェクトフォルダのパス")
    parser.add_argument("--tts",      default=DEFAULT_TTS,
                        choices=["auto", "voicevox", "gtts"],
                        help="TTSエンジン（auto=自動判定, voicevox, gtts）")
    parser.add_argument("--speaker",  type=int, default=DEFAULT_SPEAKER,
                        help="VoiceVoxキャラクターID（デフォルト: 1=ずんだもん）")
    parser.add_argument("--no-bgm",  action="store_true", help="BGMを使用しない")
    args = parser.parse_args()

    build_video(
        project_dir = Path(args.project).resolve(),
        speaker_id  = args.speaker,
        no_bgm      = args.no_bgm,
        tts_engine  = args.tts,
    )

if __name__ == "__main__":
    main()

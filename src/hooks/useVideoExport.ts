import { useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { VideoProject, Telop, TelopStyle } from '../types';

const CORE_CDN    = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const EX_WIDTH    = 1280;
const EX_HEIGHT   = 720;
const EX_FPS      = 30;

export type ExportStatus = 'idle' | 'loading-ffmpeg' | 'recording' | 'encoding' | 'done' | 'error';

export interface ExportState {
  status: ExportStatus;
  progress: number;
  phase: string;
  error: string | null;
}

function yFromPreset(pos: TelopStyle['position']): number {
  return pos === 'top' ? 10 : pos === 'center' ? 50 : 85;
}

function drawTelops(
  ctx: CanvasRenderingContext2D,
  telops: Telop[],
  clipTime: number,
) {
  for (const t of telops) {
    if (clipTime < t.startTime || clipTime > t.endTime) continue;
    const xPx = ((t.style.xPct ?? 50) / 100) * EX_WIDTH;
    const yPx = ((t.style.yPct ?? yFromPreset(t.style.position)) / 100) * EX_HEIGHT;
    const fs   = t.style.fontSize;
    ctx.font = `${t.style.italic ? 'italic ' : ''}${t.style.bold ? 'bold ' : ''}${fs}px "Hiragino Sans","Noto Sans JP",sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const lines = t.text.split('\n');
    const lineH = fs * 1.4;
    lines.forEach((line, i) => {
      const ly  = yPx - ((lines.length - 1) / 2) * lineH + i * lineH;
      const tw  = ctx.measureText(line).width;
      const px = 10; const py = 6;
      ctx.fillStyle = t.style.backgroundColor;
      ctx.fillRect(xPx - tw / 2 - px, ly - fs / 2 - py, tw + px * 2, fs + py * 2);
      ctx.fillStyle = t.style.color;
      ctx.fillText(line, xPx, ly);
    });
  }
}

export function useVideoExport(
  clipUrls:  Map<string, string>,
  imageUrls: Map<string, string>,
  bgmUrl:    string | null,
) {
  const ffmpegRef  = useRef<FFmpeg | null>(null);
  const animIdRef  = useRef(0);
  const cancelRef  = useRef(false);

  const [state, setState] = useState<ExportState>({
    status: 'idle', progress: 0, phase: '', error: null,
  });
  const update = (patch: Partial<ExportState>) =>
    setState(prev => ({ ...prev, ...patch }));

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ff = new FFmpeg();
    // progress fires during encoding phase (mapped to 50–100%)
    ff.on('progress', ({ progress }) =>
      update({ progress: 50 + Math.round(progress * 50) }),
    );
    await ff.load({
      coreURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ff;
    return ff;
  };

  const exportVideo = useCallback(async (project: VideoProject) => {
    if (!project.clips.length) return;
    cancelRef.current = false;
    update({ status: 'loading-ffmpeg', progress: 0, phase: 'FFmpegを読み込み中…', error: null });

    try {
      const ffmpeg = await loadFFmpeg();
      if (cancelRef.current) return;

      update({ status: 'recording', progress: 5, phase: '録画を準備中…' });

      // ── Canvas ──────────────────────────────────────────────────────────
      const canvas = document.createElement('canvas');
      canvas.width  = EX_WIDTH;
      canvas.height = EX_HEIGHT;
      const ctx = canvas.getContext('2d')!;

      // ── Web Audio ────────────────────────────────────────────────────────
      const audioCtx  = new AudioContext({ sampleRate: 44100 });
      const audioDest = audioCtx.createMediaStreamDestination();
      const masterGain = audioCtx.createGain();
      masterGain.connect(audioDest);

      // Video element (audio routed through Web Audio)
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.crossOrigin  = 'anonymous';
      const videoSrc = audioCtx.createMediaElementSource(videoEl);
      videoSrc.connect(masterGain);

      // BGM
      let bgmEl:   HTMLAudioElement | null = null;
      let bgmGain: GainNode | null = null;
      if (bgmUrl && project.bgm) {
        bgmEl = new Audio(bgmUrl);
        bgmEl.loop = project.bgm.loop;
        bgmEl.crossOrigin = 'anonymous';
        const bgmSrc = audioCtx.createMediaElementSource(bgmEl);
        bgmGain = audioCtx.createGain();
        bgmGain.gain.value = project.bgm.volume;
        bgmSrc.connect(bgmGain);
        bgmGain.connect(masterGain);
      }

      // ── MediaRecorder ────────────────────────────────────────────────────
      const canvasStream = canvas.captureStream(EX_FPS);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : ''; // Safari may use mp4

      const recOptions: MediaRecorderOptions = { videoBitsPerSecond: 8_000_000 };
      if (mimeType) recOptions.mimeType = mimeType;

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(combined, recOptions);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      const stopRecorder = (): Promise<Blob> =>
        new Promise(resolve => {
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          recorder.stop();
        });

      // ── Draw loop ────────────────────────────────────────────────────────
      // Runs at RAF rate; clip frames drawn here, telops injected per-clip
      let currentTelops: Telop[] = [];
      let currentClipTime = 0; // updated by video timeupdate

      const drawLoop = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, EX_WIDTH, EX_HEIGHT);
        if (videoEl.readyState >= 2) {
          ctx.drawImage(videoEl, 0, 0, EX_WIDTH, EX_HEIGHT);
          currentClipTime = videoEl.currentTime;
        }
        drawTelops(ctx, currentTelops, currentClipTime);
        animIdRef.current = requestAnimationFrame(drawLoop);
      };

      // ── Build ordered segment list ────────────────────────────────────────
      type Seg =
        | { kind: 'clip';  clip: typeof project.clips[0]; telops: Telop[] }
        | { kind: 'image'; id: string; name: string; duration: number };

      const sortedClips = [...project.clips].sort((a, b) => a.order - b.order);
      const segs: Seg[] = [];

      project.imageInserts
        .filter(i => i.afterClipId === null)
        .sort((a, b) => a.order - b.order)
        .forEach(img => segs.push({ kind: 'image', id: img.id, name: img.name, duration: img.displayDuration }));

      sortedClips.forEach(clip => {
        segs.push({ kind: 'clip', clip, telops: project.telops.filter(t => t.clipId === clip.id) });
        project.imageInserts
          .filter(i => i.afterClipId === clip.id)
          .sort((a, b) => a.order - b.order)
          .forEach(img => segs.push({ kind: 'image', id: img.id, name: img.name, duration: img.displayDuration }));
      });

      const totalDuration = segs.reduce((s, seg) => {
        if (seg.kind === 'clip') {
          const c = seg.clip;
          const effDur = ((c.endTrim > 0 ? c.endTrim : c.duration) - c.startTrim) / c.speed;
          return s + (c.targetDuration != null ? Math.max(effDur, c.targetDuration) : effDur);
        }
        return s + seg.duration;
      }, 0);

      // ── Start ────────────────────────────────────────────────────────────
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      recorder.start(500);
      drawLoop();

      if (bgmEl && bgmGain && project.bgm) {
        const fadeIn = project.bgm.fadeInDuration;
        if (fadeIn > 0) {
          bgmGain.gain.setValueAtTime(0, audioCtx.currentTime);
          bgmGain.gain.linearRampToValueAtTime(project.bgm.volume, audioCtx.currentTime + fadeIn);
        }
        bgmEl.play().catch(() => {});
      }

      let elapsed = 0;

      for (let si = 0; si < segs.length; si++) {
        if (cancelRef.current) break;
        const seg = segs[si];

        if (seg.kind === 'clip') {
          const { clip, telops } = seg;
          const url = clipUrls.get(clip.id);
          if (!url) throw new Error(`クリップ "${clip.name}" のファイルが読み込まれていません`);

          const effDur = ((clip.endTrim > 0 ? clip.endTrim : clip.duration) - clip.startTrim) / clip.speed;
          const totalClipDur = clip.targetDuration != null ? Math.max(effDur, clip.targetDuration) : effDur;
          currentTelops = telops;
          update({
            phase: `録画中 ${si + 1}/${segs.length}: ${clip.name}`,
            progress: 5 + Math.round((elapsed / totalDuration) * 45),
          });

          await new Promise<void>((resolve, reject) => {
            videoEl.src = url;
            videoEl.playbackRate = clip.speed;

            // Use interval to detect trim-end reliably
            let endCheckId = 0;
            const cleanup = () => {
              clearInterval(endCheckId);
              videoEl.pause();
            };

            videoEl.addEventListener('loadedmetadata', () => {
              videoEl.currentTime = clip.startTrim;
              videoEl.play().catch(reject);

              const endAt = clip.endTrim > 0 ? clip.endTrim : Infinity;
              endCheckId = window.setInterval(() => {
                if (videoEl.ended || videoEl.currentTime >= endAt - 0.08) {
                  cleanup();
                  resolve();
                }
              }, 80);
            }, { once: true });

            videoEl.onerror = () => { cleanup(); reject(new Error(`動画の読み込みに失敗: ${clip.name}`)); };
          });

          // Freeze last frame for targetDuration stretch
          const freezeMs = (totalClipDur - effDur) * 1000;
          if (freezeMs > 100 && !cancelRef.current) {
            update({ phase: `静止フレーム延長中 ${si + 1}/${segs.length}: ${clip.name}` });
            await new Promise(r => setTimeout(r, freezeMs));
          }

          elapsed += totalClipDur;

        } else {
          // Image segment
          update({
            phase: `画像表示中 ${si + 1}/${segs.length}: ${seg.name}`,
            progress: 5 + Math.round((elapsed / totalDuration) * 45),
          });

          currentTelops = [];
          videoEl.pause();

          await new Promise<void>(resolve => {
            const url = imageUrls.get(seg.id);
            if (!url) { setTimeout(resolve, seg.duration * 1000); return; }

            const img = new window.Image();
            img.onload = () => {
              const scale = Math.min(EX_WIDTH / img.width, EX_HEIGHT / img.height);
              const dw = img.width * scale;
              const dh = img.height * scale;
              const dx = (EX_WIDTH - dw) / 2;
              const dy = (EX_HEIGHT - dh) / 2;
              // Single draw (the RAF loop only draws video; blank for image mode)
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, EX_WIDTH, EX_HEIGHT);
              ctx.drawImage(img, dx, dy, dw, dh);
              // Keep redrawing the still image in RAF
              currentTelops = [];
              setTimeout(resolve, seg.duration * 1000);
            };
            img.onerror = () => setTimeout(resolve, seg.duration * 1000);
            img.src = url;
          });

          elapsed += seg.duration;
        }
      }

      // BGM fade-out
      if (bgmGain && bgmEl && project.bgm?.fadeOutDuration) {
        const fo = project.bgm.fadeOutDuration;
        bgmGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fo);
        await new Promise(r => setTimeout(r, fo * 1000));
      }
      bgmEl?.pause();

      // Stop canvas loop + recorder
      cancelAnimationFrame(animIdRef.current);
      update({ phase: 'エンコード準備中…', progress: 50 });
      const rawBlob = await stopRecorder();
      audioCtx.close();

      if (cancelRef.current) {
        update({ status: 'idle', progress: 0, phase: '', error: null });
        return;
      }

      // ── FFmpeg: WebM → MP4 ───────────────────────────────────────────────
      // If browser already produced mp4 (Safari), skip re-encode
      const needsConvert = !rawBlob.type.includes('mp4');

      if (needsConvert) {
        update({ status: 'encoding', phase: 'MP4に変換中… (しばらくお待ちください)', progress: 50 });
        await ffmpeg.writeFile('input.webm', await fetchFile(rawBlob));
        await ffmpeg.exec([
          '-i', 'input.webm',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          'output.mp4',
        ]);
        const data = await ffmpeg.readFile('output.mp4') as Uint8Array;
        download(new Blob([data.buffer], { type: 'video/mp4' }), project.name);
      } else {
        download(rawBlob, project.name);
      }

      update({ status: 'done', progress: 100, phase: '書き出し完了！' });

    } catch (e) {
      cancelAnimationFrame(animIdRef.current);
      update({ status: 'error', error: e instanceof Error ? e.message : String(e), phase: '' });
    }
  }, [clipUrls, imageUrls, bgmUrl]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    cancelAnimationFrame(animIdRef.current);
  }, []);

  const reset = useCallback(() =>
    setState({ status: 'idle', progress: 0, phase: '', error: null }),
  []);

  return { exportVideo, cancel, reset, ...state };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${name || 'export'}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

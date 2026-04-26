import { useRef, useEffect } from 'react';
import type { VideoClipData, Telop, ImageInsert } from '../types';

const PX_PER_SEC = 32;

interface Props {
  sortedClips: VideoClipData[];
  imageInserts: ImageInsert[];
  telops: Telop[];
  currentClipIndex: number;
  currentTime: number;
  selectedClipId: string | null;
  onClipClick: (id: string) => void;
}

// Effective playback duration of a clip (trimmed + speed + optional stretch)
function clipEffDuration(clip: VideoClipData): number {
  const raw = (clip.endTrim > 0 ? clip.endTrim : clip.duration) - clip.startTrim;
  const playbackDur = Math.max(0, raw / clip.speed);
  return clip.targetDuration != null ? Math.max(playbackDur, clip.targetDuration) : playbackDur;
}

// Build the ordered sequence of segments: clips interleaved with images
interface ClipSeg { kind: 'clip'; clip: VideoClipData; startSec: number; }
interface ImgSeg  { kind: 'image'; insert: ImageInsert; startSec: number; }
type Segment = ClipSeg | ImgSeg;

function buildSegments(sortedClips: VideoClipData[], imageInserts: ImageInsert[]): Segment[] {
  const segs: Segment[] = [];
  let t = 0;

  // Images before any clip (afterClipId = null)
  imageInserts
    .filter(img => img.afterClipId === null)
    .sort((a, b) => a.order - b.order)
    .forEach(img => {
      segs.push({ kind: 'image', insert: img, startSec: t });
      t += img.displayDuration;
    });

  sortedClips.forEach(clip => {
    segs.push({ kind: 'clip', clip, startSec: t });
    t += clipEffDuration(clip);

    imageInserts
      .filter(img => img.afterClipId === clip.id)
      .sort((a, b) => a.order - b.order)
      .forEach(img => {
        segs.push({ kind: 'image', insert: img, startSec: t });
        t += img.displayDuration;
      });
  });

  return segs;
}

// Absolute playhead time in the project
function playheadSec(
  sortedClips: VideoClipData[],
  imageInserts: ImageInsert[],
  currentClipIndex: number,
  currentTime: number,
): number {
  const segs = buildSegments(sortedClips, imageInserts);
  const playingClip = sortedClips[currentClipIndex];
  if (!playingClip) return 0;

  const clipSeg = segs.find(s => s.kind === 'clip' && s.clip.id === playingClip.id) as ClipSeg | undefined;
  if (!clipSeg) return 0;

  const elapsed = (currentTime - playingClip.startTrim) / playingClip.speed;
  return clipSeg.startSec + Math.max(0, elapsed);
}

export default function VideoTimeline({
  sortedClips,
  imageInserts,
  telops,
  currentClipIndex,
  currentTime,
  selectedClipId,
  onClipClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const segs = buildSegments(sortedClips, imageInserts);
  const totalSec = segs.reduce((acc, s) => {
    return acc + (s.kind === 'clip' ? clipEffDuration(s.clip) : s.insert.displayDuration);
  }, 0);
  const totalWidth = Math.max(totalSec * PX_PER_SEC, 200);
  const headSec = playheadSec(sortedClips, imageInserts, currentClipIndex, currentTime);
  const headPx = headSec * PX_PER_SEC;

  // Auto-scroll to keep playhead in view
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const margin = 60;
    if (headPx < el.scrollLeft + margin || headPx > el.scrollLeft + el.clientWidth - margin) {
      el.scrollLeft = Math.max(0, headPx - el.clientWidth / 2);
    }
  }, [headPx]);

  if (sortedClips.length === 0 && imageInserts.length === 0) return null;

  // Time ruler ticks every 5 s
  const tickInterval = totalSec > 120 ? 30 : totalSec > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSec; t += tickInterval) ticks.push(t);

  return (
    <div className="tl-wrap">
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: totalWidth }}>

          {/* Ruler */}
          <div className="tl-ruler">
            {ticks.map(t => (
              <div key={t} className="tl-tick" style={{ left: t * PX_PER_SEC }}>
                <span>{formatSec(t)}</span>
              </div>
            ))}
          </div>

          {/* Video / Image track */}
          <div className="tl-track tl-track-clips">
            {segs.map((seg, i) => {
              if (seg.kind === 'clip') {
                const w = clipEffDuration(seg.clip) * PX_PER_SEC;
                const isSelected = seg.clip.id === selectedClipId;
                const isPlaying  = sortedClips[currentClipIndex]?.id === seg.clip.id;
                return (
                  <div
                    key={seg.clip.id}
                    className={`tl-clip${isSelected ? ' selected' : ''}${isPlaying ? ' playing' : ''}`}
                    style={{ left: seg.startSec * PX_PER_SEC, width: Math.max(w, 4) }}
                    onClick={() => onClipClick(seg.clip.id)}
                    title={seg.clip.name}
                  >
                    <span className="tl-clip-label">{seg.clip.name}</span>
                    {seg.clip.speed !== 1 && (
                      <span className="tl-speed-badge">×{seg.clip.speed}</span>
                    )}
                  </div>
                );
              } else {
                const w = seg.insert.displayDuration * PX_PER_SEC;
                return (
                  <div
                    key={seg.insert.id}
                    className="tl-image"
                    style={{ left: seg.startSec * PX_PER_SEC, width: Math.max(w, 4) }}
                    title={seg.insert.name}
                  >
                    <span className="tl-clip-label">📷</span>
                  </div>
                );
              }
            })}
          </div>

          {/* Telop track */}
          {telops.length > 0 && (
            <div className="tl-track tl-track-telops">
              {telops.map(t => {
                const clipSeg = segs.find(s => s.kind === 'clip' && s.clip.id === t.clipId) as ClipSeg | undefined;
                if (!clipSeg) return null;
                const clip = clipSeg.clip;
                const left = (clipSeg.startSec + (t.startTime - clip.startTrim) / clip.speed) * PX_PER_SEC;
                const width = ((t.endTime - t.startTime) / clip.speed) * PX_PER_SEC;
                return (
                  <div
                    key={t.id}
                    className="tl-telop"
                    style={{ left, width: Math.max(width, 4) }}
                    title={t.text}
                  >
                    <span className="tl-clip-label">{t.text.slice(0, 12)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* BGM track placeholder */}
          {totalSec > 0 && (
            <div className="tl-track tl-track-bgm">
              <div className="tl-bgm-bar" style={{ width: totalWidth }} />
            </div>
          )}

          {/* Playhead */}
          <div className="tl-playhead" style={{ left: headPx }} />
        </div>
      </div>

      {/* Track labels */}
      <div className="tl-labels">
        <div className="tl-label tl-label-ruler" />
        <div className="tl-label">映像</div>
        {telops.length > 0 && <div className="tl-label">テロップ</div>}
        {totalSec > 0 && <div className="tl-label">BGM</div>}
      </div>
    </div>
  );
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

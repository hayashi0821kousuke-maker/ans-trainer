import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Pause, Plus, Trash2, Music, Image, Type, Zap, ChevronDown, ChevronUp, Volume2 } from 'lucide-react';
import type { VideoClipData, Telop, ImageInsert, BGMTrack, VideoProject, TelopStyle } from '../types';
import { generateId } from '../defaults';

const DEFAULT_TELOP_STYLE: TelopStyle = {
  fontSize: 20,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.6)',
  position: 'bottom',
  bold: true,
  italic: false,
};

function newProject(): VideoProject {
  return {
    id: generateId(),
    name: '新規プロジェクト',
    clips: [],
    telops: [],
    imageInserts: [],
    bgm: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function VideoEditor() {
  const [project, setProject] = useState<VideoProject>(newProject);
  const [clipFiles, setClipFiles] = useState<Map<string, File>>(new Map());
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [bgmFile, setBgmFile] = useState<File | null>(null);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'clips' | 'telops' | 'images' | 'bgm' | 'speed'>('clips');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clipObjectUrls = useRef<Map<string, string>>(new Map());
  // State (not ref) so that thumbnail re-renders when images are loaded
  const [imageUrlMap, setImageUrlMap] = useState<Map<string, string>>(new Map());
  const bgmObjectUrl = useRef<string | null>(null);

  const updateProject = (fn: (p: VideoProject) => VideoProject) => {
    setProject(prev => ({ ...fn(prev), updatedAt: new Date().toISOString() }));
  };

  // Build object URLs when files change; clean up on unmount
  useEffect(() => {
    const newUrls: Array<[string, string]> = [];
    clipFiles.forEach((file, id) => {
      if (!clipObjectUrls.current.has(id)) {
        const url = URL.createObjectURL(file);
        clipObjectUrls.current.set(id, url);
        newUrls.push([id, url]);
      }
    });
    return () => {
      newUrls.forEach(([, url]) => URL.revokeObjectURL(url));
    };
  }, [clipFiles]);

  useEffect(() => {
    const newEntries: Array<[string, string]> = [];
    imageFiles.forEach((file, id) => {
      if (!imageUrlMap.has(id)) {
        newEntries.push([id, URL.createObjectURL(file)]);
      }
    });
    if (newEntries.length > 0) {
      setImageUrlMap(prev => {
        const next = new Map(prev);
        newEntries.forEach(([id, url]) => next.set(id, url));
        return next;
      });
    }
    return () => {
      newEntries.forEach(([, url]) => URL.revokeObjectURL(url));
    };
  }, [imageFiles]);

  useEffect(() => {
    if (bgmFile) {
      if (bgmObjectUrl.current) URL.revokeObjectURL(bgmObjectUrl.current);
      bgmObjectUrl.current = URL.createObjectURL(bgmFile);
      if (audioRef.current) {
        audioRef.current.src = bgmObjectUrl.current;
        audioRef.current.volume = project.bgm?.volume ?? 0.5;
        audioRef.current.loop = project.bgm?.loop ?? true;
      }
    }
  }, [bgmFile]);

  // Sorted clips
  const sortedClips = [...project.clips].sort((a, b) => a.order - b.order);
  const selectedClip = project.clips.find(c => c.id === selectedClipId) ?? null;

  // Active clip telops
  const activeClipTelops = selectedClipId
    ? project.telops.filter(t => t.clipId === selectedClipId)
    : [];

  // Current playing clip
  const playingClip = sortedClips[currentClipIndex] ?? null;

  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    if (!videoRef.current || !playingClip) return;
    const url = clipObjectUrls.current.get(playingClip.id);
    if (url) {
      videoRef.current.src = url;
      videoRef.current.playbackRate = playingClip.speed;
      videoRef.current.currentTime = playingClip.startTrim;
      if (isPlayingRef.current) videoRef.current.play().catch(() => null);
    }
  }, [currentClipIndex, playingClip?.id]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current || !playingClip) return;
    setCurrentTime(videoRef.current.currentTime);
    const endAt = playingClip.endTrim > 0 ? playingClip.endTrim : videoRef.current.duration;
    if (videoRef.current.currentTime >= endAt) {
      if (currentClipIndex + 1 < sortedClips.length) {
        setCurrentClipIndex(i => i + 1);
      } else {
        setIsPlaying(false);
        setCurrentClipIndex(0);
        videoRef.current.currentTime = sortedClips[0]?.startTrim ?? 0;
      }
    }
  }, [currentClipIndex, playingClip, sortedClips]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      audioRef.current?.pause();
    } else {
      videoRef.current.play();
      if (bgmFile) audioRef.current?.play();
    }
    setIsPlaying(p => !p);
  };

  const handleClipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newClips: VideoClipData[] = [];
    const newFileMap = new Map(clipFiles);

    for (const file of files) {
      const id = generateId();
      newFileMap.set(id, file);
      const duration = await getVideoDuration(file);
      newClips.push({
        id,
        name: file.name,
        duration,
        speed: 1.0,
        order: project.clips.length + newClips.length,
        startTrim: 0,
        endTrim: 0,
      });
    }
    setClipFiles(newFileMap);
    updateProject(p => ({ ...p, clips: [...p.clips, ...newClips] }));
    e.target.value = '';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newImageMap = new Map(imageFiles);
    const newInserts: ImageInsert[] = [];

    files.forEach(file => {
      const id = generateId();
      newImageMap.set(id, file);
      newInserts.push({
        id,
        afterClipId: selectedClipId,
        name: file.name,
        displayDuration: 3,
        order: project.imageInserts.length + newInserts.length,
      });
    });
    setImageFiles(newImageMap);
    updateProject(p => ({ ...p, imageInserts: [...p.imageInserts, ...newInserts] }));
    e.target.value = '';
  };

  const handleBGMUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgmFile(file);
    updateProject(p => ({
      ...p,
      bgm: {
        id: generateId(),
        name: file.name,
        volume: 0.5,
        loop: true,
        fadeInDuration: 0,
        fadeOutDuration: 0,
      },
    }));
    e.target.value = '';
  };

  const removeClip = (id: string) => {
    updateProject(p => ({
      ...p,
      clips: p.clips.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i })),
      telops: p.telops.filter(t => t.clipId !== id),
    }));
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const addTelop = () => {
    if (!selectedClipId) return;
    const telop: Telop = {
      id: generateId(),
      clipId: selectedClipId,
      text: 'テロップを入力',
      startTime: 0,
      endTime: selectedClip?.duration ?? 3,
      style: { ...DEFAULT_TELOP_STYLE },
    };
    updateProject(p => ({ ...p, telops: [...p.telops, telop] }));
  };

  const updateTelop = (id: string, patch: Partial<Telop>) => {
    updateProject(p => ({
      ...p,
      telops: p.telops.map(t => t.id === id ? { ...t, ...patch } : t),
    }));
  };

  const removeTelop = (id: string) => {
    updateProject(p => ({ ...p, telops: p.telops.filter(t => t.id !== id) }));
  };

  const updateClipSpeed = (id: string, speed: number) => {
    updateProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === id ? { ...c, speed } : c),
    }));
    if (videoRef.current && playingClip?.id === id) {
      videoRef.current.playbackRate = speed;
    }
  };

  const updateClipTrim = (id: string, field: 'startTrim' | 'endTrim', val: number) => {
    updateProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === id ? { ...c, [field]: val } : c),
    }));
  };

  const updateBGM = (patch: Partial<BGMTrack>) => {
    updateProject(p => ({
      ...p,
      bgm: p.bgm ? { ...p.bgm, ...patch } : null,
    }));
    if (audioRef.current && patch.volume !== undefined) {
      audioRef.current.volume = patch.volume;
    }
    if (audioRef.current && patch.loop !== undefined) {
      audioRef.current.loop = patch.loop;
    }
  };

  const updateImageInsert = (id: string, patch: Partial<ImageInsert>) => {
    updateProject(p => ({
      ...p,
      imageInserts: p.imageInserts.map(img => img.id === id ? { ...img, ...patch } : img),
    }));
  };

  const removeImageInsert = (id: string) => {
    updateProject(p => ({
      ...p,
      imageInserts: p.imageInserts.filter(img => img.id !== id),
    }));
  };

  // Current telops to overlay on preview
  const overlayTelops = playingClip
    ? project.telops.filter(t =>
        t.clipId === playingClip.id &&
        currentTime >= t.startTime &&
        currentTime <= t.endTime
      )
    : [];

  return (
    <div className="video-editor">
      <div className="page-header">
        <h1 className="page-title">動画編集</h1>
        <input
          className="project-name-input"
          value={project.name}
          onChange={e => updateProject(p => ({ ...p, name: e.target.value }))}
        />
      </div>

      {/* Preview */}
      <div className="ve-preview">
        <div className="ve-video-wrap">
          {sortedClips.length === 0 ? (
            <div className="ve-empty-preview">
              <Upload size={32} />
              <p>動画をアップロードしてください</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="ve-video"
                onTimeUpdate={handleVideoTimeUpdate}
                playsInline
              />
              {overlayTelops.map(t => (
                <div
                  key={t.id}
                  className={`ve-telop-overlay ve-telop-${t.style.position}`}
                  style={{
                    fontSize: t.style.fontSize,
                    color: t.style.color,
                    background: t.style.backgroundColor,
                    fontWeight: t.style.bold ? 700 : 400,
                    fontStyle: t.style.italic ? 'italic' : 'normal',
                  }}
                >
                  {t.text}
                </div>
              ))}
            </>
          )}
        </div>

        {sortedClips.length > 0 && (
          <div className="ve-controls">
            <button className="ve-play-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <span className="ve-clip-label">
              {playingClip?.name ?? '—'} ({currentClipIndex + 1}/{sortedClips.length})
            </span>
          </div>
        )}

        <audio ref={audioRef} />
      </div>

      {/* Panel tabs */}
      <div className="ve-panel-tabs">
        {([
          ['clips', Upload, 'クリップ'],
          ['telops', Type, 'テロップ'],
          ['speed', Zap, '速度'],
          ['images', Image, '画像'],
          ['bgm', Music, 'BGM'],
        ] as [typeof activePanel, any, string][]).map(([id, Icon, label]) => (
          <button
            key={id}
            className={`ve-panel-tab${activePanel === id ? ' active' : ''}`}
            onClick={() => setActivePanel(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="ve-panel">

        {/* ── Clips ── */}
        {activePanel === 'clips' && (
          <div className="ve-section">
            <div className="ve-section-header">
              <span>動画クリップ ({sortedClips.length})</span>
              <label className="btn-icon-sm btn-accent">
                <Plus size={14} /> 追加
                <input type="file" accept="video/*" multiple hidden onChange={handleClipUpload} />
              </label>
            </div>
            {sortedClips.length === 0 && (
              <p className="ve-hint">動画ファイルを追加してください</p>
            )}
            {sortedClips.map((clip, idx) => (
              <div
                key={clip.id}
                className={`ve-clip-card${selectedClipId === clip.id ? ' selected' : ''}`}
                onClick={() => setSelectedClipId(clip.id)}
              >
                <div className="ve-clip-thumb">
                  <Play size={16} />
                </div>
                <div className="ve-clip-info">
                  <p className="ve-clip-name">{clip.name}</p>
                  <p className="ve-clip-meta">
                    {formatTime(clip.duration)} · ×{clip.speed}
                  </p>
                </div>
                <span className="ve-clip-num">#{idx + 1}</span>
                <button className="btn-icon-sm btn-danger" onClick={e => { e.stopPropagation(); removeClip(clip.id); }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Telops ── */}
        {activePanel === 'telops' && (
          <div className="ve-section">
            {!selectedClipId ? (
              <p className="ve-hint">クリップタブでクリップを選択してください</p>
            ) : (
              <>
                <div className="ve-section-header">
                  <span>テロップ – {selectedClip?.name}</span>
                  <button className="btn-icon-sm btn-accent" onClick={addTelop}>
                    <Plus size={14} /> 追加
                  </button>
                </div>
                {activeClipTelops.length === 0 && (
                  <p className="ve-hint">テロップがありません。追加してください</p>
                )}
                {activeClipTelops.map(telop => (
                  <TelopCard
                    key={telop.id}
                    telop={telop}
                    clipDuration={selectedClip?.duration ?? 10}
                    onChange={patch => updateTelop(telop.id, patch)}
                    onRemove={() => removeTelop(telop.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Speed ── */}
        {activePanel === 'speed' && (
          <div className="ve-section">
            <p className="ve-section-label">各クリップの再生速度を調整します</p>
            {sortedClips.length === 0 && <p className="ve-hint">クリップがありません</p>}
            {sortedClips.map(clip => (
              <div key={clip.id} className="ve-speed-card">
                <p className="ve-clip-name">{clip.name}</p>
                <div className="ve-speed-row">
                  {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 4.0].map(s => (
                    <button
                      key={s}
                      className={`ve-speed-btn${clip.speed === s ? ' active' : ''}`}
                      onClick={() => updateClipSpeed(clip.id, s)}
                    >
                      ×{s}
                    </button>
                  ))}
                </div>
                <div className="ve-trim-row">
                  <label>
                    開始 (秒)
                    <input
                      type="number" min={0} max={clip.duration} step={0.1}
                      value={clip.startTrim}
                      onChange={e => updateClipTrim(clip.id, 'startTrim', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    終了 (0=末尾)
                    <input
                      type="number" min={0} max={clip.duration} step={0.1}
                      value={clip.endTrim}
                      onChange={e => updateClipTrim(clip.id, 'endTrim', Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Images ── */}
        {activePanel === 'images' && (
          <div className="ve-section">
            <div className="ve-section-header">
              <span>挿入画像 ({project.imageInserts.length})</span>
              <label className="btn-icon-sm btn-accent">
                <Plus size={14} /> 追加
                <input type="file" accept="image/*" multiple hidden onChange={handleImageUpload} />
              </label>
            </div>
            <p className="ve-hint-sm">クリップタブで選択したクリップの後に挿入されます</p>
            {project.imageInserts.length === 0 && <p className="ve-hint">画像がありません</p>}
            {project.imageInserts.map(img => (
              <div key={img.id} className="ve-img-card">
                <div className="ve-img-thumb">
                  {imageUrlMap.has(img.id)
                    ? <img src={imageUrlMap.get(img.id)} alt={img.name} />
                    : <Image size={20} />}
                </div>
                <div className="ve-img-info">
                  <p className="ve-clip-name">{img.name}</p>
                  <label className="ve-inline-label">
                    表示時間 (秒)
                    <input
                      type="number" min={0.5} max={60} step={0.5}
                      value={img.displayDuration}
                      onChange={e => updateImageInsert(img.id, { displayDuration: Number(e.target.value) })}
                    />
                  </label>
                  <label className="ve-inline-label">
                    挿入位置 (クリップ後)
                    <select
                      value={img.afterClipId ?? ''}
                      onChange={e => updateImageInsert(img.id, { afterClipId: e.target.value || null })}
                    >
                      <option value="">先頭</option>
                      {sortedClips.map((c, i) => (
                        <option key={c.id} value={c.id}>クリップ {i + 1}: {c.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="btn-icon-sm btn-danger" onClick={() => removeImageInsert(img.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── BGM ── */}
        {activePanel === 'bgm' && (
          <div className="ve-section">
            <div className="ve-section-header">
              <span>BGM</span>
              <label className="btn-icon-sm btn-accent">
                <Music size={14} /> 選択
                <input type="file" accept="audio/*" hidden onChange={handleBGMUpload} />
              </label>
            </div>
            {!project.bgm ? (
              <p className="ve-hint">BGMファイルを選択してください</p>
            ) : (
              <div className="ve-bgm-card">
                <p className="ve-clip-name">{project.bgm.name}</p>
                <label className="ve-form-label">
                  音量
                  <div className="ve-slider-row">
                    <Volume2 size={14} />
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={project.bgm.volume}
                      onChange={e => updateBGM({ volume: Number(e.target.value) })}
                    />
                    <span>{Math.round(project.bgm.volume * 100)}%</span>
                  </div>
                </label>
                <label className="ve-form-label">
                  フェードイン (秒)
                  <input
                    type="number" min={0} max={10} step={0.5}
                    value={project.bgm.fadeInDuration}
                    onChange={e => updateBGM({ fadeInDuration: Number(e.target.value) })}
                  />
                </label>
                <label className="ve-form-label">
                  フェードアウト (秒)
                  <input
                    type="number" min={0} max={10} step={0.5}
                    value={project.bgm.fadeOutDuration}
                    onChange={e => updateBGM({ fadeOutDuration: Number(e.target.value) })}
                  />
                </label>
                <label className="ve-check-label">
                  <input
                    type="checkbox"
                    checked={project.bgm.loop}
                    onChange={e => updateBGM({ loop: e.target.checked })}
                  />
                  ループ再生
                </label>
                <button className="btn-danger-sm" onClick={() => {
                  setBgmFile(null);
                  updateProject(p => ({ ...p, bgm: null }));
                }}>
                  BGMを削除
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TelopCard ──

interface TelopCardProps {
  telop: Telop;
  clipDuration: number;
  onChange: (patch: Partial<Telop>) => void;
  onRemove: () => void;
}

function TelopCard({ telop, clipDuration, onChange, onRemove }: TelopCardProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="ve-telop-card">
      <div className="ve-telop-card-header" onClick={() => setOpen(o => !o)}>
        <span className="ve-telop-preview-text">{telop.text.slice(0, 20)}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-icon-sm btn-danger" onClick={e => { e.stopPropagation(); onRemove(); }}>
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {open && (
        <div className="ve-telop-body">
          <label className="ve-form-label">
            テキスト
            <textarea
              rows={2}
              value={telop.text}
              onChange={e => onChange({ text: e.target.value })}
            />
          </label>
          <div className="ve-two-col">
            <label className="ve-form-label">
              開始 (秒)
              <input type="number" min={0} max={clipDuration} step={0.1}
                value={telop.startTime}
                onChange={e => onChange({ startTime: Number(e.target.value) })} />
            </label>
            <label className="ve-form-label">
              終了 (秒)
              <input type="number" min={0} max={clipDuration} step={0.1}
                value={telop.endTime}
                onChange={e => onChange({ endTime: Number(e.target.value) })} />
            </label>
          </div>
          <div className="ve-two-col">
            <label className="ve-form-label">
              文字サイズ
              <input type="number" min={10} max={60} step={1}
                value={telop.style.fontSize}
                onChange={e => onChange({ style: { ...telop.style, fontSize: Number(e.target.value) } })} />
            </label>
            <label className="ve-form-label">
              位置
              <select
                value={telop.style.position}
                onChange={e => onChange({ style: { ...telop.style, position: e.target.value as any } })}
              >
                <option value="top">上</option>
                <option value="center">中央</option>
                <option value="bottom">下</option>
              </select>
            </label>
          </div>
          <div className="ve-two-col">
            <label className="ve-form-label">
              文字色
              <input type="color"
                value={telop.style.color}
                onChange={e => onChange({ style: { ...telop.style, color: e.target.value } })} />
            </label>
          </div>
          <div className="ve-checks-row">
            <label className="ve-check-label">
              <input type="checkbox" checked={telop.style.bold}
                onChange={e => onChange({ style: { ...telop.style, bold: e.target.checked } })} />
              太字
            </label>
            <label className="ve-check-label">
              <input type="checkbox" checked={telop.style.italic}
                onChange={e => onChange({ style: { ...telop.style, italic: e.target.checked } })} />
              斜体
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── helpers ──

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
  });
}

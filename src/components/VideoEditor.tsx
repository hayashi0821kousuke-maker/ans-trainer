import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Pause, Plus, Trash2, Music, Image, Type, Zap, ChevronDown, ChevronUp, Volume2, GripVertical, FolderOpen, FilePlus, Download, Camera, Loader } from 'lucide-react';
import type { VideoClipData, Telop, ImageInsert, BGMTrack, VideoProject, TelopStyle } from '../types';
import { generateId } from '../defaults';
import VideoTimeline from './VideoTimeline';
import ExportModal from './ExportModal';
import { useVideoExport } from '../hooks/useVideoExport';

const STORAGE_KEY = 'ans_video_projects';

function loadAllProjects(): VideoProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAllProjects(projects: VideoProject[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { /* quota */ }
}

const DEFAULT_TELOP_STYLE: TelopStyle = {
  fontSize: 20,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.6)',
  position: 'bottom',
  xPct: 50,
  yPct: 85,
  bold: true,
  italic: false,
};

function positionToY(pos: TelopStyle['position']): number {
  return pos === 'top' ? 10 : pos === 'center' ? 50 : 85;
}

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

  // Store object URLs in state so JSX re-renders when they change
  const [clipUrls, setClipUrls] = useState<Map<string, string>>(new Map());
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [bgmUrl, setBgmUrl] = useState<string | null>(null);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'clips' | 'telops' | 'images' | 'bgm' | 'speed'>('clips');
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [dragOverClipId, setDragOverClipId] = useState<string | null>(null);
  const [capturingClipId, setCapturingClipId] = useState<string | null>(null);
  const [showProjectSheet, setShowProjectSheet] = useState(false);
  const [showExportModal,  setShowExportModal]  = useState(false);
  const [savedProjects, setSavedProjects] = useState<VideoProject[]>(loadAllProjects);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exportHook = useVideoExport(clipUrls, imageUrls, bgmUrl);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const audioRef    = useRef<HTMLAudioElement>(null);
  // Web Audio API nodes for BGM fade
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const audioSrcRef  = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef  = useRef<GainNode | null>(null);
  // Ref mirrors isPlaying to avoid stale closures in effects
  const isPlayingRef = useRef(false);
  // Guard against multiple concurrent clip-advance calls
  const advancingRef = useRef(false);
  // Timer for targetDuration freeze-frame delay
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateProject = useCallback((fn: (p: VideoProject) => VideoProject) => {
    setProject(prev => ({ ...fn(prev), updatedAt: new Date().toISOString() }));
  }, []);

  // Keep ref in sync with state
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Auto-save project metadata (debounced 1.5s)
  useEffect(() => {
    setSaveStatus('unsaved');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setSaveStatus('saving');
      setSavedProjects(prev => {
        const idx = prev.findIndex(p => p.id === project.id);
        const next = idx >= 0
          ? prev.map((p, i) => i === idx ? project : p)
          : [...prev, project];
        saveAllProjects(next);
        return next;
      });
      setSaveStatus('saved');
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      clipUrls.forEach(url => URL.revokeObjectURL(url));
      imageUrls.forEach(url => URL.revokeObjectURL(url));
      if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedClips = [...project.clips].sort((a, b) => a.order - b.order);
  const selectedClip = project.clips.find(c => c.id === selectedClipId) ?? null;
  const activeClipTelops = selectedClipId
    ? project.telops.filter(t => t.clipId === selectedClipId)
    : [];
  const playingClip = sortedClips[currentClipIndex] ?? null;

  // Load clip into video element and play if needed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playingClip) return;
    const url = clipUrls.get(playingClip.id);
    if (!url) return;

    advancingRef.current = false;
    video.src = url;

    const onMeta = () => {
      video.playbackRate = playingClip.speed;
      video.currentTime = playingClip.startTrim;
      if (isPlayingRef.current) video.play().catch(() => {});
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.load();

    return () => video.removeEventListener('loadedmetadata', onMeta);
  // Intentionally only re-run when index changes, not every playingClip property change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClipIndex, clipUrls]);

  // Sync playbackRate live when speed is edited while playing the same clip
  useEffect(() => {
    if (videoRef.current && playingClip) {
      videoRef.current.playbackRate = playingClip.speed;
    }
  }, [playingClip?.speed]);

  // Sync BGM into audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !bgmUrl) return;
    audio.src = bgmUrl;
    audio.volume = project.bgm?.volume ?? 0.5;
    audio.loop = project.bgm?.loop ?? true;
  }, [bgmUrl]);

  const advanceClip = useCallback((currentIndex: number, total: number) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    const next = currentIndex + 1;
    if (next < total) {
      setCurrentClipIndex(next);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopBGMWithFade();
      // Reset to first clip — use a sentinel to force effect to re-run
      setCurrentClipIndex(-1);
      requestAnimationFrame(() => setCurrentClipIndex(0));
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    const clip = sortedClips[currentClipIndex];
    if (clip?.targetDuration) {
      const effDur = ((clip.endTrim > 0 ? clip.endTrim : clip.duration) - clip.startTrim) / clip.speed;
      const extraMs = Math.max(0, (clip.targetDuration - effDur) * 1000);
      if (extraMs > 100) {
        if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
        freezeTimerRef.current = setTimeout(() => {
          freezeTimerRef.current = null;
          advanceClip(currentClipIndex, sortedClips.length);
        }, extraMs);
        return;
      }
    }
    advanceClip(currentClipIndex, sortedClips.length);
  }, [advanceClip, currentClipIndex, sortedClips]);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !playingClip) return;
    const t = video.currentTime;
    setCurrentTime(t);

    if (playingClip.endTrim > 0 && t >= playingClip.endTrim) {
      video.pause();
      advanceClip(currentClipIndex, sortedClips.length);
    }
  }, [playingClip, currentClipIndex, sortedClips.length, advanceClip]);

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !bgmUrl) return null;
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      audioSrcRef.current = src;
      gainNodeRef.current = gain;
    }
    return gainNodeRef.current;
  }, [bgmUrl]);

  const playBGMWithFade = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !bgmUrl) return;
    const gain = ensureAudioGraph();
    if (!gain) return;
    const ctx = audioCtxRef.current!;
    const targetVolume = project.bgm?.volume ?? 0.5;
    const fadeIn = project.bgm?.fadeInDuration ?? 0;
    if (ctx.state === 'suspended') ctx.resume();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(targetVolume, ctx.currentTime + fadeIn);
    } else {
      gain.gain.setValueAtTime(targetVolume, ctx.currentTime);
    }
    audio.play().catch(() => {});
  }, [bgmUrl, ensureAudioGraph, project.bgm?.volume, project.bgm?.fadeInDuration]);

  const stopBGMWithFade = useCallback((immediate = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    const gain = gainNodeRef.current;
    const ctx  = audioCtxRef.current;
    const fadeOut = project.bgm?.fadeOutDuration ?? 0;
    if (!immediate && gain && ctx && fadeOut > 0) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut);
      setTimeout(() => audio.pause(), fadeOut * 1000);
    } else {
      audio.pause();
    }
  }, [project.bgm?.fadeOutDuration]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      stopBGMWithFade();
      setIsPlaying(false);
      if (freezeTimerRef.current) { clearTimeout(freezeTimerRef.current); freezeTimerRef.current = null; }
    } else {
      video.play().catch(() => {});
      if (bgmUrl) playBGMWithFade();
      setIsPlaying(true);
    }
  };

  // ── Upload handlers ──

  const handleClipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newClips: VideoClipData[] = [];
    const urlUpdates = new Map<string, string>();

    for (const file of files) {
      const id = generateId();
      urlUpdates.set(id, URL.createObjectURL(file));
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
    setClipUrls(prev => new Map([...prev, ...urlUpdates]));
    updateProject(p => ({ ...p, clips: [...p.clips, ...newClips] }));
    e.target.value = '';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const urlUpdates = new Map<string, string>();
    const newInserts: ImageInsert[] = [];

    files.forEach(file => {
      const id = generateId();
      urlUpdates.set(id, URL.createObjectURL(file));
      newInserts.push({
        id,
        afterClipId: selectedClipId,
        name: file.name,
        displayDuration: 3,
        order: project.imageInserts.length + newInserts.length,
      });
    });
    setImageUrls(prev => new Map([...prev, ...urlUpdates]));
    updateProject(p => ({ ...p, imageInserts: [...p.imageInserts, ...newInserts] }));
    e.target.value = '';
  };

  const handleBGMUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    setBgmUrl(URL.createObjectURL(file));
    updateProject(p => ({
      ...p,
      bgm: { id: generateId(), name: file.name, volume: 0.5, loop: true, fadeInDuration: 0, fadeOutDuration: 0 },
    }));
    e.target.value = '';
  };

  // ── Drag & drop clip reorder ──

  const handleClipDragStart = (e: React.DragEvent, id: string) => {
    setDraggedClipId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClipDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggedClipId) setDragOverClipId(id);
  };

  const handleClipDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedClipId || draggedClipId === targetId) {
      setDraggedClipId(null);
      setDragOverClipId(null);
      return;
    }
    updateProject(p => {
      const clips = [...p.clips].sort((a, b) => a.order - b.order);
      const fromIdx = clips.findIndex(c => c.id === draggedClipId);
      const toIdx   = clips.findIndex(c => c.id === targetId);
      const [moved] = clips.splice(fromIdx, 1);
      clips.splice(toIdx, 0, moved);
      return { ...p, clips: clips.map((c, i) => ({ ...c, order: i })) };
    });
    setDraggedClipId(null);
    setDragOverClipId(null);
  };

  const handleClipDragEnd = () => {
    setDraggedClipId(null);
    setDragOverClipId(null);
  };

  // ── Telop drag-to-reposition (paused state) ──

  const handleTelopDragStart = useCallback((e: React.PointerEvent, telopId: string) => {
    if (isPlayingRef.current) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const wrap = videoWrapRef.current;
    if (!wrap) return;

    const onMove = (ev: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const x = Math.min(95, Math.max(5, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(95, Math.max(5, ((ev.clientY - rect.top) / rect.height) * 100));
      setProject(prev => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        telops: prev.telops.map(t =>
          t.id === telopId ? { ...t, style: { ...t.style, xPct: x, yPct: y } } : t
        ),
      }));
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', onMove), { once: true });
  }, []);

  // ── Mutations ──

  const removeClip = (id: string) => {
    setClipUrls(prev => {
      const url = prev.get(id);
      if (url) URL.revokeObjectURL(url);
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    updateProject(p => ({
      ...p,
      clips: p.clips.filter(c => c.id !== id).map((c, i) => ({ ...c, order: i })),
      telops: p.telops.filter(t => t.clipId !== id),
    }));
    if (selectedClipId === id) setSelectedClipId(null);
    setCurrentClipIndex(0);
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
  };

  const updateClipTargetDuration = (id: string, val: number | undefined) => {
    updateProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === id ? { ...c, targetDuration: val } : c),
    }));
  };

  const updateClipOrder = (clipId: string, newPos: number) => {
    updateProject(p => {
      const clips = [...p.clips].sort((a, b) => a.order - b.order);
      const fromIdx = clips.findIndex(c => c.id === clipId);
      const [moved] = clips.splice(fromIdx, 1);
      clips.splice(newPos, 0, moved);
      return { ...p, clips: clips.map((c, i) => ({ ...c, order: i })) };
    });
  };

  const captureFrame = async (clip: VideoClipData) => {
    const url = clipUrls.get(clip.id);
    if (!url || capturingClipId) return;
    setCapturingClipId(clip.id);

    const seekTo = (playingClip?.id === clip.id && videoRef.current)
      ? videoRef.current.currentTime
      : (clip.startTrim + (clip.endTrim > 0 ? clip.endTrim : clip.duration)) / 2;

    await new Promise<void>(resolve => {
      const vid = document.createElement('video');
      vid.playsInline = true;
      vid.muted = true;
      vid.src = url;

      const doCapture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        canvas.getContext('2d')!.drawImage(vid, 0, 0, 640, 360);
        canvas.toBlob(blob => {
          if (!blob) { resolve(); return; }
          const blobUrl = URL.createObjectURL(blob);
          const id = generateId();
          setImageUrls(prev => new Map([...prev, [id, blobUrl]]));
          updateProject(p => ({
            ...p,
            imageInserts: [...p.imageInserts, {
              id, afterClipId: clip.id,
              name: `${clip.name.replace(/\.[^.]+$/, '')}_frame.jpg`,
              displayDuration: 3,
              order: p.imageInserts.length,
            }],
          }));
          resolve();
        }, 'image/jpeg', 0.92);
      };

      vid.addEventListener('loadedmetadata', () => { vid.currentTime = seekTo; }, { once: true });
      vid.addEventListener('seeked', doCapture, { once: true });
      vid.onerror = () => resolve();
      vid.load();
    });

    setCapturingClipId(null);
  };

  const updateClipTrim = (id: string, field: 'startTrim' | 'endTrim', val: number) => {
    updateProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === id ? { ...c, [field]: val } : c),
    }));
  };

  const updateBGM = (patch: Partial<BGMTrack>) => {
    updateProject(p => ({ ...p, bgm: p.bgm ? { ...p.bgm, ...patch } : null }));
    if (audioRef.current && patch.loop !== undefined) audioRef.current.loop = patch.loop;
    // Live-update gain if not fading
    if (gainNodeRef.current && audioCtxRef.current && patch.volume !== undefined && isPlaying) {
      gainNodeRef.current.gain.setValueAtTime(patch.volume, audioCtxRef.current.currentTime);
    }
  };

  const updateImageInsert = (id: string, patch: Partial<ImageInsert>) => {
    updateProject(p => ({
      ...p,
      imageInserts: p.imageInserts.map(img => img.id === id ? { ...img, ...patch } : img),
    }));
  };

  const removeImageInsert = (id: string) => {
    setImageUrls(prev => {
      const url = prev.get(id);
      if (url) URL.revokeObjectURL(url);
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    updateProject(p => ({ ...p, imageInserts: p.imageInserts.filter(img => img.id !== id) }));
  };

  // ── Project management ──

  const handleNewProject = () => {
    if (!confirm('現在のプロジェクトを閉じて新規作成しますか？')) return;
    clipUrls.forEach(url => URL.revokeObjectURL(url));
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    setClipUrls(new Map());
    setImageUrls(new Map());
    setBgmUrl(null);
    setProject(newProject());
    setSelectedClipId(null);
    setCurrentClipIndex(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setShowProjectSheet(false);
  };

  const handleLoadProject = (p: VideoProject) => {
    clipUrls.forEach(url => URL.revokeObjectURL(url));
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    if (bgmUrl) URL.revokeObjectURL(bgmUrl);
    setClipUrls(new Map());
    setImageUrls(new Map());
    setBgmUrl(null);
    setProject(p);
    setSelectedClipId(null);
    setCurrentClipIndex(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setShowProjectSheet(false);
  };

  const handleDeleteProject = (id: string) => {
    if (!confirm('このプロジェクトを削除しますか？')) return;
    setSavedProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      saveAllProjects(next);
      return next;
    });
    if (project.id === id) handleNewProject();
  };

  // ── File re-upload for loaded project ──

  const handleReUploadClip = async (e: React.ChangeEvent<HTMLInputElement>, clipId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setClipUrls(prev => new Map([...prev, [clipId, url]]));
    const duration = await getVideoDuration(file);
    updateProject(p => ({
      ...p,
      clips: p.clips.map(c => c.id === clipId ? { ...c, name: file.name, duration } : c),
    }));
    e.target.value = '';
  };

  // ── Playing: only telops whose time range is active. Paused: all clip telops (for dragging)
  const overlayTelops = playingClip
    ? isPlaying
      ? project.telops.filter(t => t.clipId === playingClip.id && currentTime >= t.startTime && currentTime <= t.endTime)
      : project.telops.filter(t => t.clipId === playingClip.id)
    : [];

  return (
    <div className="video-editor">
      <div className="page-header">
        <h1 className="page-title">動画編集</h1>
        <div className="ve-header-right">
          <input
            className="project-name-input"
            value={project.name}
            onChange={e => updateProject(p => ({ ...p, name: e.target.value }))}
          />
          <span className={`ve-save-status ${saveStatus}`}>
            {saveStatus === 'saved' ? '保存済' : saveStatus === 'saving' ? '保存中…' : '未保存'}
          </span>
          <button className="ve-icon-btn" onClick={() => setShowProjectSheet(true)} title="プロジェクト一覧">
            <FolderOpen size={18} />
          </button>
          <button className="ve-icon-btn" onClick={handleNewProject} title="新規プロジェクト">
            <FilePlus size={18} />
          </button>
          <button
            className="ve-icon-btn ve-export-btn"
            onClick={() => { exportHook.reset(); setShowExportModal(true); }}
            title="MP4書き出し"
            disabled={sortedClips.length === 0}
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Project sheet */}
      {showProjectSheet && (
        <div className="modal-overlay" onClick={() => setShowProjectSheet(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">プロジェクト一覧</span>
              <button className="modal-close" onClick={() => setShowProjectSheet(false)}>✕</button>
            </div>
            <div className="ve-project-list">
              {savedProjects.length === 0 && (
                <p className="ve-hint">保存済みプロジェクトがありません</p>
              )}
              {savedProjects.map(p => (
                <div key={p.id} className={`ve-project-row${p.id === project.id ? ' active' : ''}`}>
                  <div className="ve-project-info" onClick={() => handleLoadProject(p)}>
                    <p className="ve-clip-name">{p.name}</p>
                    <p className="ve-clip-meta">
                      {p.clips.length}クリップ · {new Date(p.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button className="btn-icon-sm btn-danger" onClick={() => handleDeleteProject(p.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <button className="btn-primary" onClick={handleNewProject}>
                <FilePlus size={16} /> 新規プロジェクト
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {showExportModal && (
        <ExportModal
          status={exportHook.status}
          progress={exportHook.progress}
          phase={exportHook.phase}
          error={exportHook.error}
          canExport={sortedClips.length > 0 && sortedClips.every(c => clipUrls.has(c.id))}
          onExport={() => exportHook.exportVideo(project)}
          onCancel={exportHook.cancel}
          onClose={() => {
            if (exportHook.status !== 'recording' && exportHook.status !== 'encoding' && exportHook.status !== 'loading-ffmpeg') {
              setShowExportModal(false);
              exportHook.reset();
            }
          }}
        />
      )}

      {/* Preview */}
      <div className="ve-preview">
        <div className="ve-video-wrap" ref={videoWrapRef}>
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
                onEnded={handleVideoEnded}
                playsInline
              />
              {overlayTelops.map(t => {
                const xPct = t.style.xPct ?? 50;
                const yPct = t.style.yPct ?? positionToY(t.style.position);
                const outOfRange = !isPlaying && (currentTime < t.startTime || currentTime > t.endTime);
                return (
                  <div
                    key={t.id}
                    className={`ve-telop-abs${!isPlaying ? ' draggable' : ''}${outOfRange ? ' out-of-range' : ''}`}
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      fontSize: t.style.fontSize,
                      color: t.style.color,
                      background: t.style.backgroundColor,
                      fontWeight: t.style.bold ? 700 : 400,
                      fontStyle: t.style.italic ? 'italic' : 'normal',
                    }}
                    onPointerDown={e => handleTelopDragStart(e, t.id)}
                  >
                    {t.text}
                  </div>
                );
              })}
              {!isPlaying && overlayTelops.length > 0 && (
                <div className="ve-drag-hint">ドラッグでテロップを移動</div>
              )}
            </>
          )}
        </div>

        {sortedClips.length > 0 && (
          <div className="ve-controls">
            <button className="ve-play-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <span className="ve-clip-label">
              {playingClip?.name ?? '—'} ({Math.max(1, currentClipIndex + 1)}/{sortedClips.length})
            </span>
          </div>
        )}

        <audio ref={audioRef} />
      </div>

      {/* Timeline */}
      <VideoTimeline
        sortedClips={sortedClips}
        imageInserts={project.imageInserts}
        telops={project.telops}
        currentClipIndex={currentClipIndex}
        currentTime={currentTime}
        selectedClipId={selectedClipId}
        onClipClick={id => { setSelectedClipId(id); setActivePanel('clips'); }}
      />

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
                className={`ve-clip-card${selectedClipId === clip.id ? ' selected' : ''}${dragOverClipId === clip.id ? ' drag-over' : ''}${draggedClipId === clip.id ? ' dragging' : ''}`}
                draggable
                onDragStart={e => handleClipDragStart(e, clip.id)}
                onDragOver={e => handleClipDragOver(e, clip.id)}
                onDrop={e => handleClipDrop(e, clip.id)}
                onDragEnd={handleClipDragEnd}
                onClick={() => setSelectedClipId(clip.id)}
              >
                <div className="ve-drag-handle">
                  <GripVertical size={14} />
                </div>
                <div className={`ve-clip-thumb${!clipUrls.has(clip.id) ? ' missing' : ''}`}>
                  {clipUrls.has(clip.id) ? <Play size={16} /> : (
                    <label title="ファイルを再アップロード" style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <Upload size={14} />
                      <input type="file" accept="video/*" hidden onChange={e => handleReUploadClip(e, clip.id)} />
                    </label>
                  )}
                </div>
                <div className="ve-clip-info">
                  <p className="ve-clip-name">{clip.name}</p>
                  <p className="ve-clip-meta">
                    {formatTime(clip.duration)} · ×{clip.speed}
                    {clip.targetDuration != null ? ` → ${clip.targetDuration}s` : ''}
                  </p>
                </div>
                <input
                  className="ve-order-input"
                  type="number"
                  min={1}
                  max={sortedClips.length}
                  value={idx + 1}
                  title="順番"
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const pos = Math.min(sortedClips.length, Math.max(1, Number(e.target.value))) - 1;
                    updateClipOrder(clip.id, pos);
                  }}
                />
                <button
                  className="btn-icon-sm"
                  title="現在フレームを静止画として挿入"
                  disabled={!clipUrls.has(clip.id) || capturingClipId === clip.id}
                  onClick={e => { e.stopPropagation(); captureFrame(clip); }}
                >
                  {capturingClipId === clip.id
                    ? <Loader size={13} className="spin" />
                    : <Camera size={13} />}
                </button>
                <button
                  className="btn-icon-sm btn-danger"
                  onClick={e => { e.stopPropagation(); removeClip(clip.id); }}
                >
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
            <p className="ve-section-label">各クリップの再生速度とトリムを調整します</p>
            {sortedClips.length === 0 && <p className="ve-hint">クリップがありません</p>}
            {sortedClips.map(clip => {
              const effDur = ((clip.endTrim > 0 ? clip.endTrim : clip.duration) - clip.startTrim) / clip.speed;
              return (
                <div key={clip.id} className="ve-speed-card">
                  <p className="ve-clip-name">{clip.name}</p>

                  {/* Speed presets */}
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

                  {/* Speed slider + number */}
                  <div className="ve-speed-slider-row">
                    <input
                      type="range" min={0.25} max={4.0} step={0.05}
                      value={clip.speed}
                      onChange={e => updateClipSpeed(clip.id, Number(e.target.value))}
                    />
                    <input
                      className="ve-speed-num"
                      type="number" min={0.25} max={4.0} step={0.05}
                      value={clip.speed}
                      onChange={e => {
                        const v = Math.min(4, Math.max(0.25, Number(e.target.value)));
                        if (!isNaN(v)) updateClipSpeed(clip.id, v);
                      }}
                    />
                  </div>

                  {/* Trim */}
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

                  {/* Target duration (stretch) */}
                  <div className="ve-target-dur-row">
                    <label>
                      引き伸ばし先 (秒)
                      <span className="ve-target-hint">
                        再生時間: {effDur.toFixed(1)}s
                        {clip.targetDuration != null && clip.targetDuration > effDur
                          ? ` → 静止延長 +${(clip.targetDuration - effDur).toFixed(1)}s`
                          : ''}
                      </span>
                      <input
                        type="number" min={0} step={0.5}
                        placeholder={`${effDur.toFixed(1)} (なし)`}
                        value={clip.targetDuration ?? ''}
                        onChange={e => {
                          const v = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value));
                          updateClipTargetDuration(clip.id, v);
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
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
                  {imageUrls.has(img.id)
                    ? <img src={imageUrls.get(img.id)} alt={img.name} />
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
                  stopBGMWithFade(true);
                  if (bgmUrl) URL.revokeObjectURL(bgmUrl);
                  setBgmUrl(null);
                  audioCtxRef.current?.close();
                  audioCtxRef.current = null;
                  audioSrcRef.current = null;
                  gainNodeRef.current = null;
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
        <span className="ve-telop-preview-text">{telop.text.slice(0, 20) || '（空）'}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="btn-icon-sm btn-danger"
            onClick={e => { e.stopPropagation(); onRemove(); }}
          >
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
              <input
                type="number" min={0} max={clipDuration} step={0.1}
                value={telop.startTime}
                onChange={e => onChange({ startTime: Number(e.target.value) })}
              />
            </label>
            <label className="ve-form-label">
              終了 (秒)
              <input
                type="number" min={0} max={clipDuration} step={0.1}
                value={telop.endTime}
                onChange={e => onChange({ endTime: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="ve-two-col">
            <label className="ve-form-label">
              文字サイズ
              <input
                type="number" min={10} max={60} step={1}
                value={telop.style.fontSize}
                onChange={e => onChange({ style: { ...telop.style, fontSize: Number(e.target.value) } })}
              />
            </label>
            <label className="ve-form-label">
              位置プリセット
              <select
                value={telop.style.position}
                onChange={e => {
                  const pos = e.target.value as TelopStyle['position'];
                  onChange({ style: { ...telop.style, position: pos, yPct: positionToY(pos), xPct: 50 } });
                }}
              >
                <option value="top">上</option>
                <option value="center">中央</option>
                <option value="bottom">下</option>
              </select>
            </label>
          </div>
          <label className="ve-form-label">
            文字色
            <input
              type="color"
              value={telop.style.color}
              onChange={e => onChange({ style: { ...telop.style, color: e.target.value } })}
            />
          </label>
          <div className="ve-checks-row">
            <label className="ve-check-label">
              <input
                type="checkbox" checked={telop.style.bold}
                onChange={e => onChange({ style: { ...telop.style, bold: e.target.checked } })}
              />
              太字
            </label>
            <label className="ve-check-label">
              <input
                type="checkbox" checked={telop.style.italic}
                onChange={e => onChange({ style: { ...telop.style, italic: e.target.checked } })}
              />
              斜体
            </label>
          </div>
          <label className="ve-form-label">
            横位置 ({Math.round(telop.style.xPct ?? 50)}%)
            <input
              type="range" min={5} max={95} step={1}
              value={telop.style.xPct ?? 50}
              onChange={e => onChange({ style: { ...telop.style, xPct: Number(e.target.value) } })}
            />
          </label>
          <label className="ve-form-label">
            縦位置 ({Math.round(telop.style.yPct ?? positionToY(telop.style.position))}%)
            <input
              type="range" min={5} max={95} step={1}
              value={telop.style.yPct ?? positionToY(telop.style.position)}
              onChange={e => onChange({ style: { ...telop.style, yPct: Number(e.target.value) } })}
            />
          </label>
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
    video.onloadedmetadata = () => { resolve(video.duration); URL.revokeObjectURL(url); };
    video.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
  });
}

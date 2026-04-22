import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Modal from './Modal';
import type { TrainingSession, SessionExercise, SessionSet, Exercise } from '../types';
import { DEFAULT_EXERCISES, generateId } from '../defaults';

const TODAY = new Date().toISOString().slice(0, 10);

function makeExercise(name: string): SessionExercise {
  return { name, sets: [{ weight: 0, reps: 0 }] };
}

function makeSet(): SessionSet {
  return { weight: 0, reps: 0 };
}

interface SessionCardProps {
  session: TrainingSession;
  onDelete: (id: string) => void;
}

function SessionCard({ session, onDelete }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);

  return (
    <div className="session-card">
      <div
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(x => !x)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="session-date">{session.date}</p>
          <p className="session-title">{session.title || 'トレーニング'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn-icon btn-icon-delete"
            onClick={e => { e.stopPropagation(); if (confirm('このセッションを削除しますか？')) onDelete(session.id); }}
            aria-label="削除"
          >
            <Trash2 size={14} />
          </button>
          <button className="btn-icon" style={{ color: 'var(--text-secondary)' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {!expanded && (
        <div className="session-exercises">
          {session.exercises.slice(0, 3).map((ex, i) => (
            <div key={i} className="session-exercise-row">
              <span className="session-exercise-dot" />
              <span>{ex.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                {ex.sets.length}セット
              </span>
            </div>
          ))}
          {session.exercises.length > 3 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 13 }}>
              他 {session.exercises.length - 3} 種目
            </p>
          )}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {session.exercises.map((ex, ei) => (
            <div key={ei} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                {ex.name}
              </p>
              <div className="sets-builder">
                {ex.sets.map((s, si) => (
                  <div key={si} className="set-row">
                    <span className="set-number">{si + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {s.weight > 0 ? `${s.weight}kg` : '—'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {s.reps > 0 ? `${s.reps}回` : '—'}
                    </span>
                    <span />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {session.note && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, fontStyle: 'italic' }}>
              {session.note}
            </p>
          )}
        </div>
      )}

      <div className="session-meta">
        <span className="session-meta-item">
          📋 {session.exercises.length} 種目
        </span>
        <span className="session-meta-item">
          🔢 {totalSets} セット
        </span>
        {session.durationMinutes !== undefined && (
          <span className="session-meta-item">
            ⏱ {session.durationMinutes} 分
          </span>
        )}
      </div>
    </div>
  );
}

export default function TrainingHistory() {
  const [sessions, setSessions] = useLocalStorage<TrainingSession[]>('ans_history', []);
  const [menuExercises] = useLocalStorage<Exercise[]>('ans_exercises', DEFAULT_EXERCISES);
  const [showModal, setShowModal] = useState(false);

  const [formDate, setFormDate] = useState(TODAY);
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formDuration, setFormDuration] = useState<number | ''>('');
  const [formExercises, setFormExercises] = useState<SessionExercise[]>([]);
  const [exerciseInput, setExerciseInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  const suggestions = exerciseInput.trim()
    ? menuExercises.filter(e =>
        e.name.includes(exerciseInput) && !formExercises.some(fe => fe.name === e.name)
      ).slice(0, 5)
    : [];

  const openAdd = () => {
    setFormDate(TODAY);
    setFormTitle('');
    setFormNote('');
    setFormDuration('');
    setFormExercises([]);
    setExerciseInput('');
    setShowModal(true);
  };

  const addExercise = (name: string) => {
    if (!name.trim()) return;
    setFormExercises(prev => [...prev, makeExercise(name.trim())]);
    setExerciseInput('');
    setShowSuggestions(false);
  };

  const removeExercise = (idx: number) => {
    setFormExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const addSet = (exIdx: number) => {
    setFormExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: [...ex.sets, makeSet()] } : ex
      )
    );
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setFormExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) } : ex
      )
    );
  };

  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: number) => {
    setFormExercises(prev =>
      prev.map((ex, i) =>
        i === exIdx
          ? {
              ...ex,
              sets: ex.sets.map((s, si) =>
                si === setIdx ? { ...s, [field]: value } : s
              ),
            }
          : ex
      )
    );
  };

  const handleSave = () => {
    if (formExercises.length === 0) return;
    setSessions(prev => [
      ...prev,
      {
        id: generateId(),
        date: formDate,
        title: formTitle.trim() || undefined,
        exercises: formExercises,
        note: formNote.trim() || undefined,
        durationMinutes: formDuration !== '' ? Number(formDuration) : undefined,
      },
    ]);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">トレーニング履歴</h1>
        <button className="fab" onClick={openAdd} aria-label="セッションを追加">
          <Plus size={20} />
        </button>
      </div>

      <div className="page-content">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📅</span>
            <p className="empty-text">トレーニング記録がありません</p>
            <p className="empty-sub">＋ボタンからセッションを記録してください</p>
          </div>
        ) : (
          sorted.map(s => (
            <SessionCard key={s.id} session={s} onDelete={handleDelete} />
          ))
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="セッションを記録"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              キャンセル
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              style={formExercises.length === 0 ? { opacity: 0.5 } : {}}
            >
              保存
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">日付</label>
            <input
              className="form-input"
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">時間 (分)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              placeholder="例: 60"
              value={formDuration}
              onChange={e => setFormDuration(e.target.value ? parseInt(e.target.value) : '')}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">タイトル（任意）</label>
          <input
            className="form-input"
            placeholder="例: 胸・肩の日"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
          />
        </div>

        {/* Exercise list */}
        {formExercises.map((ex, exIdx) => (
          <div key={exIdx} className="exercise-block">
            <div className="exercise-block-header">
              <span className="exercise-block-name">{ex.name}</span>
              <button
                className="btn-icon btn-icon-delete"
                onClick={() => removeExercise(exIdx)}
                aria-label="種目を削除"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="exercise-block-body">
              <div className="sets-builder">
                {/* Header row */}
                <div className="set-row" style={{ background: 'var(--bg-card-hover)' }}>
                  <span className="set-number">#</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>重量 (kg)</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>回数</span>
                  <span />
                </div>
                {ex.sets.map((s, si) => (
                  <div key={si} className="set-row">
                    <span className="set-number">{si + 1}</span>
                    <input
                      className="set-input"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="0"
                      value={s.weight || ''}
                      onChange={e => updateSet(exIdx, si, 'weight', parseFloat(e.target.value) || 0)}
                    />
                    <input
                      className="set-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={s.reps || ''}
                      onChange={e => updateSet(exIdx, si, 'reps', parseInt(e.target.value) || 0)}
                    />
                    <button
                      className="btn-icon btn-icon-delete"
                      onClick={() => removeSet(exIdx, si)}
                      style={{ width: 24, height: 24 }}
                      aria-label="セットを削除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="btn-icon btn-icon-add"
                onClick={() => addSet(exIdx)}
                style={{ width: '100%', height: 34, borderRadius: 8, marginTop: 8, fontSize: 12, fontWeight: 600, gap: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={13} /> セット追加
              </button>
            </div>
          </div>
        ))}

        {/* Add exercise */}
        <div className="form-group" style={{ position: 'relative', marginTop: 4 }}>
          <label className="form-label">種目を追加</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              placeholder="種目名を入力または選択"
              value={exerciseInput}
              onChange={e => { setExerciseInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={e => { if (e.key === 'Enter') addExercise(exerciseInput); }}
            />
            <button
              className="btn-icon btn-icon-add"
              style={{ width: 44, height: 44, flexShrink: 0 }}
              onClick={() => addExercise(exerciseInput)}
            >
              <Plus size={18} />
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 52,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              zIndex: 10,
              overflow: 'hidden',
              marginTop: 4,
            }}>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 14px',
                    textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                  onMouseDown={e => { e.preventDefault(); addExercise(s.name); }}
                >
                  {s.name}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>{s.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">メモ（任意）</label>
          <textarea
            className="form-textarea"
            placeholder="今日のコンディション・反省点など"
            value={formNote}
            onChange={e => setFormNote(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}

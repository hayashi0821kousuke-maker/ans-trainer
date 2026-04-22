import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Modal from './Modal';
import type { Exercise } from '../types';
import { DEFAULT_EXERCISES, generateId } from '../defaults';

const CATEGORIES = ['胸', '背中', '脚', '肩', '腕', '体幹', 'その他'];

const EMPTY_FORM: Omit<Exercise, 'id'> = {
  name: '',
  category: '胸',
  defaultWeight: 60,
  defaultSets: 4,
  defaultReps: 8,
  unit: 'kg',
  note: '',
};

export default function TrainingMenu() {
  const [exercises, setExercises] = useLocalStorage<Exercise[]>(
    'ans_exercises',
    DEFAULT_EXERCISES
  );
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [form, setForm] = useState<Omit<Exercise, 'id'>>(EMPTY_FORM);

  const grouped = CATEGORIES.reduce<Record<string, Exercise[]>>((acc, cat) => {
    const items = exercises.filter(e => e.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  // Include exercises with unlisted categories
  exercises.forEach(e => {
    if (!CATEGORIES.includes(e.category)) {
      (grouped['その他'] = grouped['その他'] ?? []).push(e);
    }
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditing(ex);
    setForm({ name: ex.name, category: ex.category, defaultWeight: ex.defaultWeight, defaultSets: ex.defaultSets, defaultReps: ex.defaultReps, unit: ex.unit, note: ex.note ?? '' });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('この種目を削除しますか？')) return;
    setExercises(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editing) {
      setExercises(prev =>
        prev.map(e => e.id === editing.id ? { ...editing, ...form } : e)
      );
    } else {
      setExercises(prev => [...prev, { id: generateId(), ...form }]);
    }
    setShowModal(false);
  };

  const updateForm = (field: keyof typeof form, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">トレーニングメニュー</h1>
        <button className="fab" onClick={openAdd} aria-label="種目を追加">
          <Plus size={20} />
        </button>
      </div>

      <div className="page-content">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="category-group">
            <p className="category-label">{cat}</p>
            <div className="item-list">
              {items.map(ex => (
                <div key={ex.id} className="item-row">
                  <div className="item-info">
                    <p className="item-name">{ex.name}</p>
                    <p className="item-meta">
                      {ex.defaultWeight > 0 ? `${ex.defaultWeight}${ex.unit} × ` : ''}
                      {ex.defaultSets}セット × {ex.defaultReps}回
                    </p>
                  </div>
                  <div className="item-actions">
                    <button
                      className="btn-icon btn-icon-edit"
                      onClick={() => openEdit(ex)}
                      aria-label="編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-icon btn-icon-delete"
                      onClick={() => handleDelete(ex.id)}
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {exercises.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🏋️</span>
            <p className="empty-text">種目がありません</p>
            <p className="empty-sub">＋ボタンから追加してください</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '種目を編集' : '種目を追加'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              キャンセル
            </button>
            <button className="btn-primary" onClick={handleSave}>
              {editing ? '保存' : '追加'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">種目名</label>
          <input
            className="form-input"
            placeholder="例: ベンチプレス"
            value={form.name}
            onChange={e => updateForm('name', e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">カテゴリ</label>
          <select
            className="form-select"
            value={form.category}
            onChange={e => updateForm('category', e.target.value)}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">重量</label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.5"
              value={form.defaultWeight}
              onChange={e => updateForm('defaultWeight', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">セット</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={form.defaultSets}
              onChange={e => updateForm('defaultSets', parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">回数</label>
            <input
              className="form-input"
              type="number"
              min="1"
              value={form.defaultReps}
              onChange={e => updateForm('defaultReps', parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">単位</label>
          <select
            className="form-select"
            value={form.unit}
            onChange={e => updateForm('unit', e.target.value as 'kg' | 'lb')}
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">メモ（任意）</label>
          <textarea
            className="form-textarea"
            placeholder="フォームのポイントなど..."
            value={form.note}
            onChange={e => updateForm('note', e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}

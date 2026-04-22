import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Modal from './Modal';
import type { EquipmentItem } from '../types';
import { DEFAULT_EQUIPMENT, generateId } from '../defaults';

const CATEGORIES = ['フリーウエイト', 'マシン', 'ラック', 'ケーブル', 'カーディオ', 'アクセサリー', 'その他'];

const EMPTY_FORM = { name: '', category: 'フリーウエイト', note: '' };

export default function Equipment() {
  const [equipment, setEquipment] = useLocalStorage<EquipmentItem[]>(
    'ans_equipment',
    DEFAULT_EQUIPMENT
  );
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const grouped = CATEGORIES.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter(e => e.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  const handleDelete = (id: string) => {
    if (!confirm('この機材を削除しますか？')) return;
    setEquipment(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    setEquipment(prev => [
      ...prev,
      { id: generateId(), name: form.name.trim(), category: form.category, note: form.note.trim() || undefined },
    ]);
    setShowModal(false);
    setForm(EMPTY_FORM);
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">機材管理</h1>
        <button className="fab" onClick={openAdd} aria-label="機材を追加">
          <Plus size={20} />
        </button>
      </div>

      <div className="page-content">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="category-group">
            <p className="category-label">{cat}</p>
            <div className="item-list">
              {items.map(eq => (
                <div key={eq.id} className="item-row">
                  <div className="item-info">
                    <p className="item-name">{eq.name}</p>
                    {eq.note && <p className="item-meta">{eq.note}</p>}
                  </div>
                  <div className="item-actions">
                    <button
                      className="btn-icon btn-icon-delete"
                      onClick={() => handleDelete(eq.id)}
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

        {equipment.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🏗️</span>
            <p className="empty-text">機材がありません</p>
            <p className="empty-sub">＋ボタンから追加してください</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="機材を追加"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              キャンセル
            </button>
            <button className="btn-primary" onClick={handleSave}>
              追加
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">機材名</label>
          <input
            className="form-input"
            placeholder="例: バーベル"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">カテゴリ</label>
          <select
            className="form-select"
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">メモ（任意）</label>
          <textarea
            className="form-textarea"
            placeholder="台数・状態・メーカー等..."
            value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
          />
        </div>
      </Modal>
    </>
  );
}

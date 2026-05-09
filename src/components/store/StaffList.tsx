import { useState } from 'react';
import { Plus, Trash2, UserCircle } from 'lucide-react';
import type { StaffMember, StaffRole } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { generateId } from '../../defaults';
import Modal from '../Modal';

const ROLES: StaffRole[] = ['正社員', 'アルバイト', 'パート'];

const ROLE_CLASS: Record<StaffRole, string> = {
  '正社員': 'role-badge--seishain',
  'アルバイト': 'role-badge--arbeit',
  'パート': 'role-badge--part',
};

function emptyForm() {
  return { name: '', hourlyWage: '1000', role: 'アルバイト' as StaffRole };
}

export default function StaffList() {
  const [staff, setStaff] = useLocalStorage<StaffMember[]>('ans_staff', []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  function openAdd() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(s: StaffMember) {
    setEditId(s.id);
    setForm({ name: s.name, hourlyWage: String(s.hourlyWage), role: s.role });
    setModalOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const wage = parseInt(form.hourlyWage, 10);
    if (isNaN(wage) || wage < 0) return;
    if (editId) {
      setStaff(prev => prev.map(s => s.id === editId ? { ...s, name: form.name.trim(), hourlyWage: wage, role: form.role } : s));
    } else {
      setStaff(prev => [...prev, { id: generateId(), name: form.name.trim(), hourlyWage: wage, role: form.role }]);
    }
    setModalOpen(false);
  }

  function remove(id: string) {
    setStaff(prev => prev.filter(s => s.id !== id));
  }

  return (
    <div className="store-section">
      <div className="store-section-header">
        <span className="store-section-title">スタッフ一覧</span>
        <button className="fab-sm" onClick={openAdd} aria-label="スタッフを追加">
          <Plus size={16} />
        </button>
      </div>

      {staff.length === 0 ? (
        <div className="empty-state">
          <UserCircle size={40} />
          <p>スタッフを追加してください</p>
        </div>
      ) : (
        <div className="item-list">
          {staff.map(s => (
            <div key={s.id} className="item-row" onClick={() => openEdit(s)}>
              <div className="item-row-main">
                <span className="item-row-name">{s.name}</span>
                <span className={`role-badge ${ROLE_CLASS[s.role]}`}>{s.role}</span>
              </div>
              <div className="item-row-sub">時給 ¥{s.hourlyWage.toLocaleString()}</div>
              <button
                className="icon-btn danger"
                onClick={e => { e.stopPropagation(); remove(s.id); }}
                aria-label="削除"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'スタッフを編集' : 'スタッフを追加'}
        footer={
          <button className="btn-primary" onClick={save}>
            {editId ? '更新' : '追加'}
          </button>
        }
      >
        <div className="form-group">
          <label className="form-label">名前</label>
          <input
            className="form-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="田中 太郎"
          />
        </div>
        <div className="form-group">
          <label className="form-label">時給（円）</label>
          <input
            className="form-input"
            type="number"
            min={0}
            value={form.hourlyWage}
            onChange={e => setForm(f => ({ ...f, hourlyWage: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">雇用形態</label>
          <select
            className="form-input"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </Modal>
    </div>
  );
}

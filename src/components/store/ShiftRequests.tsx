import { useState } from 'react';
import { Plus, Trash2, ClipboardPaste, ChevronLeft, ChevronRight, AlertTriangle, Check } from 'lucide-react';
import type { ShiftRequest, StaffMember } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { generateId } from '../../defaults';
import Modal from '../Modal';
import { parsePastedTSV, importRowsToRequests } from '../../utils/shiftImporter';
import type { ImportPreview } from '../../utils/shiftImporter';

function getMondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addWeeks(monday: string, n: number): string {
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(monday: string): string {
  const d = new Date(monday + 'T00:00:00');
  const sun = new Date(d);
  sun.setDate(d.getDate() + 6);
  const fmt = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`;
  return `${d.getFullYear()}年 ${fmt(d)}(月)〜${fmt(sun)}(日)`;
}

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];

function getDatesOfWeek(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

function emptyForm(weekStartDate: string) {
  return { staffId: '', date: weekStartDate, startTime: '09:00', endTime: '18:00' };
}

export default function ShiftRequests() {
  const [staff] = useLocalStorage<StaffMember[]>('ans_staff', []);
  const [requests, setRequests] = useLocalStorage<ShiftRequest[]>('ans_shift_requests', []);

  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(weekStart));

  // Paste import state
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const weekDates = getDatesOfWeek(weekStart);
  const weekRequests = requests.filter(r => r.weekStartDate === weekStart);

  function openAdd() {
    setForm(emptyForm(weekStart));
    setModalOpen(true);
  }

  function saveRequest() {
    if (!form.staffId || !form.date) return;
    setRequests(prev => [...prev, {
      id: generateId(),
      staffId: form.staffId,
      weekStartDate: weekStart,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
    }]);
    setModalOpen(false);
  }

  function removeRequest(id: string) {
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  // Paste import handlers
  function handlePasteText(text: string) {
    setPasteText(text);
    if (text.trim()) {
      setPreview(parsePastedTSV(text, staff, weekStart));
    } else {
      setPreview(null);
    }
  }

  function confirmImport() {
    if (!preview) return;
    const newReqs = importRowsToRequests(preview.rows, weekStart);
    setRequests(prev => {
      // Remove existing requests for same staff/date in this week, then add new
      const toRemoveDates = new Set(newReqs.map(r => `${r.staffId}|${r.date}`));
      const filtered = prev.filter(r => !toRemoveDates.has(`${r.staffId}|${r.date}`));
      return [...filtered, ...newReqs];
    });
    setPasteModalOpen(false);
    setPasteText('');
    setPreview(null);
  }

  function getStaffName(id: string) {
    return staff.find(s => s.id === id)?.name ?? '不明';
  }

  return (
    <div className="store-section">
      {/* Week selector */}
      <div className="week-selector">
        <button className="icon-btn" onClick={() => setWeekStart(w => addWeeks(w, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span className="week-label">{formatWeekLabel(weekStart)}</span>
        <button className="icon-btn" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="store-section-header">
        <span className="store-section-title">希望シフト</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="fab-sm secondary" onClick={() => { setPasteText(''); setPreview(null); setPasteModalOpen(true); }} title="スプレッドシートから取り込み">
            <ClipboardPaste size={16} />
          </button>
          <button className="fab-sm" onClick={openAdd} aria-label="希望シフトを追加">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Grouped by day */}
      {weekDates.map((date, di) => {
        const dayReqs = weekRequests.filter(r => r.date === date);
        if (dayReqs.length === 0) return null;
        return (
          <div key={date} className="shift-day-group">
            <div className="shift-day-label">{`${DAYS[di]}曜日 (${date.slice(5).replace('-', '/')})`}</div>
            {dayReqs.map(r => (
              <div key={r.id} className="item-row">
                <div className="item-row-main">
                  <span className="item-row-name">{getStaffName(r.staffId)}</span>
                  <span className="time-badge">{r.startTime}〜{r.endTime}</span>
                </div>
                <button className="icon-btn danger" onClick={() => removeRequest(r.id)} aria-label="削除">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {weekRequests.length === 0 && (
        <div className="empty-state">
          <p>この週の希望シフトはまだありません</p>
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
            「貼り付け」ボタンでスプレッドシートから一括取り込みできます
          </p>
        </div>
      )}

      {/* Manual add modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="希望シフトを追加"
        footer={<button className="btn-primary" onClick={saveRequest}>追加</button>}
      >
        <div className="form-group">
          <label className="form-label">スタッフ</label>
          <select className="form-input" value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}>
            <option value="">選択してください</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">日付</label>
          <select className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}>
            {weekDates.map((d, i) => (
              <option key={d} value={d}>{DAYS[i]}曜日 ({d.slice(5).replace('-', '/')})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">開始</label>
            <input className="form-input" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">終了</label>
            <input className="form-input" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Paste import modal */}
      <Modal
        isOpen={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        title="スプレッドシートから取り込み"
        footer={
          preview && preview.rows.filter(r => r.staffId !== null).length > 0 ? (
            <button className="btn-primary" onClick={confirmImport}>
              <Check size={14} style={{ marginRight: 4 }} />
              {preview.rows.filter(r => r.staffId !== null).length}件を取り込む
            </button>
          ) : undefined
        }
      >
        <p className="form-hint">
          スプレッドシートの希望シフト表をコピーして貼り付けてください。
        </p>
        <p className="form-hint" style={{ marginTop: 4 }}>
          <strong>フォーマット例：</strong><br />
          1行目：名前 / 月曜日 / 火曜日 …（列は日付でもOK）<br />
          2行目以降：田中 / 9:00-17:00 / × / …
        </p>
        <div className="form-group" style={{ marginTop: 12 }}>
          <textarea
            className="form-input"
            rows={6}
            placeholder="ここにスプレッドシートのデータを貼り付け（Ctrl+V / ⌘+V）"
            value={pasteText}
            onChange={e => handlePasteText(e.target.value)}
            onPaste={e => {
              const text = e.clipboardData.getData('text');
              setTimeout(() => handlePasteText(text), 0);
            }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        {preview && (
          <div className="import-preview">
            {preview.unmatchedNames.length > 0 && (
              <div className="import-warning">
                <AlertTriangle size={14} />
                <span>
                  以下の名前はスタッフ一覧と一致しません（スキップされます）：
                  {preview.unmatchedNames.join('、')}
                </span>
              </div>
            )}
            <div className="import-count">
              マッチした希望シフト：<strong>{preview.rows.filter(r => r.staffId !== null).length}件</strong>
              {preview.unmatchedNames.length > 0 && `（スキップ：${preview.rows.filter(r => r.staffId === null).length}件）`}
            </div>
            {preview.rows.filter(r => r.staffId !== null).slice(0, 8).map((row, i) => (
              <div key={i} className="import-row-preview">
                <span className="import-row-name">{row.staffName}</span>
                <span className="import-row-date">{row.date.slice(5).replace('-', '/')}</span>
                <span className="import-row-time">{row.startTime}〜{row.endTime}</span>
              </div>
            ))}
            {preview.rows.filter(r => r.staffId !== null).length > 8 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                …他 {preview.rows.filter(r => r.staffId !== null).length - 8} 件
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

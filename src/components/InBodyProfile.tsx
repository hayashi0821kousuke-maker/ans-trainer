import { useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Modal from './Modal';
import type { InBodyRecord } from '../types';
import { generateId } from '../defaults';

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: Omit<InBodyRecord, 'id'> = {
  date: TODAY,
  weight: 70,
  bodyFatPercentage: 20,
  skeletalMuscleMass: 30,
  bmi: 22,
  visceralFatLevel: 10,
  totalBodyWater: undefined,
  protein: undefined,
  minerals: undefined,
};

function Trend({ curr, prev }: { curr: number; prev?: number }) {
  if (prev === undefined) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return <Minus size={12} color="var(--text-muted)" />;
  if (diff > 0) return <TrendingUp size={12} color="var(--danger)" />;
  return <TrendingDown size={12} color="var(--success)" />;
}

function FatTrend({ curr, prev }: { curr: number; prev?: number }) {
  if (prev === undefined) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return <Minus size={12} color="var(--text-muted)" />;
  if (diff > 0) return <TrendingUp size={12} color="var(--danger)" />;
  return <TrendingDown size={12} color="var(--success)" />;
}

function MuscleTrend({ curr, prev }: { curr: number; prev?: number }) {
  if (prev === undefined) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return <Minus size={12} color="var(--text-muted)" />;
  if (diff > 0) return <TrendingUp size={12} color="var(--success)" />;
  return <TrendingDown size={12} color="var(--danger)" />;
}

export default function InBodyProfile() {
  const [records, setRecords] = useLocalStorage<InBodyRecord[]>('ans_inbody', []);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<InBodyRecord, 'id'>>(EMPTY_FORM);

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const prev = sorted[1];

  const handleSave = () => {
    setRecords(r => [
      ...r,
      {
        id: generateId(),
        ...form,
        totalBodyWater: form.totalBodyWater || undefined,
        protein: form.protein || undefined,
        minerals: form.minerals || undefined,
      },
    ]);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('この測定を削除しますか？')) return;
    setRecords(r => r.filter(x => x.id !== id));
  };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, date: TODAY });
    setShowModal(true);
  };

  const updateForm = (field: keyof typeof form, value: string | number) => {
    setForm(p => ({ ...p, [field]: value }));
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">InBody プロフィール</h1>
        <button className="fab" onClick={openAdd} aria-label="測定を追加">
          <Plus size={20} />
        </button>
      </div>

      <div className="page-content">
        {latest ? (
          <>
            <p className="section-heading">最新の測定 — {latest.date}</p>

            <div className="metric-grid">
              <div className="metric-card metric-card-large">
                <div>
                  <p className="metric-label">体重</p>
                  <p className="metric-value">
                    {latest.weight}
                    <span className="metric-unit"> kg</span>
                  </p>
                </div>
                <Trend curr={latest.weight} prev={prev?.weight} />
              </div>

              <div className="metric-card">
                <p className="metric-label">体脂肪率</p>
                <p className="metric-value">
                  {latest.bodyFatPercentage}
                  <span className="metric-unit">%</span>
                </p>
                <FatTrend curr={latest.bodyFatPercentage} prev={prev?.bodyFatPercentage} />
              </div>

              <div className="metric-card">
                <p className="metric-label">骨格筋量</p>
                <p className="metric-value">
                  {latest.skeletalMuscleMass}
                  <span className="metric-unit"> kg</span>
                </p>
                <MuscleTrend curr={latest.skeletalMuscleMass} prev={prev?.skeletalMuscleMass} />
              </div>

              <div className="metric-card">
                <p className="metric-label">BMI</p>
                <p className="metric-value">{latest.bmi}</p>
              </div>

              <div className="metric-card">
                <p className="metric-label">内臓脂肪レベル</p>
                <p className="metric-value">{latest.visceralFatLevel}</p>
              </div>

              {latest.totalBodyWater !== undefined && (
                <div className="metric-card">
                  <p className="metric-label">体水分量</p>
                  <p className="metric-value">
                    {latest.totalBodyWater}
                    <span className="metric-unit"> kg</span>
                  </p>
                </div>
              )}

              {latest.protein !== undefined && (
                <div className="metric-card">
                  <p className="metric-label">タンパク質</p>
                  <p className="metric-value">
                    {latest.protein}
                    <span className="metric-unit"> kg</span>
                  </p>
                </div>
              )}

              {latest.minerals !== undefined && (
                <div className="metric-card">
                  <p className="metric-label">ミネラル</p>
                  <p className="metric-value">
                    {latest.minerals}
                    <span className="metric-unit"> kg</span>
                  </p>
                </div>
              )}
            </div>

            {sorted.length > 1 && (
              <>
                <p className="section-heading">測定履歴</p>
                <div className="inbody-history-table">
                  <div className="inbody-history-row header">
                    <span>日付</span>
                    <span>体重</span>
                    <span>脂肪%</span>
                    <span>筋肉量</span>
                    <span />
                  </div>
                  {sorted.map(r => (
                    <div key={r.id} className="inbody-history-row">
                      <span className="inbody-history-cell dim">{r.date}</span>
                      <span className="inbody-history-cell">{r.weight}kg</span>
                      <span className="inbody-history-cell">{r.bodyFatPercentage}%</span>
                      <span className="inbody-history-cell">{r.skeletalMuscleMass}kg</span>
                      <button
                        className="btn-icon btn-icon-delete"
                        onClick={() => handleDelete(r.id)}
                        aria-label="削除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">📊</span>
            <p className="empty-text">測定データがありません</p>
            <p className="empty-sub">＋ボタンからInBody測定を記録してください</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="測定を記録"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              キャンセル
            </button>
            <button className="btn-primary" onClick={handleSave}>
              保存
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">測定日</label>
          <input
            className="form-input"
            type="date"
            value={form.date}
            onChange={e => updateForm('date', e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">体重 (kg)</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              value={form.weight}
              onChange={e => updateForm('weight', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">体脂肪率 (%)</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={form.bodyFatPercentage}
              onChange={e => updateForm('bodyFatPercentage', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">骨格筋量 (kg)</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              value={form.skeletalMuscleMass}
              onChange={e => updateForm('skeletalMuscleMass', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">BMI</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              value={form.bmi}
              onChange={e => updateForm('bmi', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">内臓脂肪レベル</label>
          <input
            className="form-input"
            type="number"
            step="1"
            min="0"
            value={form.visceralFatLevel}
            onChange={e => updateForm('visceralFatLevel', parseFloat(e.target.value) || 0)}
          />
        </div>

        <p className="section-heading" style={{ padding: '8px 0 12px', fontSize: '12px' }}>
          オプション項目
        </p>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">体水分 (kg)</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              placeholder="—"
              value={form.totalBodyWater ?? ''}
              onChange={e => updateForm('totalBodyWater', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">タンパク質</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              placeholder="—"
              value={form.protein ?? ''}
              onChange={e => updateForm('protein', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">ミネラル</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              min="0"
              placeholder="—"
              value={form.minerals ?? ''}
              onChange={e => updateForm('minerals', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { Plus, Target, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { DailyRecord, MonthlyTarget, AssignedShift, StaffMember } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { generateId } from '../../defaults';
import Modal from '../Modal';

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

function pct(val: number, total: number): number {
  return total === 0 ? 0 : Math.round((val / total) * 1000) / 10;
}

function progressClass(actual: number, target: number, lowerIsBetter: boolean): string {
  const ratio = target === 0 ? 0 : actual / target;
  if (lowerIsBetter) {
    if (ratio <= 0.9) return 'progress-fill--good';
    if (ratio <= 1.0) return 'progress-fill--warn';
    return 'progress-fill--bad';
  } else {
    if (ratio >= 1.0) return 'progress-fill--good';
    if (ratio >= 0.8) return 'progress-fill--warn';
    return 'progress-fill--bad';
  }
}

function calcLaborCost(shifts: AssignedShift[], staffList: StaffMember[], yearMonth: string): number {
  const staffMap = new Map(staffList.map(s => [s.id, s]));
  return shifts
    .filter(s => s.confirmed && s.date.startsWith(yearMonth))
    .reduce((sum, s) => {
      const member = staffMap.get(s.staffId);
      if (!member) return sum;
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      const hours = (eh + em / 60) - (sh + sm / 60);
      return sum + Math.max(0, hours) * member.hourlyWage;
    }, 0);
}

function emptyRecordForm(date: string) {
  return { date, sales: '', customerCount: '', foodCost: '' };
}

function emptyTargetForm(ym: string): { targetSales: string; targetFLRatio: string; targetFoodCostRatio: string; targetLaborCostRatio: string } {
  return { targetSales: '', targetFLRatio: '55', targetFoodCostRatio: '30', targetLaborCostRatio: '25' };
}

export default function StoreDashboard() {
  const [records, setRecords] = useLocalStorage<DailyRecord[]>('ans_daily_records', []);
  const [targets, setTargets] = useLocalStorage<MonthlyTarget[]>('ans_monthly_targets', []);
  const [shifts] = useLocalStorage<AssignedShift[]>('ans_assigned_shifts', []);
  const [staffList] = useLocalStorage<StaffMember[]>('ans_staff', []);

  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [recordModal, setRecordModal] = useState(false);
  const [targetModal, setTargetModal] = useState(false);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState(() => emptyRecordForm(new Date().toISOString().slice(0, 10)));
  const [targetForm, setTargetForm] = useState(() => emptyTargetForm(currentYearMonth()));

  const monthRecords = records
    .filter(r => r.date.startsWith(yearMonth))
    .sort((a, b) => b.date.localeCompare(a.date));

  const target = targets.find(t => t.yearMonth === yearMonth);
  const laborCost = calcLaborCost(shifts, staffList, yearMonth);

  const totalSales = monthRecords.reduce((s, r) => s + r.sales, 0);
  const totalCustomers = monthRecords.reduce((s, r) => s + r.customerCount, 0);
  const totalFoodCost = monthRecords.reduce((s, r) => s + r.foodCost, 0);
  const avgTicket = totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0;
  const foodCostRatio = pct(totalFoodCost, totalSales);
  const laborCostRatio = pct(laborCost, totalSales);
  const flRatio = pct(totalFoodCost + laborCost, totalSales);

  function openAddRecord() {
    setEditRecordId(null);
    setRecordForm(emptyRecordForm(new Date().toISOString().slice(0, 10)));
    setRecordModal(true);
  }

  function openEditRecord(r: DailyRecord) {
    setEditRecordId(r.id);
    setRecordForm({ date: r.date, sales: String(r.sales), customerCount: String(r.customerCount), foodCost: String(r.foodCost) });
    setRecordModal(true);
  }

  function saveRecord() {
    const sales = parseInt(recordForm.sales, 10);
    const customerCount = parseInt(recordForm.customerCount, 10);
    const foodCost = parseInt(recordForm.foodCost, 10);
    if (isNaN(sales) || isNaN(customerCount) || isNaN(foodCost) || !recordForm.date) return;
    if (editRecordId) {
      setRecords(prev => prev.map(r => r.id === editRecordId ? { ...r, date: recordForm.date, sales, customerCount, foodCost } : r));
    } else {
      setRecords(prev => [...prev, { id: generateId(), date: recordForm.date, sales, customerCount, foodCost }]);
    }
    setRecordModal(false);
  }

  function openTargetEdit() {
    if (target) {
      setTargetForm({
        targetSales: String(target.targetSales),
        targetFLRatio: String(Math.round(target.targetFLRatio * 100)),
        targetFoodCostRatio: String(Math.round(target.targetFoodCostRatio * 100)),
        targetLaborCostRatio: String(Math.round(target.targetLaborCostRatio * 100)),
      });
    } else {
      setTargetForm(emptyTargetForm(yearMonth));
    }
    setTargetModal(true);
  }

  function saveTarget() {
    const ts = parseInt(targetForm.targetSales, 10);
    const fl = parseInt(targetForm.targetFLRatio, 10);
    const fc = parseInt(targetForm.targetFoodCostRatio, 10);
    const lc = parseInt(targetForm.targetLaborCostRatio, 10);
    if (isNaN(ts) || isNaN(fl) || isNaN(fc) || isNaN(lc)) return;
    const updated: MonthlyTarget = {
      yearMonth,
      targetSales: ts,
      targetFLRatio: fl / 100,
      targetFoodCostRatio: fc / 100,
      targetLaborCostRatio: lc / 100,
    };
    setTargets(prev => {
      const exists = prev.findIndex(t => t.yearMonth === yearMonth);
      if (exists >= 0) return prev.map((t, i) => i === exists ? updated : t);
      return [...prev, updated];
    });
    setTargetModal(false);
  }

  return (
    <div className="store-section">
      {/* Month selector */}
      <div className="week-selector">
        <button className="icon-btn" onClick={() => setYearMonth(ym => addMonths(ym, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span className="week-label">{formatYM(yearMonth)}</span>
        <button className="icon-btn" onClick={() => setYearMonth(ym => addMonths(ym, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">売上</div>
          <div className="kpi-value">
            ¥{totalSales.toLocaleString()}
            {target && (
              <span className="kpi-vs"> / ¥{target.targetSales.toLocaleString()}</span>
            )}
          </div>
          {target && totalSales > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              {totalSales >= target.targetSales
                ? <TrendingUp size={12} color="var(--success)" />
                : <TrendingDown size={12} color="var(--danger)" />}
              <span style={{ fontSize: 11, color: totalSales >= target.targetSales ? 'var(--success)' : 'var(--danger)' }}>
                {pct(totalSales, target.targetSales)}%
              </span>
            </div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">客数 / 客単価</div>
          <div className="kpi-value">{totalCustomers.toLocaleString()}<span className="kpi-unit">人</span></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            ¥{avgTicket.toLocaleString()}/人
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">原価率</div>
          <div className="kpi-value" style={{ color: target && foodCostRatio > target.targetFoodCostRatio * 100 ? 'var(--danger)' : 'var(--success)' }}>
            {foodCostRatio}<span className="kpi-unit">%</span>
          </div>
          {target && (
            <>
              <div className="progress-track">
                <div
                  className={`progress-fill ${progressClass(foodCostRatio, target.targetFoodCostRatio * 100, true)}`}
                  style={{ width: `${Math.min(100, pct(foodCostRatio, target.targetFoodCostRatio * 100))}%` }}
                />
              </div>
              <div className="kpi-target-label">目標 {Math.round(target.targetFoodCostRatio * 100)}%</div>
            </>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">人件費率</div>
          <div className="kpi-value" style={{ color: target && laborCostRatio > target.targetLaborCostRatio * 100 ? 'var(--danger)' : 'var(--success)' }}>
            {laborCostRatio}<span className="kpi-unit">%</span>
          </div>
          {target && (
            <>
              <div className="progress-track">
                <div
                  className={`progress-fill ${progressClass(laborCostRatio, target.targetLaborCostRatio * 100, true)}`}
                  style={{ width: `${Math.min(100, pct(laborCostRatio, target.targetLaborCostRatio * 100))}%` }}
                />
              </div>
              <div className="kpi-target-label">目標 {Math.round(target.targetLaborCostRatio * 100)}%</div>
            </>
          )}
        </div>
        <div className="kpi-card" style={{ gridColumn: '1 / -1' }}>
          <div className="kpi-label">FL比率（原価＋人件費）</div>
          <div className="kpi-value" style={{ color: target && flRatio > target.targetFLRatio * 100 ? 'var(--danger)' : 'var(--success)' }}>
            {flRatio}<span className="kpi-unit">%</span>
          </div>
          {target && (
            <>
              <div className="progress-track">
                <div
                  className={`progress-fill ${progressClass(flRatio, target.targetFLRatio * 100, true)}`}
                  style={{ width: `${Math.min(100, pct(flRatio, target.targetFLRatio * 100))}%` }}
                />
              </div>
              <div className="kpi-target-label">目標 {Math.round(target.targetFLRatio * 100)}% / 人件費 ¥{Math.round(laborCost).toLocaleString()}</div>
            </>
          )}
        </div>
      </div>

      {/* Target & record controls */}
      <div className="store-section-header">
        <span className="store-section-title">日次記録</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="fab-sm secondary" onClick={openTargetEdit} title="月次目標を設定">
            <Target size={16} />
          </button>
          <button className="fab-sm" onClick={openAddRecord} aria-label="日次記録を追加">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {monthRecords.length === 0 ? (
        <div className="empty-state">
          <p>この月の記録はまだありません</p>
        </div>
      ) : (
        <div className="item-list">
          {monthRecords.map(r => (
            <div key={r.id} className="item-row" onClick={() => openEditRecord(r)}>
              <div className="item-row-main">
                <span className="item-row-name">{r.date.slice(5).replace('-', '/')}</span>
                <span className="time-badge">¥{r.sales.toLocaleString()}</span>
              </div>
              <div className="item-row-sub">
                {r.customerCount}人 / 客単価¥{r.customerCount > 0 ? Math.round(r.sales / r.customerCount).toLocaleString() : '-'}
                　原価¥{r.foodCost.toLocaleString()}({pct(r.foodCost, r.sales)}%)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily record modal */}
      <Modal
        isOpen={recordModal}
        onClose={() => setRecordModal(false)}
        title={editRecordId ? '日次記録を編集' : '日次記録を追加'}
        footer={<button className="btn-primary" onClick={saveRecord}>{editRecordId ? '更新' : '追加'}</button>}
      >
        <div className="form-group">
          <label className="form-label">日付</label>
          <input className="form-input" type="date" value={recordForm.date} onChange={e => setRecordForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">売上（円）</label>
          <input className="form-input" type="number" min={0} value={recordForm.sales} onChange={e => setRecordForm(f => ({ ...f, sales: e.target.value }))} placeholder="例: 150000" />
        </div>
        <div className="form-group">
          <label className="form-label">客数（人）</label>
          <input className="form-input" type="number" min={0} value={recordForm.customerCount} onChange={e => setRecordForm(f => ({ ...f, customerCount: e.target.value }))} placeholder="例: 80" />
        </div>
        <div className="form-group">
          <label className="form-label">食材費（円）</label>
          <input className="form-input" type="number" min={0} value={recordForm.foodCost} onChange={e => setRecordForm(f => ({ ...f, foodCost: e.target.value }))} placeholder="例: 45000" />
        </div>
      </Modal>

      {/* Monthly target modal */}
      <Modal
        isOpen={targetModal}
        onClose={() => setTargetModal(false)}
        title={`${formatYM(yearMonth)} 月次目標`}
        footer={<button className="btn-primary" onClick={saveTarget}>保存</button>}
      >
        <div className="form-group">
          <label className="form-label">目標売上（円）</label>
          <input className="form-input" type="number" min={0} value={targetForm.targetSales} onChange={e => setTargetForm(f => ({ ...f, targetSales: e.target.value }))} placeholder="例: 3000000" />
        </div>
        <div className="form-group">
          <label className="form-label">目標FL比率（%）</label>
          <input className="form-input" type="number" min={0} max={100} value={targetForm.targetFLRatio} onChange={e => setTargetForm(f => ({ ...f, targetFLRatio: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">目標原価率（%）</label>
          <input className="form-input" type="number" min={0} max={100} value={targetForm.targetFoodCostRatio} onChange={e => setTargetForm(f => ({ ...f, targetFoodCostRatio: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">目標人件費率（%）</label>
          <input className="form-input" type="number" min={0} max={100} value={targetForm.targetLaborCostRatio} onChange={e => setTargetForm(f => ({ ...f, targetLaborCostRatio: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import type { AssignedShift, ShiftRequest, StaffMember, WeekPlan, HourlyDistribution } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { generateId } from '../../defaults';
import { generateShifts } from '../../utils/shiftGenerator';

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
  return `${d.getFullYear()}年 ${fmt(d)}〜${fmt(sun)}`;
}

const DEFAULT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const DEFAULT_WEIGHTS: Record<number, number> = {
  9: 20, 10: 30, 11: 50, 12: 100, 13: 100, 14: 60,
  15: 40, 16: 40, 17: 50, 18: 80, 19: 100, 20: 90, 21: 70, 22: 30,
};

function defaultDistribution(): HourlyDistribution[] {
  return DEFAULT_HOURS.map(h => ({ hour: h, weight: DEFAULT_WEIGHTS[h] ?? 0 }));
}

export default function AutoGenPanel() {
  const [staff] = useLocalStorage<StaffMember[]>('ans_staff', []);
  const [requests] = useLocalStorage<ShiftRequest[]>('ans_shift_requests', []);
  const [, setAssignedShifts] = useLocalStorage<AssignedShift[]>('ans_assigned_shifts', []);
  const [weekPlans, setWeekPlans] = useLocalStorage<WeekPlan[]>('ans_week_plans', []);

  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));

  const existingPlan = weekPlans.find(p => p.weekStartDate === weekStart);

  const [targetSales, setTargetSales] = useState(() => String(existingPlan?.targetSales ?? ''));
  const [laborRatio, setLaborRatio] = useState(() => String(existingPlan ? Math.round(existingPlan.targetLaborCostRatio * 100) : 30));
  const [minStaff, setMinStaff] = useState(() => String(existingPlan?.minStaffPerSlot ?? 2));
  const [distribution, setDistribution] = useState<HourlyDistribution[]>(
    () => existingPlan?.hourlyDistribution ?? defaultDistribution()
  );
  const [result, setResult] = useState<{ trimmed: number; warnings: number; total: number; ratio: number } | null>(null);

  function updateDistWeight(hour: number, weight: number) {
    setDistribution(prev => prev.map(d => d.hour === hour ? { ...d, weight } : d));
  }

  function changeWeek(n: number) {
    const newWeek = addWeeks(weekStart, n);
    setWeekStart(newWeek);
    const plan = weekPlans.find(p => p.weekStartDate === newWeek);
    setTargetSales(String(plan?.targetSales ?? ''));
    setLaborRatio(String(plan ? Math.round(plan.targetLaborCostRatio * 100) : 30));
    setMinStaff(String(plan?.minStaffPerSlot ?? 2));
    setDistribution(plan?.hourlyDistribution ?? defaultDistribution());
    setResult(null);
  }

  function runGeneration() {
    const ts = parseInt(targetSales, 10);
    const lr = parseInt(laborRatio, 10);
    const ms = parseInt(minStaff, 10);
    if (isNaN(ts) || isNaN(lr) || isNaN(ms)) return;

    const plan: WeekPlan = {
      id: existingPlan?.id ?? generateId(),
      weekStartDate: weekStart,
      targetSales: ts,
      targetLaborCostRatio: lr / 100,
      minStaffPerSlot: ms,
      hourlyDistribution: distribution,
      generatedAt: new Date().toISOString(),
    };

    // Save plan
    setWeekPlans(prev => {
      const idx = prev.findIndex(p => p.weekStartDate === weekStart);
      if (idx >= 0) return prev.map((p, i) => i === idx ? plan : p);
      return [...prev, plan];
    });

    const weekRequests = requests.filter(r => r.weekStartDate === weekStart);
    const { shifts, warnings, totalLaborCost, actualLaborCostRatio } = generateShifts(plan, weekRequests, staff);

    // Replace unconfirmed shifts for this week
    setAssignedShifts(prev => {
      const confirmed = prev.filter(s => s.weekStartDate === weekStart && s.confirmed);
      return [...prev.filter(s => s.weekStartDate !== weekStart), ...confirmed, ...shifts];
    });

    setResult({
      trimmed: shifts.filter(s => s.trimmed).length,
      warnings: warnings.length,
      total: Math.round(totalLaborCost),
      ratio: Math.round(actualLaborCostRatio * 1000) / 10,
    });
  }

  const weekRequestCount = requests.filter(r => r.weekStartDate === weekStart).length;

  return (
    <div className="store-section">
      {/* Week selector */}
      <div className="week-selector">
        <button className="icon-btn" onClick={() => changeWeek(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="week-label">{formatWeekLabel(weekStart)}</span>
        <button className="icon-btn" onClick={() => changeWeek(1)}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="store-section-header">
        <span className="store-section-title">自動シフト生成</span>
      </div>

      <div style={{ padding: '0 16px' }}>
        <p className="form-hint" style={{ marginBottom: 16 }}>
          希望シフト登録済み：<strong>{weekRequestCount}件</strong>
        </p>

        <div className="form-group">
          <label className="form-label">週の目標売上（円）</label>
          <input className="form-input" type="number" min={0} value={targetSales} onChange={e => setTargetSales(e.target.value)} placeholder="例: 700000" />
        </div>
        <div className="form-group">
          <label className="form-label">目標人件費率（%）</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={10} max={50} step={1}
              value={laborRatio}
              onChange={e => setLaborRatio(e.target.value)}
              style={{ flex: 1 }}
            />
            <span className="kpi-value" style={{ fontSize: 18, minWidth: 40 }}>{laborRatio}%</span>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">最低人員（人/時間帯）</label>
          <input className="form-input" type="number" min={1} max={20} value={minStaff} onChange={e => setMinStaff(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">時間帯別来客ウェイト（0〜100）</label>
          <p className="form-hint">数値が大きい時間帯ほど多くの人員を割り当てます</p>
          <div className="hour-dist-table">
            {distribution.map(d => (
              <div key={d.hour} className="hour-dist-row">
                <span className="hour-dist-label">{d.hour}:00</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={d.weight}
                    onChange={e => updateDistWeight(d.hour, parseInt(e.target.value, 10))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: 28, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{d.weight}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={runGeneration}
          disabled={!targetSales || weekRequestCount === 0}
        >
          <Zap size={16} />
          シフトを自動生成
        </button>

        {weekRequestCount === 0 && (
          <p className="form-hint" style={{ textAlign: 'center', marginTop: 8 }}>
            先にスタッフの希望シフトを登録してください
          </p>
        )}

        {result && (
          <div className={`gen-result ${result.warnings > 0 ? 'gen-result--warn' : 'gen-result--ok'}`}>
            <div className="gen-result-row">
              <CheckCircle size={16} />
              <span>生成完了　人件費合計 ¥{result.total.toLocaleString()}（{result.ratio}%）</span>
            </div>
            {result.trimmed > 0 && (
              <div className="gen-result-row">
                <AlertTriangle size={14} />
                <span>{result.trimmed}件のシフトが予算超過のため削減されました（カレンダーで確認できます）</span>
              </div>
            )}
            {result.warnings > 0 && (
              <div className="gen-result-row">
                <AlertTriangle size={14} />
                <span>{result.warnings}件の時間帯で最低人員を下回っています</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

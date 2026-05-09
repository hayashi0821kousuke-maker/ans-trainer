import { useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, CheckSquare, AlertTriangle } from 'lucide-react';
import type { AssignedShift, StaffMember, WeekPlan } from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';

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

function getDatesOfWeek(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}

function calcHours(start: string, end: string): number {
  return Math.max(0, timeToDecimal(end) - timeToDecimal(start));
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

export default function ShiftCalendar() {
  const [staff] = useLocalStorage<StaffMember[]>('ans_staff', []);
  const [shifts, setShifts] = useLocalStorage<AssignedShift[]>('ans_assigned_shifts', []);
  const [weekPlans] = useLocalStorage<WeekPlan[]>('ans_week_plans', []);

  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));

  const weekDates = getDatesOfWeek(weekStart);
  const weekShifts = shifts.filter(s => s.weekStartDate === weekStart);
  const weekPlan = weekPlans.find(p => p.weekStartDate === weekStart);

  function confirmAll() {
    setShifts(prev =>
      prev.map(s => s.weekStartDate === weekStart ? { ...s, confirmed: true } : s)
    );
  }

  // Compute understaffed hours
  const understaffedSlots: { date: string; hour: number }[] = [];
  if (weekPlan) {
    for (const date of weekDates) {
      for (const { hour, weight } of weekPlan.hourlyDistribution) {
        if (weight === 0) continue;
        const count = weekShifts.filter(s => {
          const sh = timeToDecimal(s.startTime);
          const eh = timeToDecimal(s.endTime);
          return s.date === date && sh < hour + 1 && eh > hour;
        }).length;
        if (count < weekPlan.minStaffPerSlot) {
          understaffedSlots.push({ date, hour });
        }
      }
    }
  }

  // Compute labor cost summary
  const staffMap = new Map(staff.map(s => [s.id, s]));
  const confirmedCost = weekShifts
    .filter(s => s.confirmed)
    .reduce((sum, s) => {
      const m = staffMap.get(s.staffId);
      return sum + (m ? calcHours(s.startTime, s.endTime) * m.hourlyWage : 0);
    }, 0);
  const totalCost = weekShifts.reduce((sum, s) => {
    const m = staffMap.get(s.staffId);
    return sum + (m ? calcHours(s.startTime, s.endTime) * m.hourlyWage : 0);
  }, 0);

  const hasUnconfirmed = weekShifts.some(s => !s.confirmed);

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

      {/* Actions */}
      <div className="store-section-header shift-print-hide">
        <span className="store-section-title">シフト表</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasUnconfirmed && (
            <button className="fab-sm" onClick={confirmAll} title="すべて確定">
              <CheckSquare size={16} />
            </button>
          )}
          <button className="fab-sm secondary" onClick={() => window.print()} title="印刷">
            <Printer size={16} />
          </button>
        </div>
      </div>

      {/* Understaffed warning */}
      {understaffedSlots.length > 0 && (
        <div className="understaffed-banner shift-print-hide">
          <AlertTriangle size={16} />
          <span>{understaffedSlots.length}件の時間帯で最低人員（{weekPlan?.minStaffPerSlot}人）を下回っています</span>
        </div>
      )}

      {/* Cost summary */}
      {weekShifts.length > 0 && (
        <div className="shift-cost-summary">
          <span>人件費（確定）: <strong>¥{Math.round(confirmedCost).toLocaleString()}</strong></span>
          {hasUnconfirmed && (
            <span style={{ color: 'var(--text-secondary)' }}>　/ 合計（予定含）: ¥{Math.round(totalCost).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Legend (print hidden) */}
      <div className="shift-legend shift-print-hide">
        <span className="shift-block shift-block--normal" style={{ padding: '2px 8px', fontSize: 11 }}>確定済み</span>
        <span className="shift-block shift-block--unconfirmed" style={{ padding: '2px 8px', fontSize: 11 }}>未確定</span>
        <span className="shift-block shift-block--trimmed" style={{ padding: '2px 8px', fontSize: 11 }}>削減あり</span>
      </div>

      {/* Calendar grid */}
      {weekShifts.length === 0 ? (
        <div className="empty-state">
          <p>この週のシフトはまだありません</p>
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>「自動生成」タブでシフトを生成してください</p>
        </div>
      ) : (
        <div className="shift-calendar-wrap">
          <div className="shift-calendar-grid" style={{ gridTemplateColumns: `64px repeat(7, minmax(52px, 1fr))` }}>
            {/* Header row */}
            <div className="shift-cal-header" />
            {weekDates.map((date, i) => {
              const hasAlert = understaffedSlots.some(s => s.date === date);
              return (
                <div key={date} className={`shift-cal-header${hasAlert ? ' shift-cal-header--alert' : ''}`}>
                  <div>{DAY_LABELS[i]}</div>
                  <div style={{ fontSize: 9 }}>{date.slice(5).replace('-', '/')}</div>
                </div>
              );
            })}

            {/* Staff rows */}
            {staff.map(member => {
              const memberShifts = weekShifts.filter(s => s.staffId === member.id);
              if (memberShifts.length === 0) return null;
              return (
                <div key={member.id} style={{ display: 'contents' }}>
                  <div className="shift-cal-staff-name">{member.name}</div>
                  {weekDates.map(date => {
                    const dayShifts = memberShifts.filter(s => s.date === date);
                    return (
                      <div key={date} className="shift-cal-cell">
                        {dayShifts.map(s => {
                          const blockClass = !s.confirmed
                            ? 'shift-block--unconfirmed'
                            : s.trimmed
                            ? 'shift-block--trimmed'
                            : 'shift-block--normal';
                          return (
                            <div key={s.id} className={`shift-block ${blockClass}`}>
                              <div className="shift-time">{s.startTime}〜{s.endTime}</div>
                              {s.trimmed && (
                                <div className="shift-trim-indicator shift-original-time">
                                  ({s.requestedEndTime}まで希望)
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

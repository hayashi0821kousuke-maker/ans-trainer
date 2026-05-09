import type { AssignedShift, ShiftRequest, StaffMember, WeekPlan } from '../types';
import { generateId } from '../defaults';

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}

function decimalToTime(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface GenerationWarning {
  date: string;
  hour: number;
  headcount: number;
  minRequired: number;
}

export interface GenerationResult {
  shifts: AssignedShift[];
  warnings: GenerationWarning[];
  totalLaborCost: number;
  actualLaborCostRatio: number;
}

export function generateShifts(
  weekPlan: WeekPlan,
  requests: ShiftRequest[],
  staff: StaffMember[],
): GenerationResult {
  const staffMap = new Map(staff.map(s => [s.id, s]));
  const laborBudgetTotal = weekPlan.targetSales * weekPlan.targetLaborCostRatio;

  // Get 7 days of the week starting from weekStartDate
  const weekDates: string[] = [];
  const start = new Date(weekPlan.weekStartDate + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }

  // Total weight across all days and hours
  const totalWeight = weekPlan.hourlyDistribution.reduce((sum, h) => sum + h.weight, 0) * 7;
  if (totalWeight === 0) {
    return { shifts: [], warnings: [], totalLaborCost: 0, actualLaborCostRatio: 0 };
  }

  const allAssigned: AssignedShift[] = [];
  const warnings: GenerationWarning[] = [];
  let totalLaborCost = 0;

  for (const date of weekDates) {
    const dayRequests = requests.filter(r => r.date === date);
    if (dayRequests.length === 0) continue;

    // Day's weight = sum of hourly weights
    const dayWeight = weekPlan.hourlyDistribution.reduce((sum, h) => sum + h.weight, 0);
    const dayBudget = laborBudgetTotal * (dayWeight / totalWeight);

    // Sort by hourly wage ascending (cheapest first to maximize coverage)
    const sorted = [...dayRequests].sort((a, b) => {
      const wa = staffMap.get(a.staffId)?.hourlyWage ?? 9999;
      const wb = staffMap.get(b.staffId)?.hourlyWage ?? 9999;
      return wa - wb;
    });

    let remaining = dayBudget;

    for (const req of sorted) {
      const member = staffMap.get(req.staffId);
      if (!member) continue;

      const reqStart = timeToDecimal(req.startTime);
      const reqEnd = timeToDecimal(req.endTime);
      const reqHours = reqEnd - reqStart;
      if (reqHours <= 0) continue;

      const fullCost = reqHours * member.hourlyWage;

      if (remaining <= 0) break;

      if (fullCost <= remaining) {
        allAssigned.push({
          id: generateId(),
          staffId: req.staffId,
          weekStartDate: weekPlan.weekStartDate,
          date,
          startTime: req.startTime,
          endTime: req.endTime,
          requestedStartTime: req.startTime,
          requestedEndTime: req.endTime,
          trimmed: false,
          confirmed: false,
        });
        remaining -= fullCost;
        totalLaborCost += fullCost;
      } else {
        const affordableHours = remaining / member.hourlyWage;
        if (affordableHours >= 1.0) {
          const trimmedEnd = decimalToTime(reqStart + affordableHours);
          allAssigned.push({
            id: generateId(),
            staffId: req.staffId,
            weekStartDate: weekPlan.weekStartDate,
            date,
            startTime: req.startTime,
            endTime: trimmedEnd,
            requestedStartTime: req.startTime,
            requestedEndTime: req.endTime,
            trimmed: true,
            confirmed: false,
          });
          totalLaborCost += affordableHours * member.hourlyWage;
          remaining = 0;
        }
        break;
      }
    }

    // Check minimum staffing per hour slot
    for (const { hour, weight } of weekPlan.hourlyDistribution) {
      if (weight === 0) continue;
      const slotStart = hour;
      const slotEnd = hour + 1;
      const headcount = allAssigned.filter(s => {
        if (s.date !== date) return false;
        const sh = timeToDecimal(s.startTime);
        const eh = timeToDecimal(s.endTime);
        return sh < slotEnd && eh > slotStart;
      }).length;
      if (headcount < weekPlan.minStaffPerSlot) {
        warnings.push({ date, hour, headcount, minRequired: weekPlan.minStaffPerSlot });
      }
    }
  }

  const actualRatio = weekPlan.targetSales > 0 ? totalLaborCost / weekPlan.targetSales : 0;

  return { shifts: allAssigned, warnings, totalLaborCost, actualLaborCostRatio: actualRatio };
}

import type { ShiftRequest, StaffMember } from '../types';
import { generateId } from '../defaults';

export interface ImportRow {
  staffName: string;
  staffId: string | null; // null = unmatched
  date: string;
  startTime: string;
  endTime: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  unmatchedNames: string[];
}

// Parse various time range strings into { startTime, endTime } | null
function parseTimeRange(cell: string): { startTime: string; endTime: string } | null {
  const trimmed = cell.trim();
  if (!trimmed || trimmed === '×' || trimmed === 'x' || trimmed === '-' || trimmed === '✕') {
    return null;
  }
  if (trimmed === '○' || trimmed === '◯' || trimmed === '〇') {
    return { startTime: '09:00', endTime: '18:00' };
  }

  // Normalize full-width chars and separators
  const normalized = trimmed
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：]/g, ':')
    .replace(/[～〜~]/g, '-')
    .replace(/\s+/g, '');

  // Match patterns like 9:00-17:00 or 9時-17時 or 9時00分-17時00分
  const rangeMatch = normalized.match(
    /^(\d{1,2})(?::(\d{2})|時(\d{2})?分?)?[-–](\d{1,2})(?::(\d{2})|時(\d{2})?分?)?$/
  );
  if (rangeMatch) {
    const sh = rangeMatch[1].padStart(2, '0');
    const sm = (rangeMatch[2] || rangeMatch[3] || '00').padStart(2, '0');
    const eh = rangeMatch[4].padStart(2, '0');
    const em = (rangeMatch[5] || rangeMatch[6] || '00').padStart(2, '0');
    const start = `${sh}:${sm}`;
    const end = `${eh}:${em}`;
    if (parseInt(sh) < 24 && parseInt(eh) < 24) {
      return { startTime: start, endTime: end };
    }
  }

  return null;
}

// Parse date strings like "2026/5/11", "5/11", "05/11", "2026-05-11", "5月11日(月)"
function parseDate(header: string, weekStartDate: string): string | null {
  const base = header.replace(/\([月火水木金土日]\)/g, '').trim();
  const yearMonth = weekStartDate.slice(0, 7); // "YYYY-MM"
  const year = weekStartDate.slice(0, 4);

  // Full ISO: YYYY-MM-DD or YYYY/MM/DD
  const fullMatch = base.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (fullMatch) {
    return `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`;
  }

  // Japanese: M月D日
  const jpMatch = base.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (jpMatch) {
    return `${year}-${jpMatch[1].padStart(2, '0')}-${jpMatch[2].padStart(2, '0')}`;
  }

  // M/D or MM/DD
  const shortMatch = base.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (shortMatch) {
    return `${year}-${shortMatch[1].padStart(2, '0')}-${shortMatch[2].padStart(2, '0')}`;
  }

  // YYYY/M/D
  const longSlash = base.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (longSlash) {
    return `${longSlash[1]}-${longSlash[2].padStart(2, '0')}-${longSlash[3].padStart(2, '0')}`;
  }

  // Weekday only: 月/火/水/木/金/土/日
  const dayMap: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 };
  const dayMatch = base.match(/^[（(]?([月火水木金土日])[）)]?$/);
  if (dayMatch && weekStartDate) {
    const offset = dayMap[dayMatch[1]];
    if (offset !== undefined) {
      const d = new Date(weekStartDate + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

export function parsePastedTSV(
  tsv: string,
  staff: StaffMember[],
  weekStartDate: string,
): ImportPreview {
  const lines = tsv.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], unmatchedNames: [] };

  const headers = lines[0].split('\t');
  // First column is staff name, rest are date headers
  const dateHeaders = headers.slice(1);
  const dates = dateHeaders.map(h => parseDate(h, weekStartDate));

  const rows: ImportRow[] = [];
  const unmatchedSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const staffName = cols[0].trim();
    if (!staffName) continue;

    const matched = staff.find(s => s.name === staffName || s.name.includes(staffName) || staffName.includes(s.name));
    if (!matched) unmatchedSet.add(staffName);

    for (let j = 1; j < cols.length; j++) {
      const dateIndex = j - 1;
      const date = dates[dateIndex];
      if (!date) continue;

      const timeRange = parseTimeRange(cols[j] || '');
      if (!timeRange) continue;

      rows.push({
        staffName,
        staffId: matched?.id ?? null,
        date,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
      });
    }
  }

  return { rows, unmatchedNames: Array.from(unmatchedSet) };
}

export function importRowsToRequests(
  rows: ImportRow[],
  weekStartDate: string,
): ShiftRequest[] {
  return rows
    .filter(r => r.staffId !== null)
    .map(r => ({
      id: generateId(),
      staffId: r.staffId!,
      weekStartDate,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
    }));
}

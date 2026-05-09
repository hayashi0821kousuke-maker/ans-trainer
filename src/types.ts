export interface Exercise {
  id: string;
  name: string;
  category: string;
  defaultWeight: number;
  defaultSets: number;
  defaultReps: number;
  unit: 'kg' | 'lb';
  note?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  note?: string;
}

export interface InBodyRecord {
  id: string;
  date: string;
  weight: number;
  bodyFatPercentage: number;
  skeletalMuscleMass: number;
  bmi: number;
  visceralFatLevel: number;
  totalBodyWater?: number;
  protein?: number;
  minerals?: number;
}

export interface TrainingSession {
  id: string;
  date: string;
  title?: string;
  exercises: SessionExercise[];
  note?: string;
  durationMinutes?: number;
}

export interface SessionExercise {
  name: string;
  sets: SessionSet[];
}

export interface SessionSet {
  weight: number;
  reps: number;
}

export type TabType = 'training' | 'equipment' | 'inbody' | 'history' | 'video' | 'store';

// ─── Store Manager ────────────────────────────────────────────────────────────

export type StaffRole = '正社員' | 'アルバイト' | 'パート';

export interface StaffMember {
  id: string;
  name: string;
  hourlyWage: number;
  role: StaffRole;
}

export interface ShiftRequest {
  id: string;
  staffId: string;
  weekStartDate: string; // ISO "YYYY-MM-DD" (Monday)
  date: string;          // ISO "YYYY-MM-DD"
  startTime: string;     // "HH:MM"
  endTime: string;       // "HH:MM"
}

export interface AssignedShift {
  id: string;
  staffId: string;
  weekStartDate: string;
  date: string;
  startTime: string;
  endTime: string;
  requestedStartTime: string;
  requestedEndTime: string;
  trimmed: boolean;
  confirmed: boolean;
}

export interface HourlyDistribution {
  hour: number;   // 0-23
  weight: number; // relative weight 0-100
}

export interface WeekPlan {
  id: string;
  weekStartDate: string;
  targetSales: number;
  targetLaborCostRatio: number; // e.g. 0.30
  minStaffPerSlot: number;
  hourlyDistribution: HourlyDistribution[];
  generatedAt?: string;
}

export interface DailyRecord {
  id: string;
  date: string;        // "YYYY-MM-DD"
  sales: number;       // 売上 (yen)
  customerCount: number;
  foodCost: number;    // 食材費 (yen)
}

export interface MonthlyTarget {
  yearMonth: string;           // "YYYY-MM"
  targetSales: number;
  targetFLRatio: number;       // e.g. 0.55
  targetFoodCostRatio: number;
  targetLaborCostRatio: number;
}

export type StoreSubTab = 'dashboard' | 'shift';
export type ShiftSubTab = 'staff' | 'requests' | 'calendar' | 'autogen';

export interface TelopStyle {
  fontSize: number;
  color: string;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
  bold: boolean;
  italic: boolean;
}

export interface Telop {
  id: string;
  clipId: string;
  text: string;
  startTime: number;
  endTime: number;
  style: TelopStyle;
}

export interface VideoClipData {
  id: string;
  name: string;
  duration: number;
  speed: number;
  order: number;
  startTrim: number;
  endTrim: number;
}

export interface ImageInsert {
  id: string;
  afterClipId: string | null;
  name: string;
  displayDuration: number;
  order: number;
}

export interface BGMTrack {
  id: string;
  name: string;
  volume: number;
  loop: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}

export interface VideoProject {
  id: string;
  name: string;
  clips: VideoClipData[];
  telops: Telop[];
  imageInserts: ImageInsert[];
  bgm: BGMTrack | null;
  createdAt: string;
  updatedAt: string;
}

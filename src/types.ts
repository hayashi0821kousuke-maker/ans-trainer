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

export type TabType = 'training' | 'equipment' | 'inbody' | 'history';

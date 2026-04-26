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

export type TabType = 'training' | 'equipment' | 'inbody' | 'history' | 'video';

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

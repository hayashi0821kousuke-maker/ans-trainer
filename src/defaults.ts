import type { Exercise, EquipmentItem } from './types';

export const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'e1', name: 'ベンチプレス', category: '胸', defaultWeight: 60, defaultSets: 4, defaultReps: 8, unit: 'kg' },
  { id: 'e2', name: 'インクラインダンベルプレス', category: '胸', defaultWeight: 24, defaultSets: 3, defaultReps: 10, unit: 'kg' },
  { id: 'e3', name: 'デッドリフト', category: '背中', defaultWeight: 100, defaultSets: 3, defaultReps: 5, unit: 'kg' },
  { id: 'e4', name: 'ラットプルダウン', category: '背中', defaultWeight: 60, defaultSets: 4, defaultReps: 10, unit: 'kg' },
  { id: 'e5', name: 'バーベルロウ', category: '背中', defaultWeight: 70, defaultSets: 4, defaultReps: 8, unit: 'kg' },
  { id: 'e6', name: 'スクワット', category: '脚', defaultWeight: 80, defaultSets: 5, defaultReps: 5, unit: 'kg' },
  { id: 'e7', name: 'レッグプレス', category: '脚', defaultWeight: 120, defaultSets: 4, defaultReps: 10, unit: 'kg' },
  { id: 'e8', name: 'ショルダープレス', category: '肩', defaultWeight: 40, defaultSets: 4, defaultReps: 10, unit: 'kg' },
  { id: 'e9', name: 'サイドレイズ', category: '肩', defaultWeight: 10, defaultSets: 3, defaultReps: 15, unit: 'kg' },
  { id: 'e10', name: 'バーベルカール', category: '腕', defaultWeight: 30, defaultSets: 3, defaultReps: 12, unit: 'kg' },
  { id: 'e11', name: 'トライセップスプレスダウン', category: '腕', defaultWeight: 30, defaultSets: 3, defaultReps: 12, unit: 'kg' },
  { id: 'e12', name: 'プランク', category: '体幹', defaultWeight: 0, defaultSets: 3, defaultReps: 60, unit: 'kg' },
];

export const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  { id: 'q1', name: 'バーベル', category: 'フリーウエイト' },
  { id: 'q2', name: 'ダンベルセット', category: 'フリーウエイト' },
  { id: 'q3', name: 'スクワットラック', category: 'ラック' },
  { id: 'q4', name: 'ラットプルダウンマシン', category: 'マシン' },
  { id: 'q5', name: 'スミスマシン', category: 'マシン' },
];

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

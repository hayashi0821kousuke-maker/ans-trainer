import { Dumbbell, Wrench, Activity, CalendarDays, Film, Store } from 'lucide-react';
import type { TabType } from '../types';

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { id: TabType; label: string; Icon: React.FC<{ size: number }> }[] = [
  { id: 'training', label: 'メニュー', Icon: Dumbbell },
  { id: 'equipment', label: '機材', Icon: Wrench },
  { id: 'inbody', label: 'InBody', Icon: Activity },
  { id: 'history', label: '履歴', Icon: CalendarDays },
  { id: 'video', label: '動画', Icon: Film },
  { id: 'store', label: '店舗', Icon: Store },
];

export default function Navigation({ activeTab, onTabChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item${activeTab === id ? ' active' : ''}`}
          onClick={() => onTabChange(id)}
        >
          <span className="nav-icon-wrap">
            <Icon size={20} />
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

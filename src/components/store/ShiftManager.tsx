import { useState } from 'react';
import type { ShiftSubTab } from '../../types';
import StaffList from './StaffList';
import ShiftRequests from './ShiftRequests';
import ShiftCalendar from './ShiftCalendar';
import AutoGenPanel from './AutoGenPanel';

const SUB_TABS: { id: ShiftSubTab; label: string }[] = [
  { id: 'staff', label: 'スタッフ' },
  { id: 'requests', label: '希望' },
  { id: 'calendar', label: 'カレンダー' },
  { id: 'autogen', label: '自動生成' },
];

export default function ShiftManager() {
  const [subTab, setSubTab] = useState<ShiftSubTab>('staff');

  return (
    <>
      <div className="ve-panel-tabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            className={`ve-panel-tab${subTab === t.id ? ' active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'staff' && <StaffList />}
      {subTab === 'requests' && <ShiftRequests />}
      {subTab === 'calendar' && <ShiftCalendar />}
      {subTab === 'autogen' && <AutoGenPanel />}
    </>
  );
}

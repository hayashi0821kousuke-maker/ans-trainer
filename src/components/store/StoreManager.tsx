import { useState } from 'react';
import type { StoreSubTab } from '../../types';
import StoreDashboard from './StoreDashboard';
import ShiftManager from './ShiftManager';

const SUB_TABS: { id: StoreSubTab; label: string }[] = [
  { id: 'dashboard', label: '数値管理' },
  { id: 'shift', label: 'シフト管理' },
];

export default function StoreManager() {
  const [subTab, setSubTab] = useState<StoreSubTab>('dashboard');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">店舗管理</h1>
      </div>
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
      {subTab === 'dashboard' && <StoreDashboard />}
      {subTab === 'shift' && <ShiftManager />}
    </>
  );
}

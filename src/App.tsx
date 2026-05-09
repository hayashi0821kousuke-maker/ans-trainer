import { useState } from 'react';
import type { TabType } from './types';
import Navigation from './components/Navigation';
import TrainingMenu from './components/TrainingMenu';
import Equipment from './components/Equipment';
import InBodyProfile from './components/InBodyProfile';
import TrainingHistory from './components/TrainingHistory';
import VideoEditor from './components/VideoEditor';
import StoreManager from './components/store/StoreManager';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('training');

  return (
    <div className="app">
      <main className="main-content">
        {activeTab === 'training' && <TrainingMenu />}
        {activeTab === 'equipment' && <Equipment />}
        {activeTab === 'inbody' && <InBodyProfile />}
        {activeTab === 'history' && <TrainingHistory />}
        {activeTab === 'video' && <VideoEditor />}
        {activeTab === 'store' && <StoreManager />}
      </main>
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

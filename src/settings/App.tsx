import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsContext, useSettingsProvider } from './hooks/useSettings';
import GeneralTab from './tabs/GeneralTab';
import BorderTab from './tabs/BorderTab';
import CalendarTab from './tabs/CalendarTab';
import TimerTab from './tabs/TimerTab';
import AboutTab from './tabs/AboutTab';

type TabName = 'general' | 'border' | 'calendar' | 'timer' | 'about';

const TABS: { id: TabName; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'border', label: 'Border' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'timer', label: 'Timer' },
  { id: 'about', label: 'About' },
];

function TabContent({ tab }: { tab: TabName }) {
  switch (tab) {
    case 'general':
      return <GeneralTab />;
    case 'border':
      return <BorderTab />;
    case 'calendar':
      return <CalendarTab />;
    case 'timer':
      return <TimerTab />;
    case 'about':
      return <AboutTab />;
  }
}

export default function App() {
  const settingsValue = useSettingsProvider();
  const [activeTab, setActiveTab] = useState<TabName>('general');

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested((e) => {
      e.preventDefault();
      getCurrentWindow().hide();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <SettingsContext.Provider value={settingsValue}>
      <div className="flex h-screen bg-white">
        {/* Sidebar navigation */}
        <nav className="w-48 border-r border-gray-200 bg-gray-50 p-4">
          <h1 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
            LightTime
          </h1>
          <ul className="space-y-1">
            {TABS.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Tab content */}
        <main className="flex-1 p-6">
          {settingsValue.loading ? (
            <p className="text-gray-400">Loading settings...</p>
          ) : (
            <TabContent tab={activeTab} />
          )}
        </main>
      </div>
    </SettingsContext.Provider>
  );
}

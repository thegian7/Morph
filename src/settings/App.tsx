import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-shell';
import { SettingsContext, useSettingsProvider } from './hooks/useSettings';
import ErrorBoundary from './ErrorBoundary';
import GeneralTab from './tabs/GeneralTab';
import BorderTab from './tabs/BorderTab';
import CalendarTab from './tabs/CalendarTab';
import TimerTab from './tabs/TimerTab';
import AboutTab from './tabs/AboutTab';

const KOFI_URL = 'https://ko-fi.com/christopherledbetter';

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
        <nav className="w-48 border-r border-gray-200 bg-gray-50 p-4 flex flex-col">
          <h1 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
            Morph
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
          <div className="mt-auto pt-4 border-t border-gray-200">
            <button
              onClick={() => open(KOFI_URL)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-[#FF5E5B] transition-colors rounded hover:bg-gray-100 w-full"
              title="Support Morph on Ko-fi"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              Support Morph
            </button>
          </div>
        </nav>

        {/* Tab content */}
        <main className="flex-1 p-6">
          {settingsValue.loading ? (
            <p className="text-gray-400">Loading settings...</p>
          ) : (
            <ErrorBoundary>
              <TabContent tab={activeTab} />
            </ErrorBoundary>
          )}
        </main>
      </div>
    </SettingsContext.Provider>
  );
}

import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-shell';
import { SettingsContext, useSettingsProvider } from './hooks/useSettings';
import { useTheme } from '../shared/hooks/useTheme';
import ErrorBoundary from './ErrorBoundary';
import GeneralTab from './tabs/GeneralTab';
import BorderTab from './tabs/BorderTab';
import CalendarTab from './tabs/CalendarTab';
import TimerTab from './tabs/TimerTab';
import AlertsTab from './tabs/AlertsTab';
import AboutTab from './tabs/AboutTab';
import WelcomeTab from './tabs/WelcomeTab';

const KOFI_URL = 'https://ko-fi.com/morphlight';

type TabName = 'welcome' | 'general' | 'border' | 'calendar' | 'timer' | 'alerts' | 'about';

const MAIN_TABS: { id: TabName; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'border', label: 'Border' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'timer', label: 'Timer' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'about', label: 'About' },
];

export default function App() {
  const settingsValue = useSettingsProvider();
  useTheme();

  const onboardingComplete = settingsValue.getSetting('onboarding_complete') === 'true';
  const [activeTab, setActiveTab] = useState<TabName>(
    settingsValue.loading ? 'general' : onboardingComplete ? 'general' : 'welcome',
  );

  // Once settings load, switch to welcome if onboarding not complete
  useEffect(() => {
    if (!settingsValue.loading && settingsValue.getSetting('onboarding_complete') !== 'true') {
      setActiveTab('welcome');
    }
  }, [settingsValue.loading]);

  const showWelcome = !onboardingComplete;
  const tabs = showWelcome
    ? [{ id: 'welcome' as TabName, label: 'Welcome' }, ...MAIN_TABS]
    : MAIN_TABS;

  function handleOnboardingComplete() {
    settingsValue.setSetting('onboarding_complete', 'true');
    setActiveTab('general');
  }

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
      <div
        className="flex h-screen"
        style={{ backgroundColor: 'var(--color-surface-base)', color: 'var(--color-text)' }}
      >
        {/* Sidebar navigation */}
        <nav
          data-testid="sidebar"
          className="w-48 p-4 flex flex-col"
          style={{
            backgroundColor: 'var(--color-surface-overlay)',
            borderRight: '1px solid var(--color-border)',
          }}
        >
          {/* Morph logo */}
          <div className="flex items-center gap-2 mb-5" data-testid="morph-logo">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" stroke="#4A9B6E" strokeWidth="2" />
              <circle cx="12" cy="12" r="5" fill="#4A9B6E" />
            </svg>
            <span
              className="font-semibold tracking-wide"
              style={{ fontSize: 'var(--text-lg)', color: 'var(--color-primary)' }}
            >
              Morph
            </span>
          </div>

          <ul className="space-y-0.5 flex-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full text-left px-3 py-2 rounded-lg"
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: activeTab === tab.id ? 500 : 400,
                    backgroundColor:
                      activeTab === tab.id ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                    color:
                      activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    transition: 'var(--transition-fast)',
                  }}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>

          <div
            className="pt-3 mt-auto"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <button
              onClick={() => open(KOFI_URL)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg w-full"
              title="Support Morph on Ko-fi"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                transition: 'var(--transition-fast)',
              }}
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
        <main className="flex-1 overflow-y-auto" style={{ padding: 'var(--space-6)' }}>
          {settingsValue.loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading settings...</p>
          ) : (
            <ErrorBoundary>
              <div style={{ transition: 'opacity 200ms ease', opacity: 1 }}>
                {activeTab === 'welcome' && (
                  <WelcomeTab
                    onGoToCalendar={() => setActiveTab('calendar')}
                    onComplete={handleOnboardingComplete}
                  />
                )}
                {activeTab === 'general' && <GeneralTab />}
                {activeTab === 'border' && <BorderTab />}
                {activeTab === 'calendar' && <CalendarTab />}
                {activeTab === 'timer' && <TimerTab />}
                {activeTab === 'alerts' && <AlertsTab />}
                {activeTab === 'about' && <AboutTab />}
              </div>
            </ErrorBoundary>
          )}
        </main>
      </div>
    </SettingsContext.Provider>
  );
}

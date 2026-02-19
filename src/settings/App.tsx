import React, { useState } from 'react';

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
      return (
        <div>
          <h2 className="text-lg font-semibold mb-2">General Settings</h2>
          <p className="text-gray-600">Launch at login, notification preferences, and more.</p>
        </div>
      );
    case 'border':
      return (
        <div>
          <h2 className="text-lg font-semibold mb-2">Border Settings</h2>
          <p className="text-gray-600">
            Border thickness, color palette, intensity, and active edges.
          </p>
        </div>
      );
    case 'calendar':
      return (
        <div>
          <h2 className="text-lg font-semibold mb-2">Calendar Settings</h2>
          <p className="text-gray-600">
            Connect Google Calendar, Microsoft Calendar, or Apple Calendar.
          </p>
        </div>
      );
    case 'timer':
      return (
        <div>
          <h2 className="text-lg font-semibold mb-2">Timer Settings</h2>
          <p className="text-gray-600">Manual timer presets and default durations.</p>
        </div>
      );
    case 'about':
      return (
        <div>
          <h2 className="text-lg font-semibold mb-2">About LightTime</h2>
          <p className="text-gray-600">Version 0.1.0</p>
          <p className="text-gray-500 mt-1">
            Ambient screen border timer that changes color based on calendar state.
          </p>
        </div>
      );
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('general');

  return (
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
        <TabContent tab={activeTab} />
      </main>
    </div>
  );
}

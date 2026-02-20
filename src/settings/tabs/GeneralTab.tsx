import { useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { useSettings } from '../hooks/useSettings';

const PAUSE_DURATIONS = [5, 15, 30, 60] as const;

export default function GeneralTab() {
  const { getSetting, setSetting } = useSettings();
  const launchAtLogin = getSetting('launch_at_login') === 'true';
  const [pauseState, setPauseState] = useState<{ paused: boolean; minutes?: number }>({
    paused: false,
  });
  const [showDurations, setShowDurations] = useState(false);

  function handleToggleLaunch() {
    setSetting('launch_at_login', launchAtLogin ? 'false' : 'true');
  }

  function handlePause(minutes: number) {
    emit('pause-border', { minutes });
    setPauseState({ paused: true, minutes });
    setShowDurations(false);
  }

  function handlePauseUntilNext() {
    emit('pause-border', { minutes: -1 });
    setPauseState({ paused: true });
    setShowDurations(false);
  }

  function handleResume() {
    emit('pause-border', { minutes: 0 });
    setPauseState({ paused: false });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">General Settings</h2>
        <p className="text-sm text-gray-500 mb-6">App behavior and system preferences.</p>
      </div>

      {/* Launch at Login */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Launch at login</p>
            <p className="text-sm text-gray-500">Start LightTime automatically when you log in</p>
          </div>
          <button
            onClick={handleToggleLaunch}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              launchAtLogin ? 'bg-blue-500' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={launchAtLogin}
            aria-label="Launch at login"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                launchAtLogin ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Pause / Snooze */}
      <section>
        <p className="text-sm font-medium text-gray-900 mb-2">Pause Border</p>
        <p className="text-sm text-gray-500 mb-3">Temporarily hide the border overlay.</p>

        {pauseState.paused ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              {pauseState.minutes
                ? `Border paused for ${pauseState.minutes} min`
                : 'Border paused until next event'}
            </p>
            <button
              onClick={handleResume}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
            >
              Resume
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setShowDurations(!showDurations)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              Pause Border
            </button>

            {showDurations && (
              <div className="mt-2 flex flex-wrap gap-2">
                {PAUSE_DURATIONS.map((min) => (
                  <button
                    key={min}
                    onClick={() => handlePause(min)}
                    className="px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                  >
                    {min} min
                  </button>
                ))}
                <button
                  onClick={handlePauseUntilNext}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                >
                  Until next event
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* About */}
      <section>
        <p className="text-sm font-medium text-gray-900 mb-1">About</p>
        <p className="text-sm text-gray-700">LightTime</p>
        <p className="text-sm text-gray-500">Version 0.1.0</p>
        <p className="text-sm text-gray-500">Ambient screen border timer</p>
      </section>
    </div>
  );
}

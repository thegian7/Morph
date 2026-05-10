import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useSettings } from '../hooks/useSettings';
import { Toggle, Card, SectionHeader, Chip } from '@/shared/components';
import { useTheme, type ThemePreference } from '@/shared/hooks/useTheme';

interface MonitorInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  is_primary: boolean;
}

const PAUSE_DURATIONS = [5, 15, 30, 60] as const;

const THEME_OPTIONS: { value: ThemePreference; label: string; swatch: string }[] = [
  { value: 'system', label: 'System', swatch: 'linear-gradient(135deg, #f8f8f8 50%, #1a1a1a 50%)' },
  { value: 'light', label: 'Light', swatch: '#f8f8f8' },
  { value: 'dark', label: 'Dark', swatch: '#1a1a1a' },
];

export function GeneralTab() {
  const { getSetting, setSetting } = useSettings();
  const { preference, setPreference } = useTheme();
  const launchAtLogin = getSetting('launch_at_login') === 'true';
  const selectedDisplay = getSetting('selected_display') ?? 'primary';
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [pauseState, setPauseState] = useState<{ paused: boolean; minutes?: number }>({
    paused: false,
  });

  // Sync theme preference from settings on mount
  const savedTheme = getSetting('theme_preference');
  useEffect(() => {
    if (savedTheme && (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark')) {
      setPreference(savedTheme as ThemePreference);
    }
  }, [savedTheme, setPreference]);

  useEffect(() => {
    invoke<MonitorInfo[]>('get_available_monitors')
      .then(setMonitors)
      .catch((err) => console.error('Failed to get monitors:', err));
  }, []);

  function handleThemeChange(theme: ThemePreference) {
    setPreference(theme);
    setSetting('theme_preference', theme);
  }

  async function handleToggleLaunch() {
    const newValue = !launchAtLogin;
    setSetting('launch_at_login', newValue ? 'true' : 'false');
    try {
      if (newValue) {
        await enable();
      } else {
        await disable();
      }
    } catch (err) {
      console.error('Failed to toggle autostart:', err);
    }
  }

  function handlePause(minutes: number) {
    emit('pause-border', { minutes });
    setPauseState({ paused: true, minutes });
  }

  function handleResume() {
    emit('pause-border', { minutes: 0 });
    setPauseState({ paused: false });
  }

  return (
    <div className="space-y-6">
      {/* Theme Picker */}
      <section>
        <SectionHeader title="Appearance" description="Choose your preferred color theme." />
        <div className="flex gap-3">
          {THEME_OPTIONS.map((opt) => (
            <Card
              key={opt.value}
              selected={preference === opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className="flex-1 text-center"
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-2 border border-gray-200"
                style={{ background: opt.swatch }}
              />
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: preference === opt.value ? 600 : 400,
                  color: 'var(--color-text)',
                }}
              >
                {opt.label}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* Launch at Login */}
      <section>
        <SectionHeader title="Startup" description="Control how Morph behaves on login." />
        <Card>
          <Toggle
            label="Launch at login"
            checked={launchAtLogin}
            onChange={handleToggleLaunch}
          />
        </Card>
      </section>

      {/* Display Selection — only shown with multiple monitors */}
      {monitors.length > 1 && (
        <section>
          <SectionHeader title="Display" description="Choose which monitor shows the border overlay." />
          <div className="flex flex-wrap gap-3">
            {monitors.map((monitor) => (
              <Card
                key={monitor.id}
                selected={selectedDisplay === monitor.id}
                onClick={() => setSetting('selected_display', monitor.id)}
              >
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
                  {monitor.name}
                  {monitor.is_primary && (
                    <span style={{ marginLeft: '0.375rem', fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 400 }}>
                      (Primary)
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block' }}>
                  {Math.round(monitor.width)} &times; {Math.round(monitor.height)}
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Pause / Snooze */}
      <section>
        <SectionHeader title="Pause Border" description="Temporarily hide the border overlay." />
        {pauseState.paused ? (
          <Card>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                {pauseState.minutes
                  ? `Paused for ${pauseState.minutes} min`
                  : 'Paused until next event'}
              </span>
              <button
                onClick={handleResume}
                className="px-3 py-1.5 rounded-lg font-medium cursor-pointer"
                style={{
                  fontSize: 'var(--text-sm)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                }}
              >
                Resume
              </button>
            </div>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PAUSE_DURATIONS.map((min) => (
              <Chip
                key={min}
                label={`${min}m`}
                selected={false}
                onSelect={() => handlePause(min)}
              />
            ))}
            <Chip
              label="Until next event"
              selected={false}
              onSelect={() => {
                emit('pause-border', { minutes: -1 });
                setPauseState({ paused: true });
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// Keep default export for backward compatibility with existing imports
export default GeneralTab;

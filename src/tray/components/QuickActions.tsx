import React, { useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { IconButton, Chip } from '../../shared/components';

const PAUSE_DURATIONS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
];

const TIMER_PRESETS = [
  { label: 'Pomodoro', minutes: 25 },
  { label: 'Focus', minutes: 50 },
  { label: '90min', minutes: 90 },
];

export function QuickActions() {
  const [showPauseFlyout, setShowPauseFlyout] = useState(false);
  const [showTimerFlyout, setShowTimerFlyout] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handlePause = (minutes: number) => {
    emit('pause-border', { duration_minutes: minutes });
    setShowPauseFlyout(false);
  };

  const handleTimer = (label: string, minutes: number) => {
    emit('start-timer', { name: label, duration_seconds: minutes * 60 });
    setShowTimerFlyout(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    await emit('force-sync');
    setTimeout(() => setSyncing(false), 2000);
  };

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          <IconButton
            title="Pause border"
            onClick={() => {
              setShowPauseFlyout(!showPauseFlyout);
              setShowTimerFlyout(false);
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)' }}>Pause</span>
          </IconButton>
          {showPauseFlyout && (
            <div
              className="absolute bottom-full left-0 mb-1 flex gap-1 p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            >
              {PAUSE_DURATIONS.map((d) => (
                <Chip
                  key={d.label}
                  label={d.label}
                  selected={false}
                  onSelect={() => handlePause(d.minutes)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <IconButton
            title="Start timer"
            onClick={() => {
              setShowTimerFlyout(!showTimerFlyout);
              setShowPauseFlyout(false);
            }}
          >
            <span style={{ fontSize: 'var(--text-sm)' }}>Timer</span>
          </IconButton>
          {showTimerFlyout && (
            <div
              className="absolute bottom-full left-0 mb-1 flex gap-1 p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            >
              {TIMER_PRESETS.map((p) => (
                <Chip
                  key={p.label}
                  label={p.label}
                  selected={false}
                  onSelect={() => handleTimer(p.label, p.minutes)}
                />
              ))}
            </div>
          )}
        </div>

        <IconButton title="Sync calendars" onClick={handleSync}>
          <span style={{ fontSize: 'var(--text-sm)', opacity: syncing ? 0.5 : 1 }}>
            {syncing ? 'Syncing...' : 'Sync'}
          </span>
        </IconButton>
      </div>
    </div>
  );
}

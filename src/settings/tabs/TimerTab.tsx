import { useState, useEffect, useCallback } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { getDefaultPresets } from '@/lib/timer/presets';
import { getRemainingSeconds } from '@/lib/timer/index';
import type { TimerState, TimerPreset } from '@/lib/timer/types';
import { ProgressRing, Card, Button, SectionHeader } from '@/shared/components';
import { useSettings } from '../hooks/useSettings';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(seconds / 60)}m`;
}

function loadCustomPresets(json: string | undefined): TimerPreset[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

export default function TimerTab() {
  const { getSetting, setSetting } = useSettings();
  const defaultPresets = getDefaultPresets();
  const customPresets = loadCustomPresets(getSetting('custom_timer_presets'));
  const allPresets = [...defaultPresets, ...customPresets];

  const [timer, setTimer] = useState<TimerState>({
    status: 'idle',
    durationSeconds: 0,
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
  });
  const [remaining, setRemaining] = useState(0);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  useEffect(() => {
    const unlisten = listen<TimerState>('timer-state-update', (event) => {
      setTimer(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (timer.status !== 'running') {
      if (timer.status === 'paused') {
        setRemaining(getRemainingSeconds(timer, new Date()));
      }
      return;
    }

    function tick() {
      setRemaining(getRemainingSeconds(timer, new Date()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const isActive = timer.status === 'running' || timer.status === 'paused';
  const progress =
    timer.durationSeconds > 0
      ? Math.max(0, Math.min(1, 1 - remaining / timer.durationSeconds))
      : 0;

  const handleStart = useCallback((preset: TimerPreset) => {
    emit('start-timer', preset.durationSeconds);
  }, []);

  const handleStop = useCallback(() => {
    emit('stop-timer', {});
    setTimer({
      status: 'idle',
      durationSeconds: 0,
      startedAt: null,
      pausedAt: null,
      elapsedBeforePause: 0,
    });
    setRemaining(0);
  }, []);

  const handlePause = useCallback(() => {
    emit('pause-timer', {});
  }, []);

  const handleResume = useCallback(() => {
    emit('resume-timer', {});
  }, []);

  const handleAddCustomPreset = useCallback(() => {
    const name = customName.trim();
    const minutes = parseInt(customMinutes, 10);
    if (!name || isNaN(minutes) || minutes <= 0) return;

    const newPreset: TimerPreset = {
      id: `custom-${Date.now()}`,
      name,
      durationSeconds: minutes * 60,
    };

    const updated = [...customPresets, newPreset];
    setSetting('custom_timer_presets', JSON.stringify(updated));
    setCustomName('');
    setCustomMinutes('');
    setShowCustomForm(false);
  }, [customName, customMinutes, customPresets, setSetting]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <SectionHeader
        title="Timer"
        description="Start a focus timer. The border overlay will reflect the timer's progress."
      />

      {/* Active Timer Display */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-6)',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ProgressRing progress={progress} size={96} strokeWidth={4} />
          <span
            style={{
              position: 'absolute',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            {isActive ? formatTime(remaining) : '--:--'}
          </span>
        </div>

        {isActive && (
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {timer.status === 'paused' ? 'Paused' : 'Running'}
          </p>
        )}

        {isActive && (
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {timer.status === 'running' ? (
              <Button variant="secondary" onClick={handlePause}>
                Pause
              </Button>
            ) : (
              <Button variant="primary" onClick={handleResume}>
                Resume
              </Button>
            )}
            <Button variant="ghost" onClick={handleStop}>
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Preset Grid */}
      <section>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-text)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Quick Start
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {allPresets.map((preset) => (
            <Card
              key={preset.id}
              onClick={isActive ? undefined : () => handleStart(preset)}
              className={isActive ? 'opacity-50' : ''}
            >
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: isActive ? 'var(--color-text-muted)' : 'var(--color-text)',
                }}
              >
                {preset.name}
              </p>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  marginTop: 'var(--space-1)',
                }}
              >
                {formatDuration(preset.durationSeconds)}
              </p>
            </Card>
          ))}

          {/* Add custom preset card */}
          {!showCustomForm ? (
            <Card
              onClick={isActive ? undefined : () => setShowCustomForm(true)}
              className={isActive ? 'opacity-50' : ''}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xl)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  +
                </span>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  placeholder="Name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  style={{
                    fontSize: 'var(--text-sm)',
                    padding: 'var(--space-1) var(--space-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    backgroundColor: 'var(--color-surface-base)',
                    color: 'var(--color-text)',
                  }}
                />
                <input
                  type="number"
                  placeholder="Minutes"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  min={1}
                  style={{
                    fontSize: 'var(--text-sm)',
                    padding: 'var(--space-1) var(--space-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    backgroundColor: 'var(--color-surface-base)',
                    color: 'var(--color-text)',
                  }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button variant="primary" onClick={handleAddCustomPreset}>
                    Add
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCustomForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

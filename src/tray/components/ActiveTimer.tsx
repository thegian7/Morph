import React, { useState, useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { ProgressRing, IconButton } from '../../shared/components';

interface TimerState {
  status: string;
  duration_seconds: number;
  remaining_seconds: number;
  preset_name?: string;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ActiveTimer() {
  const [timer, setTimer] = useState<TimerState | null>(null);

  useEffect(() => {
    const unlisten = listen<TimerState>('timer-state-update', (event) => {
      const state = event.payload;
      if (state.status === 'idle' || state.status === 'stopped') {
        setTimer(null);
      } else {
        setTimer(state);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  if (!timer) return null;

  const progress = timer.duration_seconds > 0
    ? 1 - (timer.remaining_seconds / timer.duration_seconds)
    : 0;

  const isPaused = timer.status === 'paused';

  return (
    <div className="px-4 py-2 flex items-center gap-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
      <ProgressRing progress={progress} size={48} strokeWidth={3} />
      <div className="flex-1">
        {timer.preset_name && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {timer.preset_name}
          </div>
        )}
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
          {formatCountdown(timer.remaining_seconds)}
        </div>
      </div>
      <div className="flex gap-1">
        <IconButton
          title={isPaused ? 'Resume timer' : 'Pause timer'}
          onClick={() => emit(isPaused ? 'resume-timer' : 'pause-timer')}
        >
          <span style={{ fontSize: 'var(--text-sm)' }}>{isPaused ? 'Resume' : 'Pause'}</span>
        </IconButton>
        <IconButton title="Stop timer" onClick={() => emit('stop-timer')}>
          <span style={{ fontSize: 'var(--text-sm)' }}>Stop</span>
        </IconButton>
      </div>
    </div>
  );
}

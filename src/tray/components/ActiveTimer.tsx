import React, { useState, useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { ProgressRing, IconButton } from '../../shared/components';
import { getRemainingSeconds } from '@/lib/timer/index';
import type { TimerState } from '@/lib/timer/types';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ActiveTimer() {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const unlisten = listen<TimerState>('timer-state-update', (event) => {
      const state = event.payload;
      if (state.status === 'idle' || state.status === 'stopped') {
        setTimer(null);
      } else {
        setTimer(state);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!timer) return;
    function tick() {
      setRemaining(getRemainingSeconds(timer!, new Date()));
    }
    tick();
    if (timer.status !== 'running') return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer]);

  if (!timer) return null;

  const progress =
    timer.durationSeconds > 0 ? Math.max(0, Math.min(1, 1 - remaining / timer.durationSeconds)) : 0;

  const isPaused = timer.status === 'paused';

  return (
    <div
      className="px-4 py-2 flex items-center gap-3"
      style={{ borderTop: '1px solid var(--color-border-subtle)' }}
    >
      <ProgressRing progress={progress} size={48} strokeWidth={3} />
      <div className="flex-1">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {isPaused ? 'Paused' : 'Timer'}
        </div>
        <div
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            color: 'var(--color-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatCountdown(remaining)}
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

import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge } from '../../shared/components';

/** Matches the color engine's BorderState payload broadcast by the overlay. */
interface BorderState {
  phase: string;
  color: string;
  opacity: number;
  pulseSpeed: number;
}

/** Map a color-engine phase to a headline + optional detail line. */
function describePhase(phase: string): { label: string; detail?: string } {
  if (phase === 'no-events') return { label: 'No Events' };
  if (phase === 'free-deep') return { label: 'Free', detail: 'No meetings for a while' };
  if (phase === 'warning-far') return { label: 'Meeting Soon', detail: 'About 30 minutes away' };
  if (phase === 'warning-mid') return { label: 'Meeting Soon', detail: 'About 15 minutes away' };
  if (phase === 'warning-near') return { label: 'Meeting Soon', detail: 'About 5 minutes away' };
  if (phase === 'warning-imminent') return { label: 'Meeting Soon', detail: 'Starting any minute' };
  if (phase === 'overtime') return { label: 'Overtime', detail: 'The meeting has run over' };
  if (phase.startsWith('in-session')) return { label: 'In Session' };
  if (phase.startsWith('gap-')) return { label: 'Break', detail: 'Gap between meetings' };
  return { label: 'Free' };
}

export function StatusHeader() {
  const [borderState, setBorderState] = useState<BorderState>({
    phase: 'no-events',
    color: '',
    opacity: 0,
    pulseSpeed: 0,
  });

  useEffect(() => {
    const unlisten = listen<BorderState>('border-state-update', (event) => {
      setBorderState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const { label, detail } = describePhase(borderState.phase);

  return (
    <div
      data-testid="status-header"
      className="px-4 py-3"
      style={{
        backgroundColor: borderState.color
          ? `color-mix(in srgb, ${borderState.color} 10%, var(--color-surface-base))`
          : 'var(--color-surface-base)',
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
          {label}
        </span>
        {borderState.phase !== 'no-events' && (
          <Badge color={borderState.color || 'var(--color-text-muted)'} text={label} />
        )}
      </div>
      {detail && (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            marginTop: 'var(--space-1)',
          }}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

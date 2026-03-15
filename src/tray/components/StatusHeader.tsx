import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge } from '../../shared/components';

interface BorderState {
  phase: string;
  color: string;
  opacity: number;
  status_text: string;
}

export function StatusHeader() {
  const [borderState, setBorderState] = useState<BorderState>({
    phase: 'none',
    color: 'var(--color-text-muted)',
    opacity: 0,
    status_text: 'No events',
  });

  useEffect(() => {
    const unlisten = listen<BorderState>('border-state-update', (event) => {
      setBorderState(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const phaseLabels: Record<string, string> = {
    free: 'Free',
    warning: 'Meeting Soon',
    session: 'In Session',
    overtime: 'Overtime',
    paused: 'Paused',
    none: 'No Events',
  };

  const label = phaseLabels[borderState.phase] ?? 'No Events';

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
        <Badge color={borderState.color || 'var(--color-text-muted)'} text={borderState.phase} />
      </div>
      {borderState.status_text && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          {borderState.status_text}
        </p>
      )}
    </div>
  );
}

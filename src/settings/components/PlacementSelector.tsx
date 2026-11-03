import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, Button } from '@/shared/components';

export const PLACEMENT_OPTIONS = [
  {
    value: 'fit',
    label: 'Fit around menu bar & Dock',
    description: 'Tints the menu bar and the edge behind your Dock. Never covers your windows.',
  },
  {
    value: 'reserve',
    label: 'Reserve space',
    description:
      'Draws on every edge and keeps windows out of it, so your screen gets a little smaller. Needs Accessibility access.',
  },
  {
    value: 'overlay',
    label: 'Overlay',
    description: 'Draws along the screen edges on top of everything.',
  },
] as const;

/** Placement is a macOS-only feature (Windows has its own AppBar story). */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || '') || /Macintosh/i.test(navigator.userAgent || '');
}

const ACCESS_POLL_MS = 2000;

function AccessibilityStatus() {
  const [trusted, setTrusted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      invoke<boolean>('accessibility_status')
        .then((value) => {
          if (!cancelled) setTrusted(value);
        })
        .catch(() => {});
    check();
    // Re-check while visible so granting access in System Settings is
    // reflected without reopening the window.
    const id = setInterval(check, ACCESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (trusted === null) return null;

  if (trusted) {
    return (
      <p
        data-testid="accessibility-status"
        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
      >
        Accessibility access granted — windows will stay clear of the border.
      </p>
    );
  }

  return (
    <div data-testid="accessibility-status" className="flex items-center gap-3">
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        Morph needs Accessibility access to move windows out of the border.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          invoke<boolean>('request_accessibility')
            .then(setTrusted)
            .catch(() => {});
        }}
      >
        Grant Access
      </Button>
    </div>
  );
}

export function PlacementSelector({
  mode,
  onChange,
}: {
  mode: string;
  onChange: (mode: string) => void;
}) {
  const current = PLACEMENT_OPTIONS.some((o) => o.value === mode) ? mode : 'fit';

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {PLACEMENT_OPTIONS.map((opt) => (
          <Card
            key={opt.value}
            className="flex-1 basis-0"
            selected={current === opt.value}
            onClick={() => onChange(opt.value)}
          >
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              {opt.label}
            </span>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px',
              }}
            >
              {opt.description}
            </p>
          </Card>
        ))}
      </div>
      {current === 'fit' && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          Edges with nothing reserved (for example, the sides when your Dock is at the bottom) stay
          hidden.
        </p>
      )}
      {current === 'reserve' && <AccessibilityStatus />}
    </div>
  );
}

export default PlacementSelector;

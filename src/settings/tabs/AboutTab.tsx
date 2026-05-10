import { open } from '@tauri-apps/plugin-shell';
import { Card, Button } from '../../shared/components';

const KOFI_URL = 'https://ko-fi.com/morphlight';

export default function AboutTab() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="#4A9B6E" strokeWidth="2" />
            <circle cx="12" cy="12" r="5" fill="#4A9B6E" />
          </svg>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
              Morph
            </h2>
            <span
              className="inline-block px-2 py-0.5 rounded-full"
              style={{
                fontSize: 'var(--text-xs)',
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              v0.1.0
            </span>
          </div>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Ambient screen border overlay that changes color based on upcoming calendar events. Built
          for people with time blindness.
        </p>
      </Card>

      <Card>
        <p
          className="mb-2"
          style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-text)' }}
        >
          Support Morph
        </p>
        <p className="mb-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Morph is free and open source. If it helps you, consider supporting development.
        </p>
        <button
          onClick={() => open(KOFI_URL)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer"
          style={{
            fontSize: 'var(--text-sm)',
            backgroundColor: 'var(--color-danger)',
            color: '#FFFFFF',
            border: 'none',
            transition: 'var(--transition-fast)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Support Morph on Ko-fi
        </button>
      </Card>

      <Card>
        <p
          className="mb-3"
          style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-text)' }}
        >
          Links
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => open('https://github.com/thegian7/Morph')}>
            GitHub
          </Button>
          <Button
            variant="secondary"
            onClick={() => open('https://github.com/thegian7/Morph/issues')}
          >
            Report an Issue
          </Button>
        </div>
      </Card>

      <Card>
        <p
          className="mb-1"
          style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-text)' }}
        >
          License
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>GPL-3.0</p>
      </Card>
    </div>
  );
}

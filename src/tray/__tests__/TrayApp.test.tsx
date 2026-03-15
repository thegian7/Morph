// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mock window.matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    close: vi.fn(),
  }),
}));

import { TrayApp } from '../App';

afterEach(() => {
  cleanup();
});

describe('TrayApp', () => {
  it('renders status header', () => {
    render(<TrayApp />);
    expect(screen.getByTestId('status-header')).toBeDefined();
  });

  it('renders Up Next section', () => {
    render(<TrayApp />);
    expect(screen.getByText('UP NEXT')).toBeDefined();
  });

  it('renders quick action buttons', () => {
    render(<TrayApp />);
    expect(screen.getByText('Pause')).toBeDefined();
    expect(screen.getByText('Timer')).toBeDefined();
    expect(screen.getByText('Sync')).toBeDefined();
  });

  it('renders footer with settings link', () => {
    render(<TrayApp />);
    expect(screen.getByTestId('settings-link')).toBeDefined();
  });
});

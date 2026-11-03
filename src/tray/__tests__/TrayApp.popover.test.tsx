// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

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
  default: {
    load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }),
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let focusHandler: ((e: { payload: boolean }) => void) | null = null;
const closeMock = vi.fn();
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn((cb: (e: { payload: boolean }) => void) => {
      focusHandler = cb;
      return Promise.resolve(() => {});
    }),
    close: closeMock,
  })),
}));

import { TrayApp } from '../App';

beforeEach(() => {
  invokeMock.mockClear();
  closeMock.mockClear();
  focusHandler = null;
  document.documentElement.classList.remove('vibrant');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TrayApp popover behaviour', () => {
  it('asks Rust to hide (not close) the popover when it loses focus', () => {
    render(<TrayApp />);
    expect(focusHandler).not.toBeNull();
    focusHandler!({ payload: false });
    expect(invokeMock).toHaveBeenCalledWith('hide_tray_popover');
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('ignores gaining focus', () => {
    render(<TrayApp />);
    focusHandler!({ payload: true });
    expect(invokeMock).not.toHaveBeenCalledWith('hide_tray_popover');
  });

  it('hides on Escape', () => {
    render(<TrayApp />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(invokeMock).toHaveBeenCalledWith('hide_tray_popover');
  });

  it('uses a translucent background over native vibrancy on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
    const { container } = render(<TrayApp />);
    expect(document.documentElement.classList.contains('vibrant')).toBe(true);
    const root = container.querySelector('#tray-popover') as HTMLElement;
    expect(root.style.backgroundColor).toContain('color-mix');
  });

  it('keeps an opaque background elsewhere', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    const { container } = render(<TrayApp />);
    expect(document.documentElement.classList.contains('vibrant')).toBe(false);
    const root = container.querySelector('#tray-popover') as HTMLElement;
    expect(root.style.backgroundColor).not.toContain('color-mix');
  });
});

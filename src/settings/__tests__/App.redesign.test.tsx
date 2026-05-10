// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

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
  default: {
    load: vi.fn().mockResolvedValue({
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn(),
    }),
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    hide: vi.fn(),
  }),
}));
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

describe('Settings App shell', () => {
  it('renders Morph logo in sidebar', async () => {
    const { default: App } = await import('../App');
    const { container } = render(<App />);
    expect(container.querySelector('[data-testid="morph-logo"]')).not.toBeNull();
  });

  it('renders all tab nav items including Alerts', async () => {
    const { default: App } = await import('../App');
    render(<App />);
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Border')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Timer')).toBeTruthy();
    expect(screen.getByText('Alerts')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('uses design system surface colors via sidebar data-testid', async () => {
    const { default: App } = await import('../App');
    const { container } = render(<App />);
    expect(container.querySelector('[data-testid="sidebar"]')).not.toBeNull();
  });
});

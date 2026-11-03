// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GeneralTab, { parseDisabledDisplays, toggleDisabledDisplay } from '../tabs/GeneralTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const MONITORS = [
  {
    id: 'display-610-a04f-0',
    name: 'Built-in Retina Display',
    width: 1512,
    height: 982,
    x: 0,
    y: 0,
    is_primary: true,
  },
  {
    id: 'display-10ac-42f5-1',
    name: 'DELL U2723QE',
    width: 2560,
    height: 1440,
    x: 1512,
    y: 0,
    is_primary: false,
  },
];

function renderWith(disabled: string) {
  const settings = new Map<string, string>([
    ['launch_at_login', 'false'],
    ['theme_preference', 'system'],
    ['disabled_displays', disabled],
  ]);
  const setSetting = vi.fn();
  render(
    <SettingsContext.Provider
      value={
        {
          settings,
          loading: false,
          getSetting: (k: string) => settings.get(k),
          setSetting,
        } as SettingsContextValue
      }
    >
      <GeneralTab />
    </SettingsContext.Provider>,
  );
  return { setSetting };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
  mockInvoke.mockResolvedValue(MONITORS);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('disabled_displays helpers', () => {
  it('parses forgivingly', () => {
    expect(parseDisabledDisplays('["a","b"]')).toEqual(['a', 'b']);
    expect(parseDisabledDisplays(undefined)).toEqual([]);
    expect(parseDisabledDisplays('nope')).toEqual([]);
    expect(parseDisabledDisplays('[1,"a"]')).toEqual(['a']);
  });

  it('toggles a display in and out of the list', () => {
    expect(toggleDisabledDisplay([], 'a')).toBe('["a"]');
    expect(toggleDisabledDisplay(['a', 'b'], 'a')).toBe('["b"]');
  });
});

describe('GeneralTab displays (macOS)', () => {
  it('shows one switch per display, on unless disabled', async () => {
    renderWith('["display-10ac-42f5-1"]');
    const builtIn = await screen.findByRole('switch', { name: /Built-in Retina Display/ });
    const dell = screen.getByRole('switch', { name: /DELL U2723QE/ });
    expect(builtIn.getAttribute('aria-checked')).toBe('true');
    expect(dell.getAttribute('aria-checked')).toBe('false');
  });

  it('turning a display off writes it to disabled_displays', async () => {
    const { setSetting } = renderWith('[]');
    fireEvent.click(await screen.findByRole('switch', { name: /DELL U2723QE/ }));
    expect(setSetting).toHaveBeenCalledWith('disabled_displays', '["display-10ac-42f5-1"]');
  });

  it('warns when every display is off', async () => {
    renderWith('["display-610-a04f-0","display-10ac-42f5-1"]');
    expect(await screen.findByTestId('all-displays-off')).toBeDefined();
  });

  it('refreshes the list when displays are connected or disconnected', async () => {
    renderWith('[]');
    await waitFor(() =>
      expect(mockListen).toHaveBeenCalledWith('displays-changed', expect.any(Function)),
    );
    const handler = mockListen.mock.calls.find(
      (c) => c[0] === 'displays-changed',
    )![1] as () => void;
    const before = mockInvoke.mock.calls.length;
    handler();
    expect(mockInvoke.mock.calls.length).toBe(before + 1);
    expect(mockInvoke).toHaveBeenLastCalledWith('get_available_monitors');
  });

  it('does not show the single-choice selector on macOS', async () => {
    renderWith('[]');
    await screen.findByRole('switch', { name: /DELL/ });
    expect(screen.queryByText('Choose which monitor shows the border overlay.')).toBeNull();
  });
});

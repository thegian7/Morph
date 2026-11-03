// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GeneralTab from '../tabs/GeneralTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';
import { invoke } from '@tauri-apps/api/core';

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

const mockInvoke = vi.mocked(invoke);

function respond(login: unknown, setResult?: unknown) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_login_item_status') return Promise.resolve(login);
    if (cmd === 'set_login_item') return Promise.resolve(setResult);
    if (cmd === 'get_available_monitors') return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
}

function renderWith(saved: string) {
  const settings = new Map<string, string>([
    ['launch_at_login', saved],
    ['theme_preference', 'system'],
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

const launchSwitch = () => screen.getByRole('switch', { name: /launch at login/i });

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('GeneralTab launch at login', () => {
  it('shows the real login-item state over the saved setting', async () => {
    respond({ enabled: false, requiresApproval: false, backend: 'sm-app-service' });
    renderWith('true');
    await waitFor(() => expect(launchSwitch().getAttribute('aria-checked')).toBe('false'));
  });

  it('falls back to the saved setting when status is unavailable', async () => {
    respond(undefined);
    renderWith('true');
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('get_login_item_status'));
    expect(launchSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('toggling registers the login item through Rust and records the setting', async () => {
    respond(
      { enabled: false, requiresApproval: false, backend: 'sm-app-service' },
      { enabled: true, requiresApproval: false, backend: 'sm-app-service' },
    );
    const { setSetting } = renderWith('false');
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('get_login_item_status'));
    fireEvent.click(launchSwitch());
    expect(setSetting).toHaveBeenCalledWith('launch_at_login', 'true');
    expect(mockInvoke).toHaveBeenCalledWith('set_login_item', { enabled: true });
    await waitFor(() => expect(launchSwitch().getAttribute('aria-checked')).toBe('true'));
  });

  it('points to System Settings when the login item needs approval', async () => {
    respond({ enabled: false, requiresApproval: true, backend: 'sm-app-service' });
    renderWith('true');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Login Items' }));
    expect(mockInvoke).toHaveBeenCalledWith('open_login_items_settings');
  });

  it('shows no approval hint normally', async () => {
    respond({ enabled: true, requiresApproval: false, backend: 'launch-agent' });
    renderWith('true');
    await waitFor(() => expect(launchSwitch().getAttribute('aria-checked')).toBe('true'));
    expect(screen.queryByTestId('login-item-approval')).toBeNull();
  });
});

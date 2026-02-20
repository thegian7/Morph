// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GeneralTab from '../tabs/GeneralTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
}));

function renderWithSettings(overrides: Partial<SettingsContextValue> = {}) {
  const defaultSettings = new Map<string, string>([['launch_at_login', 'false']]);

  const value: SettingsContextValue = {
    settings: defaultSettings,
    loading: false,
    getSetting: (key: string) => defaultSettings.get(key),
    setSetting: vi.fn(),
    ...overrides,
  };

  return { ...render(
    <SettingsContext.Provider value={value}>
      <GeneralTab />
    </SettingsContext.Provider>,
  ), settingsValue: value };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GeneralTab', () => {
  it('renders launch at login toggle', () => {
    renderWithSettings();
    expect(screen.getByRole('switch', { name: /launch at login/i })).toBeDefined();
  });

  it('toggle reflects current setting value when false', () => {
    renderWithSettings();
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggle reflects current setting value when true', () => {
    const settings = new Map<string, string>([['launch_at_login', 'true']]);
    renderWithSettings({
      settings,
      getSetting: (key: string) => settings.get(key),
    });
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking toggle calls setSetting', () => {
    const { settingsValue } = renderWithSettings();
    const toggle = screen.getByRole('switch', { name: /launch at login/i });
    fireEvent.click(toggle);
    expect(settingsValue.setSetting).toHaveBeenCalledWith('launch_at_login', 'true');
  });

  it('renders pause section with button', () => {
    renderWithSettings();
    expect(screen.getByRole('button', { name: /pause border/i })).toBeDefined();
  });

  it('shows duration options when pause button clicked', () => {
    renderWithSettings();
    fireEvent.click(screen.getByRole('button', { name: /pause border/i }));
    expect(screen.getByText('5 min')).toBeDefined();
    expect(screen.getByText('15 min')).toBeDefined();
    expect(screen.getByText('30 min')).toBeDefined();
    expect(screen.getByText('60 min')).toBeDefined();
    expect(screen.getByText('Until next event')).toBeDefined();
  });

  it('shows version info', () => {
    renderWithSettings();
    expect(screen.getByText('Version 0.1.0')).toBeDefined();
  });

  it('renders about section with app name and version', () => {
    renderWithSettings();
    expect(screen.getByText('LightTime')).toBeDefined();
    expect(screen.getByText('Version 0.1.0')).toBeDefined();
    expect(screen.getByText('Ambient screen border timer')).toBeDefined();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GeneralTab from '../tabs/GeneralTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

function renderWithSettings(overrides: Partial<SettingsContextValue> = {}) {
  const defaultSettings = new Map<string, string>([
    ['launch_at_login', 'false'],
    ['selected_display', 'primary'],
  ]);

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
  // Default: invoke returns empty monitors list (single-monitor scenario)
  mockInvoke.mockResolvedValue([]);
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

  // Version and about info were moved to AboutTab (Task 9).

  describe('Display Picker', () => {
    it('does not show display section when only one monitor', async () => {
      mockInvoke.mockResolvedValue([
        { id: 'primary', name: 'Built-in Display', width: 1728, height: 1117, x: 0, y: 0, is_primary: true },
      ]);
      renderWithSettings();

      // Wait for the invoke to resolve
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_available_monitors');
      });

      expect(screen.queryByText('Display')).toBeNull();
    });

    it('shows display section when multiple monitors are connected', async () => {
      mockInvoke.mockResolvedValue([
        { id: 'primary', name: 'Built-in Display', width: 1728, height: 1117, x: 0, y: 0, is_primary: true },
        { id: 'DELL U2723QE:1728x0', name: 'DELL U2723QE', width: 2560, height: 1440, x: 1728, y: 0, is_primary: false },
      ]);
      renderWithSettings();

      await waitFor(() => {
        expect(screen.getByText('Display')).toBeDefined();
      });

      expect(screen.getByText('Built-in Display')).toBeDefined();
      expect(screen.getByText('DELL U2723QE')).toBeDefined();
      expect(screen.getByText('(Primary)')).toBeDefined();
    });

    it('calls setSetting when clicking a display button', async () => {
      mockInvoke.mockResolvedValue([
        { id: 'primary', name: 'Built-in Display', width: 1728, height: 1117, x: 0, y: 0, is_primary: true },
        { id: 'DELL U2723QE:1728x0', name: 'DELL U2723QE', width: 2560, height: 1440, x: 1728, y: 0, is_primary: false },
      ]);
      const { settingsValue } = renderWithSettings();

      await waitFor(() => {
        expect(screen.getByText('DELL U2723QE')).toBeDefined();
      });

      fireEvent.click(screen.getByText('DELL U2723QE'));
      expect(settingsValue.setSetting).toHaveBeenCalledWith('selected_display', 'DELL U2723QE:1728x0');
    });
  });
});

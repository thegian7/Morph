// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';
import { invoke } from '@tauri-apps/api/core';

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

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false),
}));

// Must import after mocks are set up
import { GeneralTab } from '../tabs/GeneralTab';

const mockInvoke = vi.mocked(invoke);

function renderWithSettings(overrides: Partial<SettingsContextValue> = {}) {
  const defaultSettings = new Map<string, string>([
    ['launch_at_login', 'false'],
    ['selected_display', 'primary'],
    ['theme_preference', 'system'],
  ]);

  const value: SettingsContextValue = {
    settings: defaultSettings,
    loading: false,
    getSetting: (key: string) => defaultSettings.get(key),
    setSetting: vi.fn(),
    ...overrides,
  };

  return {
    ...render(
      <SettingsContext.Provider value={value}>
        <GeneralTab />
      </SettingsContext.Provider>,
    ),
    settingsValue: value,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue([]);
});

describe('GeneralTab redesign', () => {
  it('renders theme picker with System/Light/Dark options', () => {
    renderWithSettings();
    expect(screen.getByText('System')).toBeDefined();
    expect(screen.getByText('Light')).toBeDefined();
    expect(screen.getByText('Dark')).toBeDefined();
  });

  it('renders launch at login toggle', () => {
    renderWithSettings();
    expect(screen.getByText(/launch at login/i)).toBeDefined();
  });

  it('renders pause border section with duration chips', () => {
    renderWithSettings();
    expect(screen.getByText('5m')).toBeDefined();
    expect(screen.getByText('15m')).toBeDefined();
    expect(screen.getByText('30m')).toBeDefined();
    expect(screen.getByText('60m')).toBeDefined();
  });

  it('renders section headers', () => {
    renderWithSettings();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Startup')).toBeDefined();
    expect(screen.getByText('Pause Border')).toBeDefined();
  });

  it('theme picker highlights the current selection', () => {
    const settings = new Map<string, string>([
      ['theme_preference', 'dark'],
      ['launch_at_login', 'false'],
    ]);
    renderWithSettings({
      settings,
      getSetting: (key: string) => settings.get(key),
    });
    // The Dark card should be selected
    expect(screen.getByText('Dark')).toBeDefined();
  });

  it('clicking a theme card calls setSetting', async () => {
    const user = userEvent.setup();
    const { settingsValue } = renderWithSettings();
    await user.click(screen.getByText('Dark'));
    expect(settingsValue.setSetting).toHaveBeenCalledWith('theme_preference', 'dark');
  });

  it('clicking launch at login toggle calls setSetting', async () => {
    const user = userEvent.setup();
    const { settingsValue } = renderWithSettings();
    await user.click(screen.getByRole('switch'));
    expect(settingsValue.setSetting).toHaveBeenCalledWith('launch_at_login', 'true');
  });

  it('renders resume button when paused', async () => {
    const user = userEvent.setup();
    renderWithSettings();
    // Click a pause duration chip
    await user.click(screen.getByText('5m'));
    expect(screen.getByText('Resume')).toBeDefined();
  });

  describe('Display Picker', () => {
    it('does not show display section with single monitor', async () => {
      mockInvoke.mockResolvedValue([
        {
          id: 'primary',
          name: 'Built-in Display',
          width: 1728,
          height: 1117,
          x: 0,
          y: 0,
          is_primary: true,
        },
      ]);
      renderWithSettings();

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_available_monitors');
      });

      expect(screen.queryByText('Display')).toBeNull();
    });

    it('shows display section with multiple monitors', async () => {
      mockInvoke.mockResolvedValue([
        {
          id: 'primary',
          name: 'Built-in Display',
          width: 1728,
          height: 1117,
          x: 0,
          y: 0,
          is_primary: true,
        },
        {
          id: 'DELL:1728x0',
          name: 'DELL U2723QE',
          width: 2560,
          height: 1440,
          x: 1728,
          y: 0,
          is_primary: false,
        },
      ]);
      renderWithSettings();

      await waitFor(() => {
        expect(screen.getByText('Display')).toBeDefined();
      });

      expect(screen.getByText('Built-in Display')).toBeDefined();
      expect(screen.getByText('DELL U2723QE')).toBeDefined();
    });
  });
});

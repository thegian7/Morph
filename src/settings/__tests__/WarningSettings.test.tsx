// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsContext, type SettingsContextValue } from '../hooks/useSettings';
import WarningSettings from '../components/WarningSettings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function createMockSettings(overrides: Record<string, string> = {}): SettingsContextValue {
  const defaults: Record<string, string> = {
    warning_30min: 'true',
    warning_15min: 'true',
    warning_5min: 'true',
    warning_2min: 'true',
    ...overrides,
  };
  const map = new Map(Object.entries(defaults));

  return {
    settings: map,
    loading: false,
    getSetting: vi.fn((key: string) => map.get(key)),
    setSetting: vi.fn(),
  };
}

function renderWithSettings(
  ui: React.ReactElement,
  settingsValue: SettingsContextValue,
) {
  return render(
    <SettingsContext.Provider value={settingsValue}>
      {ui}
    </SettingsContext.Provider>,
  );
}

describe('WarningSettings', () => {
  let mockCtx: SettingsContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockSettings();
  });

  it('renders all 4 warning thresholds', () => {
    renderWithSettings(<WarningSettings />, mockCtx);

    expect(screen.getByText('30 minutes before')).toBeDefined();
    expect(screen.getByText('15 minutes before')).toBeDefined();
    expect(screen.getByText('5 minutes before')).toBeDefined();
    expect(screen.getByText('2 minutes before')).toBeDefined();
  });

  it('shows Pro badge on 30min and 15min thresholds', () => {
    renderWithSettings(<WarningSettings />, mockCtx);

    const proBadges = screen.getAllByText('Pro');
    expect(proBadges).toHaveLength(2);
  });

  it('disables 30min and 15min toggles for free tier', () => {
    renderWithSettings(<WarningSettings isPro={false} />, mockCtx);

    const toggle30 = screen.getByRole('switch', { name: 'Toggle 30 minutes before' });
    const toggle15 = screen.getByRole('switch', { name: 'Toggle 15 minutes before' });
    const toggle5 = screen.getByRole('switch', { name: 'Toggle 5 minutes before' });
    const toggle2 = screen.getByRole('switch', { name: 'Toggle 2 minutes before' });

    expect(toggle30.hasAttribute('disabled')).toBe(true);
    expect(toggle15.hasAttribute('disabled')).toBe(true);
    expect(toggle5.hasAttribute('disabled')).toBe(false);
    expect(toggle2.hasAttribute('disabled')).toBe(false);
  });

  it('shows upgrade message for disabled thresholds in free tier', () => {
    renderWithSettings(<WarningSettings isPro={false} />, mockCtx);

    const upgradeMessages = screen.getAllByText(/Upgrade to Pro/);
    expect(upgradeMessages).toHaveLength(2);
  });

  it('enables all toggles when isPro is true', () => {
    renderWithSettings(<WarningSettings isPro={true} />, mockCtx);

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(4);
    switches.forEach((toggle) => {
      expect(toggle.hasAttribute('disabled')).toBe(false);
    });
  });

  it('does not show upgrade messages when isPro is true', () => {
    renderWithSettings(<WarningSettings isPro={true} />, mockCtx);

    expect(screen.queryByText(/Upgrade to Pro/)).toBeNull();
  });

  it('calls setSetting when toggling a free-tier switch off', async () => {
    const user = userEvent.setup();
    renderWithSettings(<WarningSettings isPro={false} />, mockCtx);

    const toggle5 = screen.getByRole('switch', { name: 'Toggle 5 minutes before' });
    await user.click(toggle5);

    expect(mockCtx.setSetting).toHaveBeenCalledWith('warning_5min', 'false');
  });

  it('calls setSetting when toggling a free-tier switch on', async () => {
    const user = userEvent.setup();
    mockCtx = createMockSettings({ warning_5min: 'false' });
    renderWithSettings(<WarningSettings isPro={false} />, mockCtx);

    const toggle5 = screen.getByRole('switch', { name: 'Toggle 5 minutes before' });
    await user.click(toggle5);

    expect(mockCtx.setSetting).toHaveBeenCalledWith('warning_5min', 'true');
  });

  it('does NOT call setSetting when clicking a pro-gated toggle in free tier', async () => {
    const user = userEvent.setup();
    renderWithSettings(<WarningSettings isPro={false} />, mockCtx);

    const toggle30 = screen.getByRole('switch', { name: 'Toggle 30 minutes before' });
    await user.click(toggle30);

    expect(mockCtx.setSetting).not.toHaveBeenCalled();
  });

  it('calls setSetting when toggling a pro-gated switch with isPro', async () => {
    const user = userEvent.setup();
    renderWithSettings(<WarningSettings isPro={true} />, mockCtx);

    const toggle30 = screen.getByRole('switch', { name: 'Toggle 30 minutes before' });
    await user.click(toggle30);

    expect(mockCtx.setSetting).toHaveBeenCalledWith('warning_30min', 'false');
  });

  it('reflects current setting values via aria-checked', () => {
    mockCtx = createMockSettings({ warning_5min: 'false', warning_2min: 'true' });
    renderWithSettings(<WarningSettings />, mockCtx);

    const toggle5 = screen.getByRole('switch', { name: 'Toggle 5 minutes before' });
    const toggle2 = screen.getByRole('switch', { name: 'Toggle 2 minutes before' });

    expect(toggle5.getAttribute('aria-checked')).toBe('false');
    expect(toggle2.getAttribute('aria-checked')).toBe('true');
  });
});

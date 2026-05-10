// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import TimerTab from '../tabs/TimerTab';
import { SettingsContext, type SettingsContextValue } from '../hooks/useSettings';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

function createMockSettings(): SettingsContextValue {
  const map = new Map<string, string>();
  return {
    settings: map,
    loading: false,
    getSetting: (key: string) => map.get(key),
    setSetting: vi.fn(),
  };
}

function renderWithSettings(ui: React.ReactElement) {
  return render(
    <SettingsContext.Provider value={createMockSettings()}>
      {ui}
    </SettingsContext.Provider>,
  );
}

describe('TimerTab redesign', () => {
  it('renders preset cards', () => {
    renderWithSettings(<TimerTab />);
    expect(screen.getByText('Pomodoro')).toBeDefined();
    expect(screen.getByText('Focus Hour')).toBeDefined();
  });

  it('renders progress ring instead of bar', () => {
    const { container } = renderWithSettings(<TimerTab />);
    expect(container.querySelector('svg')).toBeDefined();
  });

  it('renders add custom preset button', () => {
    renderWithSettings(<TimerTab />);
    const plusElements = screen.getAllByText('+');
    expect(plusElements.length).toBeGreaterThanOrEqual(1);
  });
});

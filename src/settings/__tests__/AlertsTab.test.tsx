// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AlertsTab from '../tabs/AlertsTab';
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

describe('AlertsTab', () => {
  it('renders warning threshold toggles', () => {
    renderWithSettings(<AlertsTab />);
    expect(screen.getByText('30 minutes')).toBeDefined();
    expect(screen.getByText('15 minutes')).toBeDefined();
    expect(screen.getByText('5 minutes')).toBeDefined();
    expect(screen.getByText('2 minutes')).toBeDefined();
  });
});

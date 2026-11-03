// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import BorderTab from '../tabs/BorderTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';

function renderWith(mode: string, position = 'all') {
  const settings = new Map([
    ['border_thickness', 'medium'],
    ['border_position', position],
    ['border_mode', mode],
    ['selected_display', 'primary'],
    ['color_palette', 'ambient'],
    ['color_intensity', 'normal'],
  ]);
  const value: SettingsContextValue = {
    settings,
    loading: false,
    getSetting: (k) => settings.get(k),
    setSetting: vi.fn(),
  };
  return render(
    <SettingsContext.Provider value={value}>
      <BorderTab />
    </SettingsContext.Provider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) =>
    cmd === 'get_reserved_edges'
      ? Promise.resolve({ top: true, bottom: true, left: false, right: false })
      : Promise.resolve(true),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BorderTab in Fit mode (macOS)', () => {
  it('asks Rust which edges are reserved on the selected display', async () => {
    renderWith('fit');
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('get_reserved_edges', { monitorId: 'primary' }),
    );
  });

  it('marks enabled edges without reserved space and explains why', async () => {
    renderWith('fit');
    const hint = await screen.findByTestId('hidden-edges-hint');
    expect(hint.textContent).toMatch(/^Left and right edges stay hidden in Fit mode/);
    expect(
      screen.getByRole('button', { name: /Toggle left edge \(hidden in Fit mode\)/ }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Toggle top edge' })).toBeDefined();
  });

  it('shows no hint when every enabled edge has reserved space', async () => {
    renderWith('fit', 'top');
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByTestId('hidden-edges-hint')).toBeNull();
  });

  it('does not query or hint outside Fit mode', () => {
    renderWith('overlay');
    expect(invokeMock).not.toHaveBeenCalledWith('get_reserved_edges', expect.anything());
    expect(screen.queryByTestId('hidden-edges-hint')).toBeNull();
  });
});

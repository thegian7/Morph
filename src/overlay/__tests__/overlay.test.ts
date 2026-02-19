import { describe, it, expect, vi } from 'vitest';

// Mock Tauri APIs before importing the module under test.
// The overlay module calls setup() on import, so we must mock first.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setIgnoreCursorEvents: vi.fn(),
  })),
}));

import { applyBorderState, type BorderStatePayload } from '../overlay.js';

/** Create a minimal mock HTMLElement with a style object. */
function mockElement(): HTMLElement {
  return { style: {} } as unknown as HTMLElement;
}

describe('applyBorderState', () => {
  it('sets backgroundColor and opacity from state', () => {
    const el = mockElement();
    const state: BorderStatePayload = {
      color: '#4A9B6E',
      opacity: 0.6,
      pulseSpeed: 0,
      phase: 'free-deep',
    };

    applyBorderState(el, state);

    expect(el.style.backgroundColor).toBe('#4A9B6E');
    expect(el.style.opacity).toBe('0.6');
  });

  it('handles zero opacity', () => {
    const el = mockElement();
    const state: BorderStatePayload = {
      color: '#000000',
      opacity: 0,
      pulseSpeed: 0,
      phase: 'no-events',
    };

    applyBorderState(el, state);

    expect(el.style.backgroundColor).toBe('#000000');
    expect(el.style.opacity).toBe('0');
  });

  it('handles full opacity', () => {
    const el = mockElement();
    const state: BorderStatePayload = {
      color: '#FF0000',
      opacity: 0.95,
      pulseSpeed: 2000,
      phase: 'overtime',
    };

    applyBorderState(el, state);

    expect(el.style.backgroundColor).toBe('#FF0000');
    expect(el.style.opacity).toBe('0.95');
  });

  it('updates element when called multiple times', () => {
    const el = mockElement();

    applyBorderState(el, {
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });
    expect(el.style.backgroundColor).toBe('#4A9B6E');

    applyBorderState(el, {
      color: '#E8A838',
      opacity: 0.7,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });
    expect(el.style.backgroundColor).toBe('#E8A838');
    expect(el.style.opacity).toBe('0.7');
  });
});

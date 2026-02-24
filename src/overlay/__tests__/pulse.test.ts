import { describe, it, expect, vi } from 'vitest';

// Mock Tauri APIs before importing the module under test.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setIgnoreCursorEvents: vi.fn(),
  })),
}));

import { computePulseOpacity, createPulseController } from '../overlay.js';

/** Create a minimal mock HTMLElement with a style object supporting setProperty. */
function mockElement(): HTMLElement {
  const style: Record<string, unknown> = {};
  style.setProperty = (name: string, value: string) => {
    style[name] = value;
  };
  return { style } as unknown as HTMLElement;
}

describe('computePulseOpacity', () => {
  it('returns base opacity when pulseSpeed is 0', () => {
    expect(computePulseOpacity(1000, 0.6, 0)).toBe(0.6);
  });

  it('returns base opacity when pulseSpeed is negative', () => {
    expect(computePulseOpacity(1000, 0.6, -100)).toBe(0.6);
  });

  it('returns base opacity at cycle start (timestamp = 0)', () => {
    // sin(0) = 0, so offset is 0
    expect(computePulseOpacity(0, 0.6, 2000)).toBe(0.6);
  });

  it('returns base + amplitude at quarter cycle', () => {
    // At t = pulseSpeed/4, sin(π/2) = 1 → offset = +0.15
    const result = computePulseOpacity(500, 0.6, 2000);
    expect(result).toBeCloseTo(0.75, 10);
  });

  it('returns base - amplitude at three-quarter cycle', () => {
    // At t = 3*pulseSpeed/4, sin(3π/2) = -1 → offset = -0.15
    const result = computePulseOpacity(1500, 0.6, 2000);
    expect(result).toBeCloseTo(0.45, 10);
  });

  it('returns base opacity at full cycle', () => {
    // At t = pulseSpeed, timestamp % pulseSpeed = 0, sin(0) = 0
    const result = computePulseOpacity(2000, 0.6, 2000);
    expect(result).toBeCloseTo(0.6, 10);
  });

  it('clamps to 1.0 when base + amplitude exceeds 1', () => {
    // base 0.9 + 0.15 = 1.05 → clamped to 1.0
    const result = computePulseOpacity(500, 0.9, 2000);
    expect(result).toBe(1.0);
  });

  it('clamps to 0 when base - amplitude goes below 0', () => {
    // base 0.1 - 0.15 = -0.05 → clamped to 0
    const result = computePulseOpacity(1500, 0.1, 2000);
    expect(result).toBe(0);
  });

  it('handles various pulse speeds correctly', () => {
    // At quarter-cycle for 4000ms speed → timestamp 1000
    const result = computePulseOpacity(1000, 0.5, 4000);
    expect(result).toBeCloseTo(0.65, 10);
  });
});

describe('createPulseController', () => {
  it('applies CSS animation when pulseSpeed > 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    expect(el.style.animation).toBe('pulse-opacity 2000ms ease-in-out infinite');
    // CSS custom properties are set via setProperty on the style object
    const style = el.style as unknown as Record<string, unknown>;
    expect(style['--base-opacity']).toBe('0.6');
    expect(style['--pulse-amplitude']).toBe('0.15');
  });

  it('sets static opacity when pulseSpeed is 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });

    expect(el.style.animation).toBe('');
    expect(el.style.opacity).toBe('0.3');
  });

  it('sets backgroundColor on every update', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.6,
      pulseSpeed: 0,
      phase: 'free-deep',
    });
    expect(el.style.backgroundColor).toBe('#4A9B6E');

    ctrl.update({
      color: '#E8A838',
      opacity: 0.7,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });
    expect(el.style.backgroundColor).toBe('#E8A838');
  });

  it('updates animation duration when pulseSpeed changes', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });
    expect(el.style.animation).toBe('pulse-opacity 2000ms ease-in-out infinite');

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });
    expect(el.style.animation).toBe('pulse-opacity 3000ms ease-in-out infinite');
  });

  it('removes animation and sets static opacity when pulseSpeed becomes 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    // Start pulsing
    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });
    expect(el.style.animation).toBe('pulse-opacity 2000ms ease-in-out infinite');

    // Stop pulsing
    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });

    expect(el.style.animation).toBe('');
    expect(el.style.opacity).toBe('0.3');
  });

  it('restarts animation after stopping', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    // Start
    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    // Stop
    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });

    // Restart with different speed
    ctrl.update({
      color: '#E8A838',
      opacity: 0.7,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });

    expect(el.style.animation).toBe('pulse-opacity 3000ms ease-in-out infinite');
  });

  it('destroy clears the animation', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    ctrl.destroy();
    expect(el.style.animation).toBe('');
  });

  it('destroy is safe to call when no animation is running', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    // No animation started, destroy should not throw
    ctrl.destroy();
    expect(el.style.animation).toBe('');
  });
});

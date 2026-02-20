import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Tauri APIs before importing the module under test.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setIgnoreCursorEvents: vi.fn(),
  })),
}));

import {
  computePulseOpacity,
  createPulseController,
} from '../overlay.js';

/** Create a minimal mock HTMLElement with a style object. */
function mockElement(): HTMLElement {
  return { style: {} } as unknown as HTMLElement;
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
  let rafCallbacks: Array<(timestamp: number) => void>;
  let rafIdCounter: number;
  let cancelledIds: Set<number>;

  beforeEach(() => {
    rafCallbacks = [];
    rafIdCounter = 1;
    cancelledIds = new Set();

    vi.stubGlobal('requestAnimationFrame', (cb: (timestamp: number) => void) => {
      const id = rafIdCounter++;
      rafCallbacks.push(cb);
      return id;
    });

    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      cancelledIds.add(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Flush all pending rAF callbacks with the given timestamp. */
  function flushRAF(timestamp: number) {
    const cbs = rafCallbacks.splice(0);
    for (const cb of cbs) {
      cb(timestamp);
    }
  }

  it('starts animation when pulseSpeed > 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    // A rAF should have been requested
    expect(rafCallbacks).toHaveLength(1);
  });

  it('does not start animation when pulseSpeed is 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });

    expect(rafCallbacks).toHaveLength(0);
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

  it('updates opacity on each animation frame', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    // Simulate frame at quarter cycle
    flushRAF(500);
    expect(Number(el.style.opacity)).toBeCloseTo(0.75, 10);

    // Simulate frame at three-quarter cycle
    flushRAF(1500);
    expect(Number(el.style.opacity)).toBeCloseTo(0.45, 10);
  });

  it('stops animation and resets opacity when pulseSpeed becomes 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    // Start pulsing
    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });
    expect(rafCallbacks).toHaveLength(1);

    // Stop pulsing
    ctrl.update({
      color: '#4A9B6E',
      opacity: 0.3,
      pulseSpeed: 0,
      phase: 'free-deep',
    });

    // cancelAnimationFrame should have been called
    expect(cancelledIds.size).toBe(1);
    // Opacity should be set to the base value
    expect(el.style.opacity).toBe('0.3');
  });

  it('does not start duplicate animations on repeated updates with pulseSpeed > 0', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    const callbacksBefore = rafCallbacks.length;

    // Update again with different speed — should NOT request a second rAF
    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });

    // No additional rAF requested (the existing loop will pick up the new speed)
    expect(rafCallbacks.length).toBe(callbacksBefore);
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

    rafCallbacks = [];

    // Restart
    ctrl.update({
      color: '#E8A838',
      opacity: 0.7,
      pulseSpeed: 3000,
      phase: 'warning-mid',
    });

    expect(rafCallbacks).toHaveLength(1);
  });

  it('destroy cancels the animation', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    ctrl.update({
      color: '#FF0000',
      opacity: 0.6,
      pulseSpeed: 2000,
      phase: 'overtime',
    });

    ctrl.destroy();
    expect(cancelledIds.size).toBe(1);
  });

  it('destroy is safe to call when no animation is running', () => {
    const el = mockElement();
    const ctrl = createPulseController(el);

    // No animation started, destroy should not throw
    ctrl.destroy();
    expect(cancelledIds.size).toBe(0);
  });
});

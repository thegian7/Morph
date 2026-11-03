import { describe, it, expect } from 'vitest';
import {
  effectiveEdges,
  hiddenEdges,
  hiddenEdgesHint,
  describeReserved,
  type EdgeFlags,
} from '../components/fitEdges';

const ALL: EdgeFlags = { top: true, bottom: true, left: true, right: true };
const DOCK_BOTTOM: EdgeFlags = { top: true, bottom: true, left: false, right: false };
const DOCK_LEFT: EdgeFlags = { top: true, bottom: false, left: true, right: false };

describe('effectiveEdges', () => {
  it('intersects enabled and reserved edges in fit mode', () => {
    expect(effectiveEdges(ALL, 'fit', DOCK_BOTTOM)).toEqual(DOCK_BOTTOM);
  });

  it('leaves other modes alone', () => {
    expect(effectiveEdges(ALL, 'reserve', DOCK_BOTTOM)).toEqual(ALL);
    expect(effectiveEdges(ALL, 'overlay', DOCK_BOTTOM)).toEqual(ALL);
  });

  it('falls back to enabled edges while reserved space is unknown', () => {
    expect(effectiveEdges(ALL, 'fit', null)).toEqual(ALL);
  });
});

describe('hiddenEdges', () => {
  it('lists enabled edges Fit cannot draw', () => {
    expect(hiddenEdges(ALL, 'fit', DOCK_BOTTOM)).toEqual(['left', 'right']);
    expect(hiddenEdges(ALL, 'fit', DOCK_LEFT)).toEqual(['bottom', 'right']);
  });

  it('ignores disabled edges and non-fit modes', () => {
    const sidesOff = { top: true, bottom: true, left: false, right: false };
    expect(hiddenEdges(sidesOff, 'fit', DOCK_BOTTOM)).toEqual([]);
    expect(hiddenEdges(ALL, 'overlay', DOCK_BOTTOM)).toEqual([]);
  });
});

describe('describeReserved', () => {
  it('names the menu bar and the Dock edge', () => {
    expect(describeReserved(DOCK_BOTTOM)).toBe('the menu bar and the Dock (bottom)');
    expect(describeReserved(DOCK_LEFT)).toBe('the menu bar and the Dock (left)');
    expect(describeReserved({ top: true, bottom: false, left: false, right: false })).toBe(
      'the menu bar',
    );
  });

  it('handles everything auto-hidden', () => {
    expect(describeReserved({ top: false, bottom: false, left: false, right: false })).toMatch(
      /auto-hidden/,
    );
  });
});

describe('hiddenEdgesHint', () => {
  it('explains hidden edges and how to show them', () => {
    const hint = hiddenEdgesHint(['left', 'right'], DOCK_BOTTOM)!;
    expect(hint).toMatch(/^Left and right edges stay hidden in Fit mode/);
    expect(hint).toContain('the menu bar and the Dock (bottom)');
    expect(hint).toContain('draw them');
  });

  it('uses the singular for one edge', () => {
    expect(hiddenEdgesHint(['right'], DOCK_LEFT)).toMatch(/^Right edge stays hidden.*draw it\.$/);
  });

  it('is null when nothing is hidden', () => {
    expect(hiddenEdgesHint([], DOCK_BOTTOM)).toBeNull();
    expect(hiddenEdgesHint(['left'], null)).toBeNull();
  });
});

/**
 * Which border edges the "Fit around menu bar & Dock" placement can draw.
 *
 * Fit only paints space macOS already reserves — the menu bar (top) and the
 * Dock edge — so enabled edges without reserved space stay hidden. Pure
 * helpers so the settings UI can show (and explain) what will really appear.
 */

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export const ALL_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** The edges that will actually be drawn. */
export function effectiveEdges(
  active: EdgeFlags,
  mode: string,
  reserved: EdgeFlags | null,
): EdgeFlags {
  if (mode !== 'fit' || !reserved) return active;
  return {
    top: active.top && reserved.top,
    bottom: active.bottom && reserved.bottom,
    left: active.left && reserved.left,
    right: active.right && reserved.right,
  };
}

/** Enabled edges that Fit can't draw on this display. */
export function hiddenEdges(active: EdgeFlags, mode: string, reserved: EdgeFlags | null): Edge[] {
  if (mode !== 'fit' || !reserved) return [];
  return ALL_EDGES.filter((e) => active[e] && !reserved[e]);
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What macOS reserves on this display, in words ("the menu bar and the Dock (bottom)"). */
export function describeReserved(reserved: EdgeFlags): string {
  const parts: string[] = [];
  if (reserved.top) parts.push('the menu bar');
  const dock = (['bottom', 'left', 'right'] as const).filter((e) => reserved[e]);
  if (dock.length) parts.push(`the Dock (${dock.join(', ')})`);
  return parts.length ? joinWords(parts) : 'nothing (menu bar and Dock are auto-hidden)';
}

/** Explanation for hidden edges, or null when everything enabled will show. */
export function hiddenEdgesHint(hidden: Edge[], reserved: EdgeFlags | null): string | null {
  if (!hidden.length || !reserved) return null;
  const noun = hidden.length === 1 ? 'edge stays' : 'edges stay';
  return (
    `${capitalize(joinWords(hidden))} ${noun} hidden in Fit mode — on this display macOS ` +
    `only reserves space for ${describeReserved(reserved)}. ` +
    `Choose Reserve space or Overlay to draw ${hidden.length === 1 ? 'it' : 'them'}.`
  );
}

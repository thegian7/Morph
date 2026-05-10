import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { Slider, Card, SectionHeader, Button } from '@/shared/components';
import { MiniPreview } from '../components/MiniPreview';
import { TimelineScrubber } from '../components/TimelineScrubber';
import type { BorderState, UserSettings } from '@/lib/color-engine/types';
import { DEFAULT_USER_SETTINGS } from '@/lib/color-engine/types';

const THICKNESS_ENUM = ['thin', 'medium', 'thick'] as const;
const THICKNESS_LABELS = ['Thin', 'Medium', 'Thick'] as const;

const PALETTE_OPTIONS = [
  {
    value: 'ambient',
    label: 'Ambient',
    description: 'Green \u2192 yellow \u2192 orange \u2192 purple',
    colors: ['#22c55e', '#eab308', '#f97316', '#a855f7'],
  },
  {
    value: 'ocean',
    label: 'Ocean',
    description: 'Blue \u2192 orange (colorblind-accessible)',
    colors: ['#3b82f6', '#60a5fa', '#f59e0b', '#f97316'],
  },
] as const;

const INTENSITY_ENUM = ['subtle', 'normal', 'vivid'] as const;
const INTENSITY_LABELS = ['Subtle (0.6\u00d7)', 'Normal (1.0\u00d7)', 'Vivid (1.4\u00d7)'] as const;

const DEFAULTS = {
  border_thickness: 'medium',
  border_position: 'all',
  color_palette: 'ambient',
  color_intensity: 'normal',
} as const;

type Edge = 'top' | 'bottom' | 'left' | 'right';

function edgesFromPosition(position: string): Set<Edge> {
  switch (position) {
    case 'all':
      return new Set(['top', 'bottom', 'left', 'right']);
    case 'top':
      return new Set(['top']);
    case 'bottom':
      return new Set(['bottom']);
    case 'sides':
      return new Set(['left', 'right']);
    case 'top-sides':
      return new Set(['top', 'left', 'right']);
    case 'bottom-sides':
      return new Set(['bottom', 'left', 'right']);
    default:
      return new Set(['top', 'bottom', 'left', 'right']);
  }
}

function positionFromEdges(edges: Set<Edge>): string {
  const has = (e: Edge) => edges.has(e);
  if (has('top') && has('bottom') && has('left') && has('right')) return 'all';
  if (has('top') && has('left') && has('right') && !has('bottom')) return 'top-sides';
  if (has('bottom') && has('left') && has('right') && !has('top')) return 'bottom-sides';
  if (has('left') && has('right') && !has('top') && !has('bottom')) return 'sides';
  if (has('top') && !has('bottom') && !has('left') && !has('right')) return 'top';
  if (has('bottom') && !has('top') && !has('left') && !has('right')) return 'bottom';
  // Fallback for edge combos not in the enum — pick closest
  if (has('top') && has('bottom')) return 'all';
  if (has('top')) return has('left') || has('right') ? 'top-sides' : 'top';
  if (has('bottom')) return has('left') || has('right') ? 'bottom-sides' : 'bottom';
  if (has('left') || has('right')) return 'sides';
  return 'all';
}

function PositionSelector({
  position,
  onChange,
}: {
  position: string;
  onChange: (pos: string) => void;
}) {
  const activeEdges = edgesFromPosition(position);

  function toggleEdge(edge: Edge) {
    const next = new Set(activeEdges);
    if (next.has(edge)) {
      next.delete(edge);
    } else {
      next.add(edge);
    }
    // Ensure at least one edge is active
    if (next.size === 0) return;
    onChange(positionFromEdges(next));
  }

  const activeColor = 'var(--color-primary, #3b82f6)';
  const inactiveColor = 'var(--color-border, #d1d5db)';
  const edgeThickness = 6;

  return (
    <div data-testid="position-selector">
      <svg
        width="200"
        height="140"
        viewBox="0 0 200 140"
        style={{ cursor: 'pointer' }}
        role="img"
        aria-label="Border position selector"
      >
        {/* Screen outline */}
        <rect
          x="10"
          y="10"
          width="180"
          height="120"
          fill="none"
          stroke="var(--color-border, #e5e7eb)"
          strokeWidth="1"
          rx="4"
        />
        {/* Top edge */}
        <rect
          x="10"
          y="10"
          width="180"
          height={edgeThickness}
          fill={activeEdges.has('top') ? activeColor : inactiveColor}
          rx="2"
          onClick={() => toggleEdge('top')}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="Toggle top edge"
        />
        {/* Bottom edge */}
        <rect
          x="10"
          y={130 - edgeThickness}
          width="180"
          height={edgeThickness}
          fill={activeEdges.has('bottom') ? activeColor : inactiveColor}
          rx="2"
          onClick={() => toggleEdge('bottom')}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="Toggle bottom edge"
        />
        {/* Left edge */}
        <rect
          x="10"
          y="10"
          width={edgeThickness}
          height="120"
          fill={activeEdges.has('left') ? activeColor : inactiveColor}
          rx="2"
          onClick={() => toggleEdge('left')}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="Toggle left edge"
        />
        {/* Right edge */}
        <rect
          x={190 - edgeThickness}
          y="10"
          width={edgeThickness}
          height="120"
          fill={activeEdges.has('right') ? activeColor : inactiveColor}
          rx="2"
          onClick={() => toggleEdge('right')}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="Toggle right edge"
        />
      </svg>
    </div>
  );
}

const THICKNESS_PX: Record<string, number> = { thin: 8, medium: 16, thick: 28 };

export function BorderTab() {
  const { getSetting, setSetting } = useSettings();
  const [scrubberOpen, setScrubberOpen] = useState(false);
  const [scrubberState, setScrubberState] = useState<BorderState | null>(null);

  const thickness = getSetting('border_thickness') ?? 'medium';
  const position = getSetting('border_position') ?? 'all';
  const palette = getSetting('color_palette') ?? 'ambient';
  const intensity = getSetting('color_intensity') ?? 'normal';

  const thicknessIndex = Math.max(0, THICKNESS_ENUM.indexOf(thickness as (typeof THICKNESS_ENUM)[number]));
  const intensityIndex = Math.max(0, INTENSITY_ENUM.indexOf(intensity as (typeof INTENSITY_ENUM)[number]));

  const activeEdges = edgesFromPosition(position);
  const previewPosition = {
    top: activeEdges.has('top'),
    bottom: activeEdges.has('bottom'),
    left: activeEdges.has('left'),
    right: activeEdges.has('right'),
  };

  const defaultPreviewState: BorderState = {
    color: palette === 'ocean' ? '#3b82f6' : '#22c55e',
    opacity: 0.25,
    pulseSpeed: 0,
    phase: 'free-deep',
  };

  const previewBorderState = scrubberOpen && scrubberState ? scrubberState : defaultPreviewState;

  const scrubberSettings: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    palette: palette as UserSettings['palette'],
    intensity: intensity as UserSettings['intensity'],
    borderThickness: thickness as UserSettings['borderThickness'],
    borderPosition: position as UserSettings['borderPosition'],
  };

  function resetToDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      setSetting(key, value);
    }
  }

  return (
    <div className="space-y-8">
      {/* Live preview */}
      <div id="preview-mount" className="flex flex-col items-center gap-3">
        <MiniPreview
          borderState={previewBorderState}
          position={previewPosition}
          thickness={THICKNESS_PX[thickness] ?? 16}
        />
        <Button
          variant="ghost"
          onClick={() => {
            setScrubberOpen(!scrubberOpen);
            if (scrubberOpen) setScrubberState(null);
          }}
        >
          {scrubberOpen ? 'Hide timeline' : 'Preview timeline'}
        </Button>
        {scrubberOpen && (
          <div className="w-full">
            <TimelineScrubber settings={scrubberSettings} onBorderStateChange={setScrubberState} />
          </div>
        )}
      </div>

      <SectionHeader title="Border Settings" description="Customize how the ambient border appears on your screen." />

      {/* Thickness */}
      <section>
        <Slider
          label="Thickness"
          min={0}
          max={2}
          step={1}
          value={thicknessIndex}
          onChange={(val) => setSetting('border_thickness', THICKNESS_ENUM[val])}
        />
        <div className="flex justify-between mt-1" style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #6b7280)' }}>
          {THICKNESS_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>

      {/* Position */}
      <section>
        <SectionHeader title="Position" />
        <PositionSelector position={position} onChange={(pos) => setSetting('border_position', pos)} />
      </section>

      {/* Color Palette */}
      <section>
        <SectionHeader title="Color Palette" />
        <div className="flex gap-3">
          {PALETTE_OPTIONS.map((opt) => (
            <Card
              key={opt.value}
              selected={palette === opt.value}
              onClick={() => setSetting('color_palette', opt.value)}
            >
              <div className="flex gap-1.5 mb-2">
                {opt.colors.map((color, i) => (
                  <div
                    key={i}
                    data-testid="color-swatch"
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 'var(--text-sm, 0.875rem)', fontWeight: 600, color: 'var(--color-text, #111827)' }}>
                {opt.label}
              </span>
              <p style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #6b7280)', marginTop: '2px' }}>
                {opt.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Intensity */}
      <section>
        <Slider
          label="Intensity"
          min={0}
          max={2}
          step={1}
          value={intensityIndex}
          onChange={(val) => setSetting('color_intensity', INTENSITY_ENUM[val])}
        />
        <div className="flex justify-between mt-1" style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #6b7280)' }}>
          {INTENSITY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>

      {/* Reset */}
      <section>
        <Button variant="secondary" onClick={resetToDefaults}>
          Reset to Defaults
        </Button>
      </section>
    </div>
  );
}

export default BorderTab;

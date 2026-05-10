import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CalendarEvent, UserSettings, BorderState } from '@/lib/color-engine/types';
import { getBorderState } from '@/lib/color-engine';

interface TimelineScrubberProps {
  settings: UserSettings;
  onBorderStateChange: (state: BorderState) => void;
}

const SAMPLE_COUNT = 100;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const EVENT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function buildSyntheticEvent(windowStart: Date): CalendarEvent {
  const eventStart = new Date(windowStart.getTime() + WINDOW_MS / 2 - EVENT_DURATION_MS / 2);
  const eventEnd = new Date(eventStart.getTime() + EVENT_DURATION_MS);
  return {
    id: 'preview-synthetic',
    title: 'Preview Event',
    startTime: eventStart.toISOString(),
    endTime: eventEnd.toISOString(),
    ignored: false,
    calendarId: 'preview',
    providerId: 'preview',
    isAllDay: false,
  };
}

interface SampledPoint {
  color: string;
  phase: string;
}

function sampleTimeline(
  windowStart: Date,
  event: CalendarEvent,
  settings: UserSettings,
): SampledPoint[] {
  const points: SampledPoint[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = windowStart.getTime() + (i / SAMPLE_COUNT) * WINDOW_MS;
    const fakeNow = new Date(t);
    const state = getBorderState([event], fakeNow, settings);
    points.push({ color: state.color, phase: state.phase });
  }
  return points;
}

/** Determine label + position for key phases in the timeline. */
function getPhaseLabels(points: SampledPoint[]): Array<{ label: string; x: number }> {
  const labels: Array<{ label: string; x: number }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    const phase = points[i].phase;
    let label: string | null = null;
    if (phase.startsWith('free') || phase === 'no-events') label = 'Free';
    else if (phase.startsWith('warning')) label = 'Warning';
    else if (phase.startsWith('in-session')) label = 'In Session';
    else if (phase.startsWith('overtime')) label = 'Overtime';
    else if (phase.startsWith('gap')) label = 'Gap';

    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push({ label, x: (i / SAMPLE_COUNT) * 100 });
    }
  }

  return labels;
}

export function TimelineScrubber({ settings, onBorderStateChange }: TimelineScrubberProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playheadPos, setPlayheadPos] = useState(0.25); // Start at 25% (before event)
  const [dragging, setDragging] = useState(false);
  const [points, setPoints] = useState<SampledPoint[]>([]);
  const [phaseLabels, setPhaseLabels] = useState<Array<{ label: string; x: number }>>([]);
  const windowStartRef = useRef(new Date(Date.now() - WINDOW_MS / 4));

  // Sample on mount and when settings change
  useEffect(() => {
    const windowStart = windowStartRef.current;
    const event = buildSyntheticEvent(windowStart);
    const sampled = sampleTimeline(windowStart, event, settings);
    setPoints(sampled);
    setPhaseLabels(getPhaseLabels(sampled));
  }, [settings]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const segWidth = w / SAMPLE_COUNT;
    for (let i = 0; i < points.length; i++) {
      ctx.fillStyle = points[i].color;
      ctx.fillRect(i * segWidth, 0, segWidth + 1, h);
    }
  }, [points]);

  // Emit border state at playhead position
  useEffect(() => {
    if (points.length === 0) return;
    const windowStart = windowStartRef.current;
    const event = buildSyntheticEvent(windowStart);
    const t = windowStart.getTime() + playheadPos * WINDOW_MS;
    const fakeNow = new Date(t);
    const state = getBorderState([event], fakeNow, settings);
    onBorderStateChange(state);
  }, [playheadPos, settings, points, onBorderStateChange]);

  const updatePlayhead = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setPlayheadPos(x);
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      updatePlayhead(e.clientX);
    },
    [updatePlayhead],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => updatePlayhead(e.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, updatePlayhead]);

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative cursor-pointer"
        onMouseDown={handleMouseDown}
        style={{ userSelect: 'none' }}
      >
        <canvas
          ref={canvasRef}
          width={400}
          height={48}
          className="w-full rounded"
          style={{ height: '48px', display: 'block' }}
        />
        {/* Playhead */}
        <div
          data-testid="playhead"
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: `${playheadPos * 100}%`,
            transform: 'translateX(-50%)',
            width: '2px',
            backgroundColor: 'white',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 'white',
              boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      </div>
      {/* Phase labels */}
      <div className="relative mt-1" style={{ height: '20px', fontSize: 'var(--text-xs, 11px)' }}>
        {phaseLabels.map((pl) => (
          <span
            key={pl.label}
            className="absolute"
            style={{
              left: `${pl.x}%`,
              color: 'var(--color-text-secondary, #6b7280)',
              whiteSpace: 'nowrap',
            }}
          >
            {pl.label}
          </span>
        ))}
      </div>
    </div>
  );
}

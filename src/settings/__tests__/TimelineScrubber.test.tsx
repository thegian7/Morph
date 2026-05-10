// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { TimelineScrubber } from '../components/TimelineScrubber';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn(),
    }),
  },
}));

describe('TimelineScrubber', () => {
  const defaultSettings = {
    palette: 'ambient' as const,
    intensity: 'normal' as const,
    warningWindows: [30, 15, 5, 2],
    ignoredCalendarIds: [] as string[],
    borderThickness: 'medium' as const,
    borderPosition: 'all' as const,
  };

  it('renders timeline canvas', () => {
    const { container } = render(
      <TimelineScrubber settings={defaultSettings} onBorderStateChange={() => {}} />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders phase labels', () => {
    render(<TimelineScrubber settings={defaultSettings} onBorderStateChange={() => {}} />);
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Session').length).toBeGreaterThan(0);
  });

  it('renders playhead', () => {
    const { container } = render(
      <TimelineScrubber settings={defaultSettings} onBorderStateChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="playhead"]')).toBeInTheDocument();
  });
});

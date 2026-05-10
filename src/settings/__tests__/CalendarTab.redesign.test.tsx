// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi
      .fn()
      .mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }),
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe('CalendarTab redesign', () => {
  it('renders provider cards with design system styling', async () => {
    const { default: CalendarTab } = await import('../tabs/CalendarTab');
    render(<CalendarTab />);
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Outlook')).toBeInTheDocument();
    expect(screen.getByText('Apple Calendar')).toBeInTheDocument();
  });
});

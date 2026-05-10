// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CalendarTab from '../tabs/CalendarTab';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

import { emit } from '@tauri-apps/api/event';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CalendarTab', () => {
  it('renders the heading and subtitle', () => {
    render(<CalendarTab />);
    expect(screen.getByText('Calendar Connections')).toBeDefined();
    expect(
      screen.getByText('Connect your calendars to see upcoming events on the border.'),
    ).toBeDefined();
  });

  it('renders all three provider cards', () => {
    render(<CalendarTab />);
    expect(screen.getByText('Google Calendar')).toBeDefined();
    expect(screen.getByText('Microsoft Outlook')).toBeDefined();
    expect(screen.getByText('Apple Calendar')).toBeDefined();
  });

  it('shows "Not connected" for each provider by default', () => {
    render(<CalendarTab />);
    const notConnected = screen.getAllByText('Not connected');
    expect(notConnected).toHaveLength(3);
  });

  it('shows three Connect buttons by default', () => {
    render(<CalendarTab />);
    const connectButtons = screen.getAllByRole('button', { name: /^Connect$/ });
    expect(connectButtons).toHaveLength(3);
  });

  it('connect button emits event with correct provider for Google', () => {
    render(<CalendarTab />);
    const connectButtons = screen.getAllByRole('button', { name: /^Connect$/ });
    fireEvent.click(connectButtons[0]);
    expect(emit).toHaveBeenCalledWith('connect-provider', {
      provider: 'google',
    });
  });

  it('connect button emits event with correct provider for Microsoft', () => {
    render(<CalendarTab />);
    const connectButtons = screen.getAllByRole('button', { name: /^Connect$/ });
    fireEvent.click(connectButtons[1]);
    expect(emit).toHaveBeenCalledWith('connect-provider', {
      provider: 'microsoft',
    });
  });

  it('connect button emits event with correct provider for Apple', () => {
    render(<CalendarTab />);
    const connectButtons = screen.getAllByRole('button', { name: /^Connect$/ });
    fireEvent.click(connectButtons[2]);
    expect(emit).toHaveBeenCalledWith('connect-provider', {
      provider: 'apple',
    });
  });

  it('renders provider icon letters', () => {
    render(<CalendarTab />);
    expect(screen.getByText('G')).toBeDefined();
    expect(screen.getByText('M')).toBeDefined();
    expect(screen.getByText('A')).toBeDefined();
  });
});

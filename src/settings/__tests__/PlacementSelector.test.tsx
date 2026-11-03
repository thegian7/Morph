// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { PlacementSelector, isMacOS } from '../components/PlacementSelector';

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PlacementSelector', () => {
  it('renders the three placement options', () => {
    render(<PlacementSelector mode="fit" onChange={() => {}} />);
    expect(screen.getByText('Fit around menu bar & Dock')).toBeDefined();
    expect(screen.getByText('Reserve space')).toBeDefined();
    expect(screen.getByText('Overlay')).toBeDefined();
  });

  it('marks the current mode selected and falls back to fit for unknown values', () => {
    const { container, rerender } = render(
      <PlacementSelector mode="reserve" onChange={() => {}} />,
    );
    const selected = () => container.querySelector('.card-selected')?.textContent ?? '';
    expect(selected()).toContain('Reserve space');

    rerender(<PlacementSelector mode="bogus" onChange={() => {}} />);
    expect(selected()).toContain('Fit around menu bar & Dock');
  });

  it('calls onChange with the clicked mode', () => {
    const onChange = vi.fn();
    render(<PlacementSelector mode="fit" onChange={onChange} />);
    fireEvent.click(screen.getByText('Reserve space'));
    expect(onChange).toHaveBeenCalledWith('reserve');
    fireEvent.click(screen.getByText('Overlay'));
    expect(onChange).toHaveBeenCalledWith('overlay');
  });

  it('does not query accessibility outside reserve mode', () => {
    render(<PlacementSelector mode="fit" onChange={() => {}} />);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('offers to grant access when reserve mode lacks permission', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'request_accessibility' ? true : false),
    );
    render(<PlacementSelector mode="reserve" onChange={() => {}} />);

    const button = await screen.findByRole('button', { name: /Grant Access/ });
    expect(invokeMock).toHaveBeenCalledWith('accessibility_status');

    fireEvent.click(button);
    expect(invokeMock).toHaveBeenCalledWith('request_accessibility');
    await waitFor(() =>
      expect(screen.getByTestId('accessibility-status').textContent).toMatch(/granted/),
    );
  });

  it('shows granted state when permission is already there', async () => {
    invokeMock.mockResolvedValue(true);
    render(<PlacementSelector mode="reserve" onChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('accessibility-status').textContent).toMatch(/granted/),
    );
    expect(screen.queryByRole('button', { name: /Grant Access/ })).toBeNull();
  });
});

describe('isMacOS', () => {
  it('detects macOS from the platform string', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
    expect(isMacOS()).toBe(true);
  });

  it('is false on Windows', () => {
    vi.stubGlobal('navigator', {
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    expect(isMacOS()).toBe(false);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BorderTab from '../tabs/BorderTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';

afterEach(() => {
  cleanup();
});

function renderWithSettings(overrides: Partial<SettingsContextValue> = {}) {
  const mockSettings = new Map([
    ['border_thickness', 'medium'],
    ['border_position', 'all'],
    ['color_palette', 'ambient'],
    ['color_intensity', 'normal'],
  ]);
  const mockSetSetting = vi.fn((key: string, value: string) => {
    mockSettings.set(key, value);
  });
  const defaultValue: SettingsContextValue = {
    settings: mockSettings,
    loading: false,
    getSetting: (key) => mockSettings.get(key),
    setSetting: mockSetSetting,
    ...overrides,
  };
  const result = render(
    <SettingsContext.Provider value={defaultValue}>
      <BorderTab />
    </SettingsContext.Provider>,
  );
  return { ...result, mockSetSetting: overrides.setSetting ?? mockSetSetting };
}

describe('BorderTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four setting sections', () => {
    renderWithSettings();

    expect(screen.getByText('Thickness')).toBeDefined();
    expect(screen.getByText('Position')).toBeDefined();
    expect(screen.getByText('Color Palette')).toBeDefined();
    expect(screen.getByText('Intensity')).toBeDefined();
  });

  it('renders the page heading', () => {
    renderWithSettings();

    expect(screen.getByText('Border Settings')).toBeDefined();
  });

  it('shows correct default thickness selection', () => {
    renderWithSettings();

    const mediumBtn = screen.getByRole('button', { name: /Medium/ });
    expect(mediumBtn.className).toContain('ring-blue-500');
  });

  it('shows correct default position selection', () => {
    renderWithSettings();

    const allBtn = screen.getByRole('button', { name: /All Edges/ });
    expect(allBtn.className).toContain('ring-blue-500');
  });

  it('shows correct default palette selection', () => {
    renderWithSettings();

    const ambientBtn = screen.getByRole('button', { name: /Ambient/ });
    expect(ambientBtn.className).toContain('ring-blue-500');
  });

  it('shows correct default intensity selection', () => {
    renderWithSettings();

    const normalBtn = screen.getByRole('button', { name: /Normal/ });
    expect(normalBtn.className).toContain('ring-blue-500');
  });

  it('calls setSetting when clicking a thickness option', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Thick/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'thick');
  });

  it('calls setSetting when clicking a position option', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Top Only/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('border_position', 'top');
  });

  it('calls setSetting when clicking a palette option', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Ocean/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('color_palette', 'ocean');
  });

  it('calls setSetting when clicking an intensity option', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Vivid/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'vivid');
  });

  it('reset button calls setSetting for all four keys with defaults', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Reset to Defaults/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'medium');
    expect(mockSetSetting).toHaveBeenCalledWith('border_position', 'all');
    expect(mockSetSetting).toHaveBeenCalledWith('color_palette', 'ambient');
    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'normal');
  });

  it('renders all thickness options', () => {
    renderWithSettings();

    expect(screen.getByRole('button', { name: /Thin/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Medium/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Thick/ })).toBeDefined();
  });

  it('renders all position options', () => {
    renderWithSettings();

    expect(screen.getByRole('button', { name: /All Edges/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Top Only/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Sides Only/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Bottom Only/ })).toBeDefined();
  });

  it('renders both palette options with descriptions', () => {
    renderWithSettings();

    expect(screen.getByText(/Green.*purple/)).toBeDefined();
    expect(screen.getByText(/Blue.*orange.*colorblind/)).toBeDefined();
  });
});

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

    expect(screen.getByText(/thickness/i)).toBeDefined();
    expect(screen.getByText(/position/i)).toBeDefined();
    expect(screen.getByText(/color palette/i)).toBeDefined();
    expect(screen.getByText(/intensity/i)).toBeDefined();
  });

  it('renders the page heading', () => {
    renderWithSettings();

    expect(screen.getByText('Border Settings')).toBeDefined();
  });

  it('shows correct default thickness selection (medium = slider value 1)', () => {
    renderWithSettings();

    const sliders = screen.getAllByRole('slider');
    expect(sliders[0]).toBeDefined();
    expect((sliders[0] as HTMLInputElement).value).toBe('1');
  });

  it('shows correct default intensity selection (normal = slider value 1)', () => {
    renderWithSettings();

    const sliders = screen.getAllByRole('slider');
    expect(sliders[1]).toBeDefined();
    expect((sliders[1] as HTMLInputElement).value).toBe('1');
  });

  it('calls setSetting when changing thickness slider', () => {
    const { mockSetSetting } = renderWithSettings();
    const sliders = screen.getAllByRole('slider');

    fireEvent.change(sliders[0], { target: { value: '2' } });

    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'thick');
  });

  it('calls setSetting when changing intensity slider', () => {
    const { mockSetSetting } = renderWithSettings();
    const sliders = screen.getAllByRole('slider');

    fireEvent.change(sliders[1], { target: { value: '2' } });

    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'vivid');
  });

  it('calls setSetting when clicking a palette option', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByText('Ocean'));

    expect(mockSetSetting).toHaveBeenCalledWith('color_palette', 'ocean');
  });

  it('reset button calls setSetting for all four keys with defaults', () => {
    const { mockSetSetting } = renderWithSettings();

    fireEvent.click(screen.getByRole('button', { name: /Reset to Defaults/ }));

    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'medium');
    expect(mockSetSetting).toHaveBeenCalledWith('border_position', 'all');
    expect(mockSetSetting).toHaveBeenCalledWith('color_palette', 'ambient');
    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'normal');
  });

  it('renders thickness labels', () => {
    renderWithSettings();

    expect(screen.getByText('Thin')).toBeDefined();
    expect(screen.getByText('Medium')).toBeDefined();
    expect(screen.getByText('Thick')).toBeDefined();
  });

  it('renders both palette options with descriptions', () => {
    renderWithSettings();

    expect(screen.getByText(/Green.*purple/)).toBeDefined();
    expect(screen.getByText(/Blue.*orange.*colorblind/)).toBeDefined();
  });

  it('renders interactive position selector', () => {
    renderWithSettings();

    expect(screen.getByTestId('position-selector')).toBeDefined();
  });

  it('renders position selector with clickable edges', () => {
    renderWithSettings();

    expect(screen.getByRole('button', { name: /toggle top edge/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /toggle bottom edge/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /toggle left edge/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /toggle right edge/i })).toBeDefined();
  });
});

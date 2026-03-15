// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BorderTab from '../tabs/BorderTab';
import { SettingsContext, SettingsContextValue } from '../hooks/useSettings';

afterEach(() => {
  cleanup();
});

function renderBorderTab(overrides: Partial<SettingsContextValue> = {}) {
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

describe('BorderTab redesign', () => {
  it('renders thickness slider', () => {
    renderBorderTab();
    expect(screen.getByText(/thickness/i)).toBeDefined();
    // Should have a range input for thickness
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders interactive position selector', () => {
    renderBorderTab();
    expect(screen.getByTestId('position-selector')).toBeDefined();
  });

  it('renders color palette swatches', () => {
    renderBorderTab();
    expect(screen.getByText('Ambient')).toBeDefined();
    expect(screen.getByText('Ocean')).toBeDefined();
  });

  it('renders intensity slider', () => {
    renderBorderTab();
    expect(screen.getByText(/intensity/i)).toBeDefined();
    // Should have at least 2 range inputs (thickness + intensity)
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(2);
  });

  it('has preview-mount placeholder', () => {
    const { container } = renderBorderTab();
    expect(container.querySelector('#preview-mount')).toBeDefined();
  });

  it('thickness slider maps to enum strings', () => {
    const { mockSetSetting } = renderBorderTab();
    const sliders = screen.getAllByRole('slider');
    // First slider is thickness
    fireEvent.change(sliders[0], { target: { value: '2' } });
    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'thick');
  });

  it('intensity slider maps to enum strings', () => {
    const { mockSetSetting } = renderBorderTab();
    const sliders = screen.getAllByRole('slider');
    // Second slider is intensity
    fireEvent.change(sliders[1], { target: { value: '0' } });
    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'subtle');
  });

  it('renders palette cards with color swatches', () => {
    const { container } = renderBorderTab();
    const swatches = container.querySelectorAll('[data-testid="color-swatch"]');
    expect(swatches.length).toBeGreaterThan(0);
  });

  it('renders reset to defaults button', () => {
    renderBorderTab();
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeDefined();
  });

  it('reset button resets all settings to defaults', () => {
    const { mockSetSetting } = renderBorderTab();
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(mockSetSetting).toHaveBeenCalledWith('border_thickness', 'medium');
    expect(mockSetSetting).toHaveBeenCalledWith('border_position', 'all');
    expect(mockSetSetting).toHaveBeenCalledWith('color_palette', 'ambient');
    expect(mockSetSetting).toHaveBeenCalledWith('color_intensity', 'normal');
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { MiniPreview } from '../components/MiniPreview';

describe('MiniPreview', () => {
  it('renders a canvas element', () => {
    const { container } = render(
      <MiniPreview
        borderState={{ color: '#4A9B6E', opacity: 0.25, pulseSpeed: 0 }}
        position={{ top: true, bottom: true, left: true, right: true }}
        thickness={16}
      />,
    );
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders with correct dimensions', () => {
    const { container } = render(
      <MiniPreview
        borderState={{ color: '#4A9B6E', opacity: 0.25, pulseSpeed: 0 }}
        position={{ top: true, bottom: true, left: true, right: true }}
        thickness={16}
      />,
    );
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(120);
  });
});

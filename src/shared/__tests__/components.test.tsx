// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle, Card, Button, Chip, SectionHeader, Badge, ProgressRing } from '../components';

afterEach(() => {
  cleanup();
});

describe('Toggle', () => {
  it('renders with label and toggles on click', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Test" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Button variant="primary">Click</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Click</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

describe('Chip', () => {
  it('renders and handles selection', async () => {
    const onSelect = vi.fn();
    render(<Chip label="5m" selected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('5m'));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('SectionHeader', () => {
  it('renders title and description', () => {
    render(<SectionHeader title="Border" description="Configure border" />);
    expect(screen.getByText('Border')).toBeInTheDocument();
    expect(screen.getByText('Configure border')).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders with color and text', () => {
    render(<Badge color="#4A9B6E" text="Connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});

describe('ProgressRing', () => {
  it('renders with progress value', () => {
    const { container } = render(<ProgressRing progress={0.5} size={48} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

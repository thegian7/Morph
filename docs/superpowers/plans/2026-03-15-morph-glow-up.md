# Morph Glow-Up Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Morph from beta prototype to polished v1 — design system, settings overhaul, live preview, tray popover, platform parity.

**Architecture:** 5 vertical slices decomposed into 10 parallel agent tasks. Slice 1 (design system) is the foundation — all other tasks depend on it. After Slice 1, tasks 2-10 can run in parallel with noted dependencies.

**Tech Stack:** Tauri 2, React 19, TypeScript, Tailwind CSS 4, Rust, SQLite, `tauri-plugin-autostart`

**Spec:** `docs/superpowers/specs/2026-03-15-morph-glow-up-design.md`

---

## Chunk 1: Foundation (Task 1)

### Task 1: Design System & Adaptive Theming (Slice 1)

**All other tasks depend on this completing first.**

**Files:**
- Create: `src/shared/design-tokens.css`
- Create: `src/shared/components/Toggle.tsx`
- Create: `src/shared/components/Card.tsx`
- Create: `src/shared/components/Button.tsx`
- Create: `src/shared/components/IconButton.tsx`
- Create: `src/shared/components/SectionHeader.tsx`
- Create: `src/shared/components/Badge.tsx`
- Create: `src/shared/components/Chip.tsx`
- Create: `src/shared/components/Slider.tsx`
- Create: `src/shared/components/ProgressRing.tsx`
- Create: `src/shared/components/index.ts`
- Create: `src/shared/hooks/useTheme.ts`
- Create: `src/shared/__tests__/components.test.tsx`
- Create: `src/shared/__tests__/useTheme.test.ts`
- Modify: `src/settings/styles.css`
- Modify: `src/settings/main.tsx`

- [ ] **Step 1: Create design tokens CSS file**

Create `src/shared/design-tokens.css`:

```css
@import 'tailwindcss';

@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root {
  /* Surface */
  --color-surface-base: #FAFAF9;
  --color-surface-raised: #FFFFFF;
  --color-surface-overlay: #F5F5F4;
  --color-border: #E7E5E4;
  --color-border-subtle: #F0EEEC;

  /* Text */
  --color-text: #1C1917;
  --color-text-secondary: #57534E;
  --color-text-muted: #A8A29E;

  /* Brand */
  --color-primary: #4A9B6E;
  --color-primary-hover: #3D8A5E;
  --color-amber: #D4A843;
  --color-purple: #8B6AAE;
  --color-orange: #D4864A;
  --color-danger: #E54D4D;
  --color-success: #4A9B6E;

  /* Typography */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 28px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;

  /* Transitions */
  --transition-fast: 200ms ease;
  --transition-theme: 300ms ease;
}

[data-theme="dark"] {
  --color-surface-base: #0f1117;
  --color-surface-raised: #1a1d2e;
  --color-surface-overlay: #252836;
  --color-border: #2E3144;
  --color-border-subtle: #232638;

  --color-text: #E8E6E3;
  --color-text-secondary: #A8A5A0;
  --color-text-muted: #6B6865;
}
```

- [ ] **Step 2: Write tests for useTheme hook**

Create `src/shared/__tests__/useTheme.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @tauri-apps/plugin-sql
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('should default to system theme', async () => {
    // Theme preference defaults to 'system'
    const { getResolvedTheme } = await import('../hooks/useTheme');
    const result = getResolvedTheme('system', false);
    expect(result).toBe('light');
  });

  it('should resolve system theme to dark when OS prefers dark', async () => {
    const { getResolvedTheme } = await import('../hooks/useTheme');
    const result = getResolvedTheme('system', true);
    expect(result).toBe('dark');
  });

  it('should respect explicit light preference', async () => {
    const { getResolvedTheme } = await import('../hooks/useTheme');
    const result = getResolvedTheme('light', true);
    expect(result).toBe('light');
  });

  it('should respect explicit dark preference', async () => {
    const { getResolvedTheme } = await import('../hooks/useTheme');
    const result = getResolvedTheme('dark', false);
    expect(result).toBe('dark');
  });

  it('should apply data-theme attribute to html element', async () => {
    const { applyTheme } = await import('../hooks/useTheme');
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `npx vitest run src/shared/__tests__/useTheme.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement useTheme hook**

Create `src/shared/hooks/useTheme.ts`:

```typescript
import { useState, useEffect } from 'react';
import { listen, emit } from '@tauri-apps/api/event';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function getResolvedTheme(
  preference: ThemePreference,
  osDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return osDark ? 'dark' : 'light';
  return preference;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [osDark, setOsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const resolved = getResolvedTheme(preference, osDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const unlisten = listen<Record<string, string>>('settings-changed', (event) => {
      if (event.payload.theme_preference) {
        setPreference(event.payload.theme_preference as ThemePreference);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return { preference, resolved, setPreference };
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npx vitest run src/shared/__tests__/useTheme.test.ts`
Expected: PASS

- [ ] **Step 6: Write component tests**

Create `src/shared/__tests__/components.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle, Card, Button, Chip, SectionHeader, Badge, ProgressRing } from '../components';

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
```

- [ ] **Step 7: Run component tests — verify they fail**

Run: `npx vitest run src/shared/__tests__/components.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 8: Implement shared components**

Create each component file. All components use CSS custom properties from the design tokens. Here's the pattern (implement all 10 components listed in Files):

`src/shared/components/Toggle.tsx`:
```tsx
import React from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors"
        style={{
          backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
          transition: 'var(--transition-fast)',
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </label>
  );
}
```

`src/shared/components/Button.tsx`:
```tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: '#FFFFFF',
      border: 'none',
    },
    secondary: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-primary)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary)',
      border: 'none',
    },
  };

  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium cursor-pointer ${className}`}
      style={{ fontSize: 'var(--text-sm)', transition: 'var(--transition-fast)', ...styles[variant] }}
      {...props}
    >
      {children}
    </button>
  );
}
```

`src/shared/components/Card.tsx`:
```tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function Card({ children, className = '', onClick, selected }: CardProps) {
  return (
    <div
      className={`rounded-xl p-4 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--color-surface-raised)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        transition: 'var(--transition-fast)',
      }}
    >
      {children}
    </div>
  );
}
```

`src/shared/components/Chip.tsx`:
```tsx
import React from 'react';

interface ChipProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function Chip({ label, selected, onSelect }: ChipProps) {
  return (
    <button
      onClick={onSelect}
      className="px-3 py-1.5 rounded-full font-medium cursor-pointer"
      style={{
        fontSize: 'var(--text-sm)',
        backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-surface-overlay)',
        color: selected ? '#FFFFFF' : 'var(--color-text)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        transition: 'var(--transition-fast)',
      }}
    >
      {label}
    </button>
  );
}
```

`src/shared/components/SectionHeader.tsx`:
```tsx
import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="mb-4">
      <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)', fontWeight: 600 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          {description}
        </p>
      )}
    </div>
  );
}
```

`src/shared/components/Badge.tsx`:
```tsx
import React from 'react';

interface BadgeProps {
  color: string;
  text: string;
}

export function Badge({ color, text }: BadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ fontSize: 'var(--text-xs)' }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
    </span>
  );
}
```

`src/shared/components/Slider.tsx`:
```tsx
import React from 'react';

interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

export function Slider({ min, max, step = 1, value, onChange, label }: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </div>
  );
}
```

`src/shared/components/IconButton.tsx`:
```tsx
import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  title: string;
}

export function IconButton({ children, title, className = '', ...props }: IconButtonProps) {
  return (
    <button
      className={`p-2 rounded-lg cursor-pointer ${className}`}
      title={title}
      style={{
        color: 'var(--color-text-secondary)',
        transition: 'var(--transition-fast)',
      }}
      {...props}
    >
      {children}
    </button>
  );
}
```

`src/shared/components/ProgressRing.tsx`:
```tsx
import React from 'react';

interface ProgressRingProps {
  progress: number; // 0-1
  size: number;
  strokeWidth?: number;
  color?: string;
}

export function ProgressRing({ progress, size, strokeWidth = 3, color }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const progressColor = color ?? (progress < 0.7 ? 'var(--color-primary)' : 'var(--color-amber)');

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={progressColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
      />
    </svg>
  );
}
```

`src/shared/components/index.ts`:
```typescript
export { Toggle } from './Toggle';
export { Card } from './Card';
export { Button } from './Button';
export { IconButton } from './IconButton';
export { SectionHeader } from './SectionHeader';
export { Badge } from './Badge';
export { Chip } from './Chip';
export { Slider } from './Slider';
export { ProgressRing } from './ProgressRing';
```

- [ ] **Step 9: Run all component tests — verify they pass**

Run: `npx vitest run src/shared/__tests__/`
Expected: PASS

- [ ] **Step 10: Wire design tokens into settings entry point**

Modify `src/settings/styles.css` — replace contents with:
```css
@import '../shared/design-tokens.css';
```

Modify `src/settings/main.tsx` — add theme initialization:
```tsx
// At top of file, add import:
import { applyTheme, getResolvedTheme } from '../shared/hooks/useTheme';

// Before ReactDOM.createRoot, add:
const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getResolvedTheme('system', osDark));
```

- [ ] **Step 11: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All existing + new tests pass

- [ ] **Step 12: Commit**

```bash
git add src/shared/ src/settings/styles.css src/settings/main.tsx
git commit -m "feat: add design system with adaptive theming and shared components"
```

---

## Chunk 2: Settings Tabs Overhaul (Tasks 2-5)

### Task 2: General Tab + Autostart Plugin

**Depends on:** Task 1
**Files:**
- Modify: `src/settings/tabs/GeneralTab.tsx`
- Create: `src/settings/__tests__/GeneralTab.redesign.test.tsx`
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-autostart`)
- Modify: `src-tauri/src/lib.rs` (register plugin)
- Modify: `package.json` (add `@tauri-apps/plugin-autostart`)

- [ ] **Step 1: Add `tauri-plugin-autostart` dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
tauri-plugin-autostart = { version = "2", features = [] }
```

Add to `package.json` dependencies:
```json
"@tauri-apps/plugin-autostart": "^2.0.0"
```

Run: `cd src-tauri && cargo check` (verify dependency resolves)

- [ ] **Step 2: Register autostart plugin in lib.rs**

Modify `src-tauri/src/lib.rs` — add to the plugin chain in `run()`:
```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```

Add capability permissions to `src-tauri/capabilities/default.json` (or `tauri.conf.json` capabilities section):
```json
"autostart:allow-enable",
"autostart:allow-disable",
"autostart:allow-is-enabled"
```

- [ ] **Step 3: Write test for redesigned General Tab**

Create `src/settings/__tests__/GeneralTab.redesign.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('GeneralTab redesign', () => {
  it('renders theme picker with System/Light/Dark options', async () => {
    const { GeneralTab } = await import('../tabs/GeneralTab');
    render(<GeneralTab />);
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders launch at login toggle', async () => {
    const { GeneralTab } = await import('../tabs/GeneralTab');
    render(<GeneralTab />);
    expect(screen.getByText(/launch at login/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test — verify it fails**

Run: `npx vitest run src/settings/__tests__/GeneralTab.redesign.test.tsx`
Expected: FAIL

- [ ] **Step 5: Rewrite GeneralTab with design system components**

Rewrite `src/settings/tabs/GeneralTab.tsx` using shared `Toggle`, `Card`, `SectionHeader`, `Chip` components. Add theme picker (3 Cards with mini swatches), launch-at-login Toggle wired to `@tauri-apps/plugin-autostart` imports (`enable`, `disable`, `isEnabled`), and pause border duration chips.

- [ ] **Step 6: Run tests — verify pass**

Run: `npx vitest run src/settings/__tests__/GeneralTab.redesign.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/settings/tabs/GeneralTab.tsx src/settings/__tests__/GeneralTab.redesign.test.tsx src-tauri/Cargo.toml src-tauri/src/lib.rs package.json
git commit -m "feat: redesign General tab with theme picker and autostart"
```

### Task 3: Border Tab Redesign

**Depends on:** Task 1
**Files:**
- Modify: `src/settings/tabs/BorderTab.tsx`
- Create: `src/settings/__tests__/BorderTab.redesign.test.tsx`

- [ ] **Step 1: Write tests for redesigned Border Tab**

Create `src/settings/__tests__/BorderTab.redesign.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('BorderTab redesign', () => {
  it('renders thickness slider', async () => {
    const { BorderTab } = await import('../tabs/BorderTab');
    render(<BorderTab />);
    expect(screen.getByLabelText(/thickness/i)).toBeInTheDocument();
  });

  it('renders interactive position selector', async () => {
    const { BorderTab } = await import('../tabs/BorderTab');
    render(<BorderTab />);
    expect(screen.getByTestId('position-selector')).toBeInTheDocument();
  });

  it('renders color palette swatches', async () => {
    const { BorderTab } = await import('../tabs/BorderTab');
    render(<BorderTab />);
    expect(screen.getByText('Ambient')).toBeInTheDocument();
    expect(screen.getByText('Ocean')).toBeInTheDocument();
  });

  it('renders intensity slider', async () => {
    const { BorderTab } = await import('../tabs/BorderTab');
    render(<BorderTab />);
    expect(screen.getByLabelText(/intensity/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/settings/__tests__/BorderTab.redesign.test.tsx`
Expected: FAIL

- [ ] **Step 3: Rewrite BorderTab with design system components**

Rewrite `src/settings/tabs/BorderTab.tsx`:
- Replace thickness text buttons with a 3-position `Slider` (min=0, max=2, step=1) mapped to `thin`/`medium`/`thick` enum values. Display labels under the slider. On change, emit `settings-changed` with `border_thickness` set to the enum string (not a pixel value — the backend's `thickness_to_px()` converts enum to pixels)
- Replace position diagram with an interactive SVG screen outline (200×140px). Each edge (top/bottom/left/right) is a clickable rect that toggles. Active edges highlighted with `--color-primary`.
- Replace palette text buttons with `Card` components showing 5 color swatches each (the phase colors)
- Replace intensity buttons with `Slider` (values mapped to Subtle=0.6, Normal=1.0, Vivid=1.4)
- Leave a placeholder `div` at the top with `id="preview-mount"` for Task 7 (live preview)

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/settings/__tests__/BorderTab.redesign.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/tabs/BorderTab.tsx src/settings/__tests__/BorderTab.redesign.test.tsx
git commit -m "feat: redesign Border tab with sliders and interactive position selector"
```

### Task 4: Calendar Tab + Google Multi-Calendar

**Depends on:** Task 1
**Files:**
- Modify: `src/settings/tabs/CalendarTab.tsx`
- Modify: `src-tauri/src/calendar/google.rs`
- Create: `src/settings/__tests__/CalendarTab.redesign.test.tsx`

- [ ] **Step 1: Write tests for calendar list UI**

Create `src/settings/__tests__/CalendarTab.redesign.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('CalendarTab redesign', () => {
  it('renders provider cards with design system styling', async () => {
    const { CalendarTab } = await import('../tabs/CalendarTab');
    render(<CalendarTab />);
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Outlook')).toBeInTheDocument();
    expect(screen.getByText('Apple Calendar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails or reveals what needs changing**

Run: `npx vitest run src/settings/__tests__/CalendarTab.redesign.test.tsx`

- [ ] **Step 3: Update Google provider to support multi-calendar**

Modify `src-tauri/src/calendar/google.rs`:
- Add `fetch_calendar_list()` method that calls `GET https://www.googleapis.com/calendar/v3/users/me/calendarList`
- Returns `Vec<CalendarInfo>` with `{ id, summary, color, selected }`
- Modify `fetch_events()` to accept `calendar_ids: &[String]` parameter instead of hardcoded `"primary"`
- For each calendar ID, fetch events and merge with deduplication by event ID
- Add a Tauri command `get_calendar_list` that returns available calendars for the UI

- [ ] **Step 4: Write Rust test for multi-calendar**

Add to google.rs tests:
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_calendar_list_url_construction() {
        let url = super::calendar_list_url();
        assert!(url.contains("calendarList"));
    }

    #[test]
    fn test_events_url_with_calendar_id() {
        let url = super::events_url("my_calendar_id");
        assert!(url.contains("calendars/my_calendar_id/events"));
        assert!(!url.contains("primary"));
    }
}
```

- [ ] **Step 5: Run Rust tests**

Run: `cd src-tauri && cargo test calendar::google`
Expected: PASS

- [ ] **Step 6: Rewrite CalendarTab with design system + calendar toggles**

Rewrite `src/settings/tabs/CalendarTab.tsx`:
- Use `Card` components for each provider
- After connection, call `invoke('get_calendar_list')` to get available calendars
- Render each calendar with a `Toggle` to include/exclude
- On toggle, read/update `ignored_calendar_ids` from settings (JSON array string). **Note:** add `ignored_calendar_ids` with default value `'[]'` to `seed_defaults()` in `src-tauri/src/settings.rs` so the key exists on first run.
- Use `Badge` for connection status

- [ ] **Step 7: Run all tests**

Run: `npx vitest run src/settings/__tests__/CalendarTab`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/settings/tabs/CalendarTab.tsx src/settings/__tests__/CalendarTab.redesign.test.tsx src-tauri/src/calendar/google.rs
git commit -m "feat: redesign Calendar tab with multi-calendar support and ignore toggles"
```

### Task 5: Timer Tab + Rust Pause/Resume + Alerts Tab

**Depends on:** Task 1
**Files:**
- Modify: `src/settings/tabs/TimerTab.tsx`
- Move: `src/settings/components/WarningSettings.tsx` → `src/settings/tabs/AlertsTab.tsx`
- Modify: `src/settings/App.tsx` (add Alerts to MAIN_TABS)
- Modify: `src-tauri/src/lib.rs` (add pause-timer, resume-timer event listeners)
- Create: `src/settings/__tests__/TimerTab.redesign.test.tsx`
- Create: `src/settings/__tests__/AlertsTab.test.tsx`

- [ ] **Step 1: Add Rust pause/resume event handlers**

Modify `src-tauri/src/lib.rs` — in `setup_event_listeners()`, add:

```rust
// pause-timer listener — access timer state via app.state::<>(), matching existing start-timer/stop-timer pattern
let handle_pause = app.handle().clone();
app.listen("pause-timer", move |_event| {
    let timer_state = handle_pause.state::<std::sync::Mutex<TimerState>>();
    let mut state = timer_state.lock().unwrap();
    if state.status == "running" {
        state.status = "paused".to_string();
        state.paused_at = Some(chrono::Utc::now().to_rfc3339());
        let _ = handle_pause.emit("timer-state-update", &*state);
    }
});

// resume-timer listener
let handle_resume = app.handle().clone();
app.listen("resume-timer", move |_event| {
    let timer_state = handle_resume.state::<std::sync::Mutex<TimerState>>();
    let mut state = timer_state.lock().unwrap();
    if state.status == "paused" {
        if let Some(paused_at_str) = &state.paused_at {
            if let Ok(paused_at) = chrono::DateTime::parse_from_rfc3339(paused_at_str) {
                let pause_elapsed = (chrono::Utc::now() - paused_at.to_utc()).num_seconds() as f64;
                state.elapsed_before_pause += pause_elapsed;
            }
        }
        state.status = "running".to_string();
        state.started_at = Some(chrono::Utc::now().to_rfc3339());
        state.paused_at = None;
        let _ = handle_resume.emit("timer-state-update", &*state);
    }
});
```

- [ ] **Step 2: Write Rust test for pause/resume**

Add to lib.rs tests:
```rust
#[test]
fn test_timer_pause_sets_status() {
    let mut state = TimerState::default();
    state.status = "running".to_string();
    // Simulate pause
    state.status = "paused".to_string();
    state.paused_at = Some(chrono::Utc::now().to_rfc3339());
    assert_eq!(state.status, "paused");
    assert!(state.paused_at.is_some());
}

#[test]
fn test_timer_resume_clears_paused_at() {
    let mut state = TimerState::default();
    state.status = "paused".to_string();
    state.paused_at = Some(chrono::Utc::now().to_rfc3339());
    // Simulate resume
    state.status = "running".to_string();
    state.paused_at = None;
    assert_eq!(state.status, "running");
    assert!(state.paused_at.is_none());
}
```

- [ ] **Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test`
Expected: PASS

- [ ] **Step 4: Write Timer Tab tests**

Create `src/settings/__tests__/TimerTab.redesign.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('TimerTab redesign', () => {
  it('renders preset cards', async () => {
    const { TimerTab } = await import('../tabs/TimerTab');
    render(<TimerTab />);
    expect(screen.getByText('Pomodoro')).toBeInTheDocument();
    expect(screen.getByText('Focus Hour')).toBeInTheDocument();
  });

  it('renders progress ring instead of bar', async () => {
    const { TimerTab } = await import('../tabs/TimerTab');
    const { container } = render(<TimerTab />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders add custom preset button', async () => {
    const { TimerTab } = await import('../tabs/TimerTab');
    render(<TimerTab />);
    expect(screen.getByText('+')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run Timer tests — verify fail**

Run: `npx vitest run src/settings/__tests__/TimerTab.redesign.test.tsx`
Expected: FAIL

- [ ] **Step 6: Rewrite TimerTab with design system**

Rewrite `src/settings/tabs/TimerTab.tsx`:
- Replace progress bar with `ProgressRing` component (size=96)
- Add Pause/Resume button that emits `pause-timer`/`resume-timer` events
- Use `Card` components for preset grid
- Add "+" card for custom presets — inline form with name input + duration, saves JSON to settings key `custom_timer_presets`
- Use `tabular-nums` font variant for countdown display

- [ ] **Step 7: Run Timer tests — verify pass**

Run: `npx vitest run src/settings/__tests__/TimerTab.redesign.test.tsx`
Expected: PASS

- [ ] **Step 8: Create AlertsTab**

Move `src/settings/components/WarningSettings.tsx` → `src/settings/tabs/AlertsTab.tsx`. Refactor to use design system `Toggle` and `SectionHeader` components. Add description text about ambient color shifting.

- [ ] **Step 9: Wire Alerts tab into App.tsx**

Modify `src/settings/App.tsx`:
- Import `AlertsTab` from `./tabs/AlertsTab`
- Add `'alerts'` to the `TabName` union type
- Add `{ id: 'alerts', label: 'Alerts' }` to `MAIN_TABS` array (between Timer and About)
- Add the render branch: `{activeTab === 'alerts' && <AlertsTab />}` alongside the other tab conditionals

- [ ] **Step 10: Write Alerts tab test**

Create `src/settings/__tests__/AlertsTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('AlertsTab', () => {
  it('renders warning threshold toggles', async () => {
    const { AlertsTab } = await import('../tabs/AlertsTab');
    render(<AlertsTab />);
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('15 minutes')).toBeInTheDocument();
    expect(screen.getByText('5 minutes')).toBeInTheDocument();
    expect(screen.getByText('2 minutes')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run all tests**

Run: `npx vitest run src/settings/__tests__/`
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add src/settings/tabs/TimerTab.tsx src/settings/tabs/AlertsTab.tsx src/settings/App.tsx src/settings/__tests__/ src-tauri/src/lib.rs
git rm src/settings/components/WarningSettings.tsx
git commit -m "feat: redesign Timer tab with pause/resume and add Alerts tab"
```

---

## Chunk 3: Settings Shell + About Tab (Task 6)

### Task 6: Settings Window Shell + About Tab + Sidebar Rebrand

**Depends on:** Task 1, Task 5 (both modify App.tsx — Task 5 adds Alerts tab first, Task 6 rebrands the shell and must preserve the Alerts tab addition)
**Files:**
- Modify: `src/settings/App.tsx` (sidebar rebrand, window shell)
- Modify: `src/settings/tabs/AboutTab.tsx`
- Modify: `src-tauri/src/lib.rs` (update settings window size from 600×500 to 680×560)
- Create: `src/settings/__tests__/App.redesign.test.tsx`

- [ ] **Step 1: Write tests for redesigned app shell**

Create `src/settings/__tests__/App.redesign.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

describe('Settings App shell', () => {
  it('renders Morph logo in sidebar', async () => {
    const { default: App } = await import('../App');
    render(<App />);
    expect(screen.getByTestId('morph-logo')).toBeInTheDocument();
  });

  it('renders all tab nav items including Alerts', async () => {
    const { default: App } = await import('../App');
    render(<App />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Border')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Timer')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('uses design system surface colors', async () => {
    const { default: App } = await import('../App');
    const { container } = render(<App />);
    const sidebar = container.querySelector('[data-testid="sidebar"]');
    expect(sidebar).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify fails**

Run: `npx vitest run src/settings/__tests__/App.redesign.test.tsx`

- [ ] **Step 3: Rewrite App.tsx shell**

Rewrite `src/settings/App.tsx`:
- Sidebar: Morph SVG logo (green `#4A9B6E`) at top, nav items using design tokens, active tab uses `--color-primary` with low-opacity background, Ko-fi button at bottom
- Add `useTheme()` hook at the app root
- Window background uses `--color-surface-base`
- Sidebar background uses `--color-surface-overlay` on light, `--color-surface-raised` on dark
- Sidebar border uses `--color-border`
- Tab transitions: 200ms opacity fade between content panels
- Add `data-testid` attributes for testing

- [ ] **Step 4: Restyle AboutTab**

Rewrite `src/settings/tabs/AboutTab.tsx` using design system `Card`, `Button` components. Version badge, Ko-fi donate button (styled with `--color-danger`), GitHub/Issues link buttons.

- [ ] **Step 5: Run tests — verify pass**

Run: `npx vitest run src/settings/__tests__/App.redesign.test.tsx`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/settings/App.tsx src/settings/tabs/AboutTab.tsx src/settings/__tests__/App.redesign.test.tsx
git commit -m "feat: rebrand settings shell with design system, add Morph logo sidebar"
```

---

## Chunk 4: Live Preview & Timeline Scrubber (Task 7)

### Task 7: Live Preview + Timeline Scrubber

**Depends on:** Task 1, Task 3 (Border tab restructured)
**Files:**
- Create: `src/settings/components/MiniPreview.tsx`
- Create: `src/settings/components/TimelineScrubber.tsx`
- Create: `src/settings/__tests__/MiniPreview.test.tsx`
- Create: `src/settings/__tests__/TimelineScrubber.test.tsx`

- [ ] **Step 1: Write MiniPreview tests**

Create `src/settings/__tests__/MiniPreview.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
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
```

- [ ] **Step 2: Write TimelineScrubber tests**

Create `src/settings/__tests__/TimelineScrubber.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineScrubber } from '../components/TimelineScrubber';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));

describe('TimelineScrubber', () => {
  const defaultSettings = {
    palette: 'ambient' as const,
    intensity: 'normal' as const,
    warningWindows: [30, 15, 5, 2],
    ignoredCalendarIds: [],
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
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('In Session')).toBeInTheDocument();
  });

  it('renders playhead', () => {
    const { container } = render(
      <TimelineScrubber settings={defaultSettings} onBorderStateChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="playhead"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests — verify fail**

Run: `npx vitest run src/settings/__tests__/MiniPreview.test.tsx src/settings/__tests__/TimelineScrubber.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement MiniPreview**

Create `src/settings/components/MiniPreview.tsx`:

```tsx
import React, { useRef, useEffect } from 'react';

interface MiniPreviewProps {
  borderState: { color: string; opacity: number; pulseSpeed: number };
  position: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  thickness: number;
}

export function MiniPreview({ borderState, position, thickness }: MiniPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, 200, 120);

      // Screen outline
      ctx.strokeStyle = 'var(--color-border)';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 10, 160, 100);

      // Scaled border thickness (map 8-28px real to 2-8px preview)
      const scaledThickness = Math.round((thickness / 28) * 8);

      // Compute pulse opacity
      let opacity = borderState.opacity;
      if (borderState.pulseSpeed > 0) {
        const cycle = (timestamp % borderState.pulseSpeed) / borderState.pulseSpeed;
        const pulse = Math.sin(cycle * Math.PI * 2) * 0.15;
        opacity = Math.max(0, Math.min(0.95, opacity + pulse));
      }

      ctx.globalAlpha = opacity;
      ctx.fillStyle = borderState.color;

      if (position.top) ctx.fillRect(20, 10, 160, scaledThickness);
      if (position.bottom) ctx.fillRect(20, 110 - scaledThickness, 160, scaledThickness);
      if (position.left) ctx.fillRect(20, 10, scaledThickness, 100);
      if (position.right) ctx.fillRect(180 - scaledThickness, 10, scaledThickness, 100);

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [borderState, position, thickness]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      className="rounded-lg"
      style={{ backgroundColor: 'var(--color-surface-overlay)' }}
    />
  );
}
```

- [ ] **Step 5: Implement TimelineScrubber**

Create `src/settings/components/TimelineScrubber.tsx`:

A React component that:
- Creates a synthetic 30-min `CalendarEvent` centered in a 2-hour window
- Renders a horizontal `<canvas>` (full width × 48px) showing color-coded phase segments
- Renders phase labels below the canvas as positioned text spans
- Has a draggable playhead (vertical line + circle handle) with `data-testid="playhead"`
- On playhead drag, computes `fakeNow` timestamp and calls `getBorderState(syntheticEvents, fakeNow, settings)` from `src/lib/color-engine/` — **note: arg order is (events, now, settings), NOT (events, settings, now)**
- Calls `onBorderStateChange(borderState)` prop with the computed state

Key implementation: sample 100 points across the 2-hour window, call `getBorderState()` for each, render as colored 1%-width rects on the canvas.

- [ ] **Step 6: Run tests — verify pass**

Run: `npx vitest run src/settings/__tests__/MiniPreview.test.tsx src/settings/__tests__/TimelineScrubber.test.tsx`
Expected: PASS

- [ ] **Step 7: Wire into BorderTab**

Modify `src/settings/tabs/BorderTab.tsx`:
- Import `MiniPreview` and `TimelineScrubber`
- Add `MiniPreview` at the top of the tab, fed by current border settings
- Add collapsible `TimelineScrubber` below it with "Preview timeline" toggle button
- When scrubber is active, its `onBorderStateChange` updates the preview; when inactive, preview shows live state

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add src/settings/components/MiniPreview.tsx src/settings/components/TimelineScrubber.tsx src/settings/__tests__/MiniPreview.test.tsx src/settings/__tests__/TimelineScrubber.test.tsx src/settings/tabs/BorderTab.tsx
git commit -m "feat: add live border preview and timeline scrubber"
```

---

## Chunk 5: Tray Popover (Tasks 8-9)

### Task 8: Tray Popover — Rust Backend + Window Management

**Depends on:** Task 1
**Files:**
- Modify: `src-tauri/src/tray.rs` (add popover window creation, tray icon color)
- Modify: `src-tauri/src/lib.rs` (register new commands)
- Create: `src/tray/index.html`
- Create: `src/tray/main.tsx`
- Create: `src/tray/styles.css`
- Modify: `vite.config.ts` (add tray entry point)
- Create: `src-tauri/icons/tray/` (phase-colored PNGs — 6 icons)

- [ ] **Step 1: Add tray entry point to Vite config**

Modify `vite.config.ts` — add to `rollupOptions.input`:
```typescript
tray: path.resolve(__dirname, 'src/tray/index.html'),
```

- [ ] **Step 2: Create tray HTML entry point**

Create `src/tray/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Morph</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

Create `src/tray/styles.css`:
```css
@import '../shared/design-tokens.css';

body {
  margin: 0;
  overflow: hidden;
  background: var(--color-surface-base);
  font-family: system-ui, -apple-system, sans-serif;
}
```

Create `src/tray/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TrayApp } from './App';
import { applyTheme, getResolvedTheme } from '../shared/hooks/useTheme';
import './styles.css';

const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(getResolvedTheme('system', osDark));

ReactDOM.createRoot(document.getElementById('root')!).render(<TrayApp />);
```

- [ ] **Step 3: Modify tray.rs for popover window creation**

Modify `src-tauri/src/tray.rs`:
- On tray icon click: get `TrayIconEvent::Click { position, .. }`
- Check if tray popover window exists. If yes, toggle visibility. If no, create it:
  ```rust
  let popover = WebviewWindowBuilder::new(app, "tray-popover", WebviewUrl::App("src/tray/index.html".into()))
      .title("")
      .inner_size(320.0, 400.0)
      .position(position.x - 160.0, position.y) // centered below tray
      .decorations(false)
      .skip_taskbar(true)
      .transparent(true)
      .visible(true)
      .build()?;
  ```
- On macOS: defer NSWindow config (NSFloatingWindowLevel, IgnoresCycle) using the same pattern as overlay windows in lib.rs
- Add tray icon phase color update: listen to `border-state-update` events and call `tray.set_icon()` with the appropriate pre-rendered PNG

- [ ] **Step 4: Create tray icon PNGs**

Create `src-tauri/icons/tray/` directory with 6 template PNGs (22×22 for macOS, 16×16 for Windows):
- `tray-free.png` — green tint
- `tray-warning.png` — amber tint
- `tray-session.png` — green/neutral
- `tray-overtime.png` — purple tint
- `tray-paused.png` — gray with pause bars
- `tray-none.png` — gray

Note: These can be generated programmatically or designed. For initial implementation, create simple solid-color circle icons.

- [ ] **Step 5: Run Rust compilation check**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/tray/ src-tauri/src/tray.rs src-tauri/src/lib.rs src-tauri/icons/tray/ vite.config.ts
git commit -m "feat: add tray popover window management and phase-colored tray icons"
```

### Task 9: Tray Popover — React UI

**Depends on:** Task 1, Task 8 (window exists), Task 5 (for pause/timer quick actions)
**Files:**
- Create: `src/tray/App.tsx`
- Create: `src/tray/components/StatusHeader.tsx`
- Create: `src/tray/components/UpNext.tsx`
- Create: `src/tray/components/QuickActions.tsx`
- Create: `src/tray/components/ActiveTimer.tsx`
- Create: `src/tray/components/Footer.tsx`
- Create: `src/tray/__tests__/TrayApp.test.tsx`

- [ ] **Step 1: Write tests for tray components**

Create `src/tray/__tests__/TrayApp.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]), execute: vi.fn() }) },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    close: vi.fn(),
  }),
}));

describe('TrayApp', () => {
  it('renders status header', async () => {
    const { TrayApp } = await import('../App');
    render(<TrayApp />);
    expect(screen.getByTestId('status-header')).toBeInTheDocument();
  });

  it('renders Up Next section', async () => {
    const { TrayApp } = await import('../App');
    render(<TrayApp />);
    expect(screen.getByText('UP NEXT')).toBeInTheDocument();
  });

  it('renders quick action buttons', async () => {
    const { TrayApp } = await import('../App');
    render(<TrayApp />);
    expect(screen.getByText('Pause')).toBeInTheDocument();
    expect(screen.getByText('Timer')).toBeInTheDocument();
    expect(screen.getByText('Sync')).toBeInTheDocument();
  });

  it('renders footer with settings link', async () => {
    const { TrayApp } = await import('../App');
    render(<TrayApp />);
    expect(screen.getByTestId('settings-link')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

Run: `npx vitest run src/tray/__tests__/TrayApp.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement tray popover components**

Create `src/tray/components/StatusHeader.tsx`:
- Listens to `border-state-update` event
- Computes status text from calendar events ("Free — X min to next" / "Meeting in X min" / "In Session: ..." / "Overtime +X min")
- Background tint using current phase color at 10% opacity
- Uses `Badge` and design tokens

Create `src/tray/components/UpNext.tsx`:
- Listens to `calendar-events-update` event
- Shows next 3 events today (filtered by `ignored_calendar_ids`)
- Each row: colored dot (calendar color), time (HH:MM), truncated title
- Shows "No more events today" when empty

Create `src/tray/components/QuickActions.tsx`:
- Three `IconButton` actions: Pause, Timer, Sync
- Pause: flyout with `Chip` duration pickers, emits `pause-border` event
- Timer: flyout with preset `Chip`s, emits `start-timer` event
- Sync: emits `force-sync` event, shows spinner during sync

Create `src/tray/components/ActiveTimer.tsx`:
- Conditional render (only when timer running)
- Compact `ProgressRing` (48px) + countdown text
- Pause/Resume + Stop buttons
- Preset name label

Create `src/tray/components/Footer.tsx`:
- Settings gear `IconButton` — opens settings window via `invoke`, closes popover
- Connected provider dots using `Badge`

Create `src/tray/App.tsx`:
- Composes all components in the layout from the spec
- Sets up `onFocusChanged` dismiss: `getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (!focused) getCurrentWindow().close(); })`
- Uses `useTheme()` hook

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/tray/__tests__/TrayApp.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tray/
git commit -m "feat: implement tray popover UI with status, events, quick actions"
```

---

## Chunk 6: Platform Parity & Cleanup (Task 10)

### Task 10: Platform Parity + Cleanup

**Depends on:** Task 1
**Files:**
- Modify: `src-tauri/src/window_manager/windows.rs`
- Modify: `src-tauri/tauri.conf.json` (fix hardcoded geometry)
- Delete: `src-tauri/src/tick.rs`
- Modify: `src-tauri/src/lib.rs` (remove `pub mod tick;`)
- Modify: `.gitignore`

- [ ] **Step 1: Fix hardcoded overlay window geometry**

Modify `src-tauri/tauri.conf.json` — change all 4 border windows from 1920×1080 hardcoded positions to small defaults:

```json
{
  "label": "border-top",
  "url": "src/overlay/index.html",
  "width": 100,
  "height": 16,
  "x": 0,
  "y": 0,
  "visible": false,
  "transparent": true,
  "decorations": false,
  "skipTaskbar": true,
  "resizable": false,
  "alwaysOnTop": true
}
```

(Same pattern for all 4 windows — small defaults, overlay manager repositions dynamically.)

- [ ] **Step 2: Implement Windows overlay positioning**

Modify `src-tauri/src/window_manager/windows.rs`:

```rust
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::UI::WindowsAndMessaging::*;

pub fn get_monitor_rect(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            Some(info.rcMonitor)
        } else {
            None
        }
    }
}

pub fn apply_overlay_styles(hwnd: HWND) {
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(
            hwnd,
            GWL_EXSTYLE,
            ex_style | (WS_EX_TRANSPARENT.0 as isize) | (WS_EX_LAYERED.0 as isize) | (WS_EX_TOOLWINDOW.0 as isize) | (WS_EX_TOPMOST.0 as isize),
        );
    }
}

pub fn position_border_windows(
    top: HWND, bottom: HWND, left: HWND, right: HWND,
    thickness: i32,
) {
    if let Some(rect) = get_monitor_rect(top) {
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        let x = rect.left;
        let y = rect.top;

        unsafe {
            // Top
            SetWindowPos(top, HWND_TOPMOST, x, y, w, thickness, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            // Bottom
            SetWindowPos(bottom, HWND_TOPMOST, x, y + h - thickness, w, thickness, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            // Left
            SetWindowPos(left, HWND_TOPMOST, x, y + thickness, thickness, h - 2 * thickness, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            // Right
            SetWindowPos(right, HWND_TOPMOST, x + w - thickness, y + thickness, thickness, h - 2 * thickness, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }
}
```

- [ ] **Step 3: Write Rust tests for Windows overlay**

```rust
#[cfg(test)]
#[cfg(target_os = "windows")]
mod tests {
    use super::*;

    #[test]
    fn test_overlay_style_flags() {
        let flags = WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0;
        assert!(flags & WS_EX_TRANSPARENT.0 != 0);
        assert!(flags & WS_EX_LAYERED.0 != 0);
        assert!(flags & WS_EX_TOOLWINDOW.0 != 0);
    }
}
```

- [ ] **Step 4: Run Rust tests (on available platform)**

Run: `cd src-tauri && cargo test`
Expected: PASS (Windows-specific tests only run on Windows)

- [ ] **Step 5: Delete tick.rs**

Delete `src-tauri/src/tick.rs` and remove `pub mod tick;` from `src-tauri/src/lib.rs`.

- [ ] **Step 6: Update .gitignore**

Add to `.gitignore`:
```
.superpowers/
```

- [ ] **Step 7: Commit untracked files**

```bash
git add src/settings/ErrorBoundary.tsx src/lib/color-engine/__tests__/color-math.test.ts src/lib/color-engine/__tests__/performance.bench.ts
git commit -m "chore: commit previously untracked test files and ErrorBoundary"
```

- [ ] **Step 8: Commit cleanup**

```bash
git rm src-tauri/src/tick.rs
git add src-tauri/src/lib.rs src-tauri/src/window_manager/windows.rs src-tauri/tauri.conf.json .gitignore
git commit -m "feat: Windows overlay parity, fix hardcoded geometry, remove dead tick module"
```

- [ ] **Step 9: Run full test suite**

Run: `npx vitest run && cd src-tauri && cargo test`
Expected: All pass

---

## Agent Assignment Summary

| Agent | Task | Slice | Dependencies |
|-------|------|-------|-------------|
| 1 | Design System & Theming | 1 | None (runs first) |
| 2 | General Tab + Autostart | 2 | Task 1 |
| 3 | Border Tab Redesign | 2 | Task 1 |
| 4 | Calendar Tab + Multi-Calendar | 2 | Task 1 |
| 5 | Timer Tab + Pause/Resume + Alerts | 2 | Task 1 |
| 6 | Settings Shell + About + Sidebar | 2 | Task 1, Task 5 |
| 7 | Live Preview + Timeline Scrubber | 3 | Task 1, Task 3 |
| 8 | Tray Popover Backend | 4 | Task 1 |
| 9 | Tray Popover UI | 4 | Task 1, Task 8, Task 5 |
| 10 | Platform Parity + Cleanup | 5 | Task 1 |

**Execution order:**
1. Agent 1 runs alone (Task 1 — design system)
2. Agents 2-5, 8, 10 run in parallel (all depend only on Task 1)
3. Agent 6 runs after Agent 5 completes (both modify App.tsx)
4. Agent 7 runs after Agent 3 completes (needs Border tab)
5. Agent 9 runs after Agents 5 and 8 complete (needs timer infrastructure + popover window)

// @vitest-environment jsdom
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

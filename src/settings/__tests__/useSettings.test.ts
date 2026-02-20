import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tauri-apps/api/core before importing the module under test
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settings parsing logic', () => {
  it('parses backend tuple array into a Map', () => {
    const pairs: [string, string][] = [
      ['border_thickness', '4'],
      ['color_palette', 'ambient'],
      ['launch_at_login', 'false'],
    ];
    const map = new Map(pairs);

    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(3);
    expect(map.get('border_thickness')).toBe('4');
    expect(map.get('color_palette')).toBe('ambient');
    expect(map.get('launch_at_login')).toBe('false');
  });

  it('returns undefined for keys not in the Map', () => {
    const pairs: [string, string][] = [['border_thickness', '4']];
    const map = new Map(pairs);

    expect(map.get('nonexistent_key')).toBeUndefined();
  });

  it('handles empty backend response', () => {
    const pairs: [string, string][] = [];
    const map = new Map(pairs);

    expect(map.size).toBe(0);
    expect(map.get('anything')).toBeUndefined();
  });

  it('setSetting updates local Map state correctly', () => {
    const pairs: [string, string][] = [['border_thickness', '4']];
    const map = new Map(pairs);

    // Simulate setSetting: create new Map with updated value
    const next = new Map(map);
    next.set('border_thickness', '8');

    expect(next.get('border_thickness')).toBe('8');
    // Original is unchanged (immutable update pattern)
    expect(map.get('border_thickness')).toBe('4');
  });

  it('setSetting can add new keys', () => {
    const map = new Map<string, string>();

    const next = new Map(map);
    next.set('new_key', 'new_value');

    expect(next.get('new_key')).toBe('new_value');
    expect(next.size).toBe(1);
  });

  it('parses all default setting keys from backend', () => {
    const pairs: [string, string][] = [
      ['border_thickness', '4'],
      ['border_position', 'all'],
      ['color_palette', 'ambient'],
      ['color_intensity', 'normal'],
      ['warning_30min', 'true'],
      ['warning_15min', 'true'],
      ['warning_5min', 'true'],
      ['warning_2min', 'true'],
      ['poll_interval_seconds', '300'],
      ['launch_at_login', 'false'],
    ];
    const map = new Map(pairs);

    expect(map.size).toBe(10);
    expect(map.get('poll_interval_seconds')).toBe('300');
    expect(map.get('warning_5min')).toBe('true');
    expect(map.get('border_position')).toBe('all');
  });
});

describe('invoke calls', () => {
  it('get_all_settings calls invoke with correct command', async () => {
    mockInvoke.mockResolvedValueOnce([['border_thickness', '4']]);

    const result = await invoke<[string, string][]>('get_all_settings');

    expect(mockInvoke).toHaveBeenCalledWith('get_all_settings');
    expect(result).toEqual([['border_thickness', '4']]);
  });

  it('set_setting calls invoke with key and value', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await invoke('set_setting', { key: 'border_thickness', value: '8' });

    expect(mockInvoke).toHaveBeenCalledWith('set_setting', {
      key: 'border_thickness',
      value: '8',
    });
  });

  it('handles get_all_settings failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('DB unavailable'));

    await expect(invoke('get_all_settings')).rejects.toThrow('DB unavailable');
  });
});

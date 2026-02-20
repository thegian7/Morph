import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface SettingsContextValue {
  settings: Map<string, string>;
  loading: boolean;
  getSetting: (key: string) => string | undefined;
  setSetting: (key: string, value: string) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsProvider(): SettingsContextValue {
  const [settings, setSettings] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<[string, string][]>('get_all_settings')
      .then((pairs) => {
        setSettings(new Map(pairs));
      })
      .catch((err) => {
        console.error('Failed to load settings:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const getSetting = useCallback(
    (key: string): string | undefined => {
      return settings.get(key);
    },
    [settings],
  );

  const setSetting = useCallback(
    (key: string, value: string): void => {
      invoke('set_setting', { key, value }).catch((err) => {
        console.error(`Failed to save setting "${key}":`, err);
      });
      setSettings((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
    },
    [],
  );

  return { settings, loading, getSetting, setSetting };
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}

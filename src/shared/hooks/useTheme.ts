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

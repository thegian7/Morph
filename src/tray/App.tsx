import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTheme } from '../shared/hooks/useTheme';
import { StatusHeader } from './components/StatusHeader';
import { UpNext } from './components/UpNext';
import { QuickActions } from './components/QuickActions';
import { ActiveTimer } from './components/ActiveTimer';
import { Footer } from './components/Footer';

/** macOS draws the popover with native vibrancy behind a translucent page. */
export function isMacPopover(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform || '') || /Macintosh/i.test(navigator.userAgent || '');
}

/** Ask Rust to hide the popover (it also hands focus back on macOS). */
export function hidePopover(): void {
  invoke('hide_tray_popover').catch(() => {});
}

export function TrayApp() {
  useTheme();
  const vibrant = isMacPopover();

  useEffect(() => {
    if (vibrant) document.documentElement.classList.add('vibrant');
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) hidePopover();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hidePopover();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlistenFocus.then((fn) => fn()).catch(() => {});
    };
  }, [vibrant]);

  return (
    <div
      id="tray-popover"
      className="flex flex-col"
      style={{
        minHeight: '100vh',
        // On macOS a translucent tint over the native frosted background
        // keeps the theme's colors while letting the blur show through.
        backgroundColor: vibrant
          ? 'color-mix(in srgb, var(--color-surface-base) 72%, transparent)'
          : 'var(--color-surface-base)',
        color: 'var(--color-text)',
      }}
    >
      <StatusHeader />
      <UpNext />
      <QuickActions />
      <ActiveTimer />
      <div className="flex-1" />
      <Footer />
    </div>
  );
}

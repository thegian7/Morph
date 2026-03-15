import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTheme } from '../shared/hooks/useTheme';
import { StatusHeader } from './components/StatusHeader';
import { UpNext } from './components/UpNext';
import { QuickActions } from './components/QuickActions';
import { ActiveTimer } from './components/ActiveTimer';
import { Footer } from './components/Footer';

export function TrayApp() {
  useTheme();

  useEffect(() => {
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) getCurrentWindow().close();
    });
  }, []);

  return (
    <div
      id="tray-popover"
      className="flex flex-col"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-surface-base)',
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

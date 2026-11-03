import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { EdgeFlags } from '../components/fitEdges';

const POLL_MS = 3000;

/**
 * Edges macOS reserves (menu bar, Dock) on `monitorId`, polled while
 * `enabled` so moving the Dock is reflected without reopening Settings.
 * `null` until known (or when disabled).
 */
export function useReservedEdges(enabled: boolean, monitorId: string): EdgeFlags | null {
  const [reserved, setReserved] = useState<EdgeFlags | null>(null);

  useEffect(() => {
    if (!enabled) {
      setReserved(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      invoke<EdgeFlags>('get_reserved_edges', { monitorId })
        .then((value) => {
          if (!cancelled) setReserved(value);
        })
        .catch(() => {});
    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, monitorId]);

  return reserved;
}

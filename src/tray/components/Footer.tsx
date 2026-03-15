import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { emit } from '@tauri-apps/api/event';
import { IconButton, Badge } from '../../shared/components';

interface ProviderStatus {
  google?: boolean;
  microsoft?: boolean;
  apple?: boolean;
}

export function Footer() {
  const [providers, setProviders] = useState<ProviderStatus>({});

  useEffect(() => {
    const unlisten = listen<ProviderStatus>('provider-status-update', (event) => {
      setProviders(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleOpenSettings = () => {
    emit('open-settings');
  };

  const connectedProviders = Object.entries(providers).filter(([, connected]) => connected);

  return (
    <div
      className="px-4 py-2 flex items-center justify-between"
      style={{ borderTop: '1px solid var(--color-border-subtle)' }}
    >
      <div className="flex items-center gap-1">
        {connectedProviders.map(([name]) => (
          <Badge key={name} color="var(--color-success)" text={name} />
        ))}
        {connectedProviders.length === 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            No providers connected
          </span>
        )}
      </div>
      <IconButton title="Open settings" onClick={handleOpenSettings} data-testid="settings-link">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4zm6.32-1.906l-1.076-.606a5.477 5.477 0 000-1.776l1.076-.606a.5.5 0 00.184-.684l-1-1.732a.5.5 0 00-.684-.183l-1.076.606a5.477 5.477 0 00-1.538-.888V1.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v1.213a5.477 5.477 0 00-1.538.888l-1.076-.606a.5.5 0 00-.684.183l-1 1.732a.5.5 0 00.184.684l1.076.606a5.477 5.477 0 000 1.776l-1.076.606a.5.5 0 00-.184.684l1 1.732a.5.5 0 00.684.183l1.076-.606c.46.378.977.684 1.538.888V14.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1.213a5.477 5.477 0 001.538-.888l1.076.606a.5.5 0 00.684-.183l1-1.732a.5.5 0 00-.184-.684z" />
        </svg>
      </IconButton>
    </div>
  );
}

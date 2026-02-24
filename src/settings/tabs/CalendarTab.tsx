import { useState, useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface ProviderStatus {
  connected: boolean;
  accountName?: string;
  lastSync?: string;
  error?: string;
}

type ProviderId = 'google' | 'microsoft' | 'apple';

interface ProviderConfig {
  id: ProviderId;
  name: string;
  label: string;
  color: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'google', name: 'G', label: 'Google Calendar', color: 'bg-red-500' },
  { id: 'microsoft', name: 'M', label: 'Microsoft Calendar', color: 'bg-blue-600' },
  { id: 'apple', name: 'A', label: 'Apple Calendar', color: 'bg-gray-700' },
];

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

export default function CalendarTab() {
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({
    google: { connected: false },
    microsoft: { connected: false },
    apple: { connected: false },
  });
  const [lastGlobalSync, setLastGlobalSync] = useState<string | undefined>();

  useEffect(() => {
    // Fetch current provider statuses on mount
    invoke<{ provider: string; status: ProviderStatus }[]>('get_provider_statuses')
      .then((statuses) => {
        setProviders((prev) => {
          const next = { ...prev };
          for (const s of statuses) {
            next[s.provider] = s.status;
          }
          return next;
        });
      })
      .catch(() => {});

    const unlistenStatus = listen<{ provider: string; status: ProviderStatus }>(
      'provider-status-update',
      (event) => {
        setProviders((prev) => ({
          ...prev,
          [event.payload.provider]: event.payload.status,
        }));
      },
    );
    const unlistenSync = listen('calendar-events-update', () => {
      setLastGlobalSync(new Date().toISOString());
    });
    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenSync.then((fn) => fn());
    };
  }, []);

  function handleConnect(provider: string) {
    emit('connect-provider', { provider });
  }

  function handleDisconnect(provider: string) {
    emit('disconnect-provider', { provider });
    setProviders((prev) => ({ ...prev, [provider]: { connected: false } }));
  }

  function handleSyncNow() {
    emit('force-sync', {});
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">Calendar Connections</h2>
        <p className="text-sm text-gray-500 mb-6">
          Connect your calendars to see upcoming events on the border.
        </p>
      </div>

      {/* Provider Cards */}
      <section className="space-y-3">
        {PROVIDERS.map((config) => {
          const status = providers[config.id];
          return (
            <div key={config.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-white text-sm font-bold`}
                  >
                    {config.name}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{config.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className={`w-2 h-2 rounded-full ${status?.connected ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                      <p className="text-xs text-gray-500">
                        {status?.connected
                          ? status.accountName
                            ? `Connected as ${status.accountName}`
                            : 'Connected'
                          : 'Not connected'}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  {status?.connected ? (
                    <button
                      onClick={() => handleDisconnect(config.id)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(config.id)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {status?.connected && status.lastSync && (
                <p className="text-xs text-gray-400 mt-2 ml-11">
                  Last synced: {formatRelativeTime(status.lastSync)}
                </p>
              )}
              {status?.error && <p className="text-xs text-red-500 mt-2 ml-11">{status.error}</p>}
            </div>
          );
        })}
      </section>

      {/* Sync Status */}
      <section>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {lastGlobalSync
              ? `Last synced: ${formatRelativeTime(lastGlobalSync)}`
              : 'Not yet synced'}
          </p>
          <button
            onClick={handleSyncNow}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Sync Now
          </button>
        </div>
      </section>
    </div>
  );
}

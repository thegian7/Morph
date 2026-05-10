import { useState, useEffect, useCallback } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Card, Badge, Toggle, SectionHeader, Button } from '../../shared/components';

interface ProviderStatus {
  connected: boolean;
  accountName?: string;
  lastSync?: string;
  error?: string;
}

interface CalendarInfo {
  id: string;
  summary: string;
  color: string | null;
  selected: boolean;
  primary: boolean;
}

type ProviderId = 'google' | 'microsoft' | 'apple';

interface ProviderConfig {
  id: ProviderId;
  label: string;
  color: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'google', label: 'Google Calendar', color: '#EA4335' },
  { id: 'microsoft', label: 'Microsoft Outlook', color: '#0078D4' },
  { id: 'apple', label: 'Apple Calendar', color: '#57534E' },
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
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);

  const loadIgnoredIds = useCallback(async () => {
    try {
      const val = await invoke<string | null>('get_setting', { key: 'ignored_calendar_ids' });
      if (val) {
        setIgnoredIds(JSON.parse(val));
      }
    } catch {
      // Setting may not exist yet
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      const list = await invoke<CalendarInfo[]>('get_calendar_list');
      setCalendars(list);
    } catch {
      // Provider may not be connected
    }
  }, []);

  useEffect(() => {
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

    loadIgnoredIds();
    loadCalendars();

    const unlistenStatus = listen<{ provider: string; status: ProviderStatus }>(
      'provider-status-update',
      (event) => {
        setProviders((prev) => ({
          ...prev,
          [event.payload.provider]: event.payload.status,
        }));
        // Reload calendars when a provider connects
        if (event.payload.status.connected) {
          loadCalendars();
        }
      },
    );
    const unlistenSync = listen('calendar-events-update', () => {
      setLastGlobalSync(new Date().toISOString());
    });
    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenSync.then((fn) => fn());
    };
  }, [loadCalendars, loadIgnoredIds]);

  function handleConnect(provider: string) {
    emit('connect-provider', { provider });
  }

  function handleDisconnect(provider: string) {
    emit('disconnect-provider', { provider });
    setProviders((prev) => ({ ...prev, [provider]: { connected: false } }));
    if (provider === 'google') {
      setCalendars([]);
    }
  }

  function handleSyncNow() {
    emit('force-sync', {});
  }

  async function handleToggleCalendar(calendarId: string, enabled: boolean) {
    const newIgnored = enabled
      ? ignoredIds.filter((id) => id !== calendarId)
      : [...ignoredIds, calendarId];
    setIgnoredIds(newIgnored);
    try {
      await invoke('set_setting', {
        key: 'ignored_calendar_ids',
        value: JSON.stringify(newIgnored),
      });
    } catch {
      // Revert on failure
      setIgnoredIds(ignoredIds);
    }
  }

  const hasConnectedProvider = Object.values(providers).some((s) => s.connected);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Calendar Connections"
        description="Connect your calendars to see upcoming events on the border."
      />

      {/* Provider Cards */}
      <div className="space-y-3">
        {PROVIDERS.map((config) => {
          const status = providers[config.id];
          return (
            <Card key={config.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: config.color }}
                  >
                    <span className="text-white text-sm font-bold">
                      {config.label.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 'var(--text-base)',
                        color: 'var(--color-text)',
                        fontWeight: 500,
                      }}
                    >
                      {config.label}
                    </p>
                    <Badge
                      color={status?.connected ? 'var(--color-success)' : 'var(--color-text-muted)'}
                      text={
                        status?.connected
                          ? status.accountName
                            ? `Connected as ${status.accountName}`
                            : 'Connected'
                          : 'Not connected'
                      }
                    />
                  </div>
                </div>
                <div>
                  {status?.connected ? (
                    <Button variant="ghost" onClick={() => handleDisconnect(config.id)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => handleConnect(config.id)}>
                      Connect
                    </Button>
                  )}
                </div>
              </div>
              {status?.connected && status.lastSync && (
                <p
                  className="mt-2 ml-11"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                >
                  Last synced: {formatRelativeTime(status.lastSync)}
                </p>
              )}
              {status?.error && (
                <p
                  className="mt-2 ml-11"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}
                >
                  {status.error}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Calendar Toggles */}
      {calendars.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title="Calendars"
            description="Choose which calendars to show on the border."
          />
          <Card>
            <div className="space-y-3">
              {calendars.map((cal) => (
                <div key={cal.id} className="flex items-center gap-3">
                  {cal.color && (
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color }}
                    />
                  )}
                  <Toggle
                    label={cal.summary + (cal.primary ? ' (Primary)' : '')}
                    checked={!ignoredIds.includes(cal.id)}
                    onChange={(enabled) => handleToggleCalendar(cal.id, enabled)}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Sync Status */}
      {hasConnectedProvider && (
        <div className="flex items-center justify-between">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {lastGlobalSync
              ? `Last synced: ${formatRelativeTime(lastGlobalSync)}`
              : 'Not yet synced'}
          </p>
          <Button variant="secondary" onClick={handleSyncNow}>
            Sync Now
          </Button>
        </div>
      )}
    </div>
  );
}

export { CalendarTab };

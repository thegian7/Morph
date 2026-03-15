import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar_color?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function UpNext() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const unlisten = listen<CalendarEvent[]>('calendar-events-update', (event) => {
      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const upcoming = event.payload
        .filter((e) => new Date(e.end) > now && new Date(e.start) <= todayEnd)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, 3);

      setEvents(upcoming);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="px-4 py-2">
      <div
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-2)',
        }}
      >
        UP NEXT
      </div>
      {events.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          No more events today
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-2 py-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: event.calendar_color ?? 'var(--color-primary)' }}
              />
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: '3.5em',
                }}
              >
                {formatTime(event.start)}
              </span>
              <span
                className="truncate"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
              >
                {event.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

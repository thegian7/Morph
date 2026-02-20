use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use super::aggregator::CalendarAggregator;
use super::types::CalendarEvent;

/// A fingerprint of an event used for change detection.
/// We compare id, start_time, and end_time to decide if the event list changed.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct EventFingerprint {
    id: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
}

impl From<&CalendarEvent> for EventFingerprint {
    fn from(e: &CalendarEvent) -> Self {
        Self {
            id: e.id.clone(),
            start_time: e.start_time,
            end_time: e.end_time,
        }
    }
}

/// Background service that polls calendar providers on an interval,
/// caches events in SQLite, and emits Tauri events when the event list changes.
pub struct CalendarPoller;

impl CalendarPoller {
    /// Start the polling loop as a background Tokio task.
    ///
    /// - On cold start, loads cached events from SQLite and emits them immediately.
    /// - Every `poll_interval` seconds, fetches from all providers via the aggregator.
    /// - If the fetched event set differs from the last known set, emits
    ///   `calendar-events-update` and updates the SQLite cache.
    /// - On fetch failure (all providers fail), falls back to cached events.
    pub fn start(app: AppHandle, aggregator: Arc<Mutex<CalendarAggregator>>) {
        tauri::async_runtime::spawn(async move {
            // Read poll interval from settings, default to 60s
            let poll_interval = read_poll_interval(&app).await;

            // Get the SQLite pool from tauri-plugin-sql managed state
            let pool = match get_sqlite_pool(&app).await {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("[poller] Failed to get SQLite pool: {e}");
                    return;
                }
            };

            // Cold start: load cached events from SQLite
            let mut last_fingerprints = HashMap::new();
            match load_cached_events(&pool).await {
                Ok(cached) => {
                    if !cached.is_empty() {
                        for event in &cached {
                            last_fingerprints
                                .insert(event.id.clone(), EventFingerprint::from(event));
                        }
                        let _ = app.emit("calendar-events-update", &cached);
                    }
                }
                Err(e) => {
                    eprintln!("[poller] Failed to load cached events: {e}");
                }
            }

            loop {
                tokio::time::sleep(poll_interval).await;

                // Fetch from all providers
                let result = {
                    let agg = aggregator.lock().await;
                    if agg.provider_count() == 0 {
                        // No providers connected — emit empty list if we previously had events
                        if !last_fingerprints.is_empty() {
                            last_fingerprints.clear();
                            let empty: Vec<CalendarEvent> = Vec::new();
                            let _ = app.emit("calendar-events-update", &empty);
                        }
                        continue;
                    }
                    let from = Utc::now();
                    let to = from + chrono::Duration::hours(24);
                    agg.fetch_events(from, to).await
                };

                if !result.errors.is_empty() {
                    for (provider_id, err) in &result.errors {
                        eprintln!("[poller] Provider {provider_id} error: {err}");
                    }
                }

                // If ALL providers failed and we got zero events, keep using cached
                if result.events.is_empty() && !result.errors.is_empty() {
                    continue;
                }

                let events = result.events;

                // Change detection: compare fingerprints
                let new_fingerprints: HashMap<String, EventFingerprint> = events
                    .iter()
                    .map(|e| (e.id.clone(), EventFingerprint::from(e)))
                    .collect();

                if new_fingerprints != last_fingerprints {
                    // Events changed — emit update and cache
                    let _ = app.emit("calendar-events-update", &events);
                    if let Err(e) = cache_events(&pool, &events).await {
                        eprintln!("[poller] Failed to cache events: {e}");
                    }
                    last_fingerprints = new_fingerprints;
                }
            }
        });
    }
}

/// Read the poll interval from the settings table. Falls back to 60 seconds.
async fn read_poll_interval(app: &AppHandle) -> Duration {
    let pool = match get_sqlite_pool(app).await {
        Ok(p) => p,
        Err(_) => return Duration::from_secs(60),
    };

    let row = sqlx::query("SELECT value FROM settings WHERE key = 'poll_interval_seconds'")
        .fetch_optional(&pool)
        .await;

    match row {
        Ok(Some(r)) => {
            let val: String = r.get("value");
            let secs: u64 = val.parse().unwrap_or(60);
            Duration::from_secs(secs)
        }
        _ => Duration::from_secs(60),
    }
}

/// Get the SQLite pool from tauri-plugin-sql's managed DbInstances.
async fn get_sqlite_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_instances = app.state::<tauri_plugin_sql::DbInstances>();
    let instances = db_instances.0.read().await;
    let pool = instances
        .get("sqlite:lighttime.db")
        .ok_or_else(|| "Database 'sqlite:lighttime.db' not loaded".to_string())?;
    match pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err("Expected SQLite database".to_string()),
    }
}

/// Load cached calendar events from SQLite.
async fn load_cached_events(pool: &SqlitePool) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query(
        "SELECT id, provider_id, calendar_id, title, start_time, end_time, is_all_day, ignored
         FROM calendar_events
         ORDER BY start_time",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let events = rows
        .iter()
        .filter_map(|row| {
            let start_str: String = row.get("start_time");
            let end_str: String = row.get("end_time");
            let start_time = start_str.parse::<DateTime<Utc>>().ok()?;
            let end_time = end_str.parse::<DateTime<Utc>>().ok()?;
            let is_all_day_int: i32 = row.get("is_all_day");
            let ignored_int: i32 = row.get("ignored");

            Some(CalendarEvent {
                id: row.get("id"),
                provider_id: row.get("provider_id"),
                calendar_id: row.get("calendar_id"),
                title: row.get("title"),
                start_time,
                end_time,
                is_all_day: is_all_day_int != 0,
                ignored: ignored_int != 0,
            })
        })
        .collect();

    Ok(events)
}

/// Write events to the SQLite cache, replacing existing entries.
async fn cache_events(pool: &SqlitePool, events: &[CalendarEvent]) -> Result<(), String> {
    // Clear stale events and insert fresh ones in a transaction
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM calendar_events")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for event in events {
        sqlx::query(
            "INSERT INTO calendar_events (id, provider_id, calendar_id, title, start_time, end_time, is_all_day, ignored, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
        )
        .bind(&event.id)
        .bind(&event.provider_id)
        .bind(&event.calendar_id)
        .bind(&event.title)
        .bind(event.start_time.to_rfc3339())
        .bind(event.end_time.to_rfc3339())
        .bind(event.is_all_day as i32)
        .bind(event.ignored as i32)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Check whether two event sets differ (used for change detection).
#[cfg(test)]
fn events_changed(
    old: &HashMap<String, EventFingerprint>,
    new: &HashMap<String, EventFingerprint>,
) -> bool {
    old != new
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn make_event(id: &str, title: &str, hour: u32, provider_id: &str) -> CalendarEvent {
        CalendarEvent {
            id: id.to_string(),
            title: title.to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 20, hour, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 20, hour, 30, 0).unwrap(),
            ignored: false,
            calendar_id: None,
            provider_id: provider_id.to_string(),
            is_all_day: false,
        }
    }

    fn fingerprints(events: &[CalendarEvent]) -> HashMap<String, EventFingerprint> {
        events
            .iter()
            .map(|e| (e.id.clone(), EventFingerprint::from(e)))
            .collect()
    }

    // --- Change detection tests ---

    #[test]
    fn identical_events_are_not_changed() {
        let events = vec![
            make_event("1", "Meeting A", 10, "google"),
            make_event("2", "Meeting B", 14, "google"),
        ];
        let old = fingerprints(&events);
        let new = fingerprints(&events);
        assert!(!events_changed(&old, &new));
    }

    #[test]
    fn different_event_ids_detected_as_changed() {
        let old_events = vec![make_event("1", "Meeting A", 10, "google")];
        let new_events = vec![make_event("2", "Meeting B", 14, "google")];
        let old = fingerprints(&old_events);
        let new = fingerprints(&new_events);
        assert!(events_changed(&old, &new));
    }

    #[test]
    fn changed_start_time_detected() {
        let old_events = vec![make_event("1", "Meeting", 10, "google")];
        let mut new_events = vec![make_event("1", "Meeting", 10, "google")];
        new_events[0].start_time = Utc.with_ymd_and_hms(2026, 2, 20, 11, 0, 0).unwrap();

        let old = fingerprints(&old_events);
        let new = fingerprints(&new_events);
        assert!(events_changed(&old, &new));
    }

    #[test]
    fn added_event_detected() {
        let old_events = vec![make_event("1", "Meeting A", 10, "google")];
        let new_events = vec![
            make_event("1", "Meeting A", 10, "google"),
            make_event("2", "Meeting B", 14, "google"),
        ];
        let old = fingerprints(&old_events);
        let new = fingerprints(&new_events);
        assert!(events_changed(&old, &new));
    }

    #[test]
    fn removed_event_detected() {
        let old_events = vec![
            make_event("1", "Meeting A", 10, "google"),
            make_event("2", "Meeting B", 14, "google"),
        ];
        let new_events = vec![make_event("1", "Meeting A", 10, "google")];
        let old = fingerprints(&old_events);
        let new = fingerprints(&new_events);
        assert!(events_changed(&old, &new));
    }

    #[test]
    fn empty_to_empty_is_not_changed() {
        let old: HashMap<String, EventFingerprint> = HashMap::new();
        let new: HashMap<String, EventFingerprint> = HashMap::new();
        assert!(!events_changed(&old, &new));
    }

    // --- SQLite cache tests ---

    #[tokio::test]
    async fn cache_round_trip_in_memory_sqlite() {
        // Set up an in-memory SQLite database with the schema
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");

        sqlx::query(
            "CREATE TABLE calendar_events (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                calendar_id TEXT,
                title TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_all_day INTEGER DEFAULT 0,
                ignored INTEGER DEFAULT 0,
                fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .expect("Failed to create table");

        let events = vec![
            make_event("evt-1", "Stand-up", 9, "google"),
            CalendarEvent {
                id: "evt-2".to_string(),
                title: "All Day".to_string(),
                start_time: Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap(),
                end_time: Utc.with_ymd_and_hms(2026, 2, 21, 0, 0, 0).unwrap(),
                ignored: true,
                calendar_id: Some("cal-work".to_string()),
                provider_id: "google".to_string(),
                is_all_day: true,
            },
        ];

        // Write to cache
        cache_events(&pool, &events)
            .await
            .expect("cache_events failed");

        // Read back — events are sorted by start_time, so the all-day event
        // (midnight) comes before the 9am event.
        let loaded = load_cached_events(&pool).await.expect("load failed");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "evt-2");
        assert_eq!(loaded[0].title, "All Day");
        assert!(loaded[0].is_all_day);
        assert!(loaded[0].ignored);
        assert_eq!(loaded[0].calendar_id, Some("cal-work".to_string()));

        assert_eq!(loaded[1].id, "evt-1");
        assert_eq!(loaded[1].title, "Stand-up");
        assert!(!loaded[1].is_all_day);
        assert!(!loaded[1].ignored);
    }

    #[tokio::test]
    async fn cache_replaces_old_events() {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");

        sqlx::query(
            "CREATE TABLE calendar_events (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                calendar_id TEXT,
                title TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_all_day INTEGER DEFAULT 0,
                ignored INTEGER DEFAULT 0,
                fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .expect("Failed to create table");

        // First write
        let events_v1 = vec![make_event("1", "Old Meeting", 10, "google")];
        cache_events(&pool, &events_v1).await.unwrap();

        // Second write replaces everything
        let events_v2 = vec![
            make_event("2", "New Meeting A", 11, "google"),
            make_event("3", "New Meeting B", 15, "google"),
        ];
        cache_events(&pool, &events_v2).await.unwrap();

        let loaded = load_cached_events(&pool).await.unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "2");
        assert_eq!(loaded[1].id, "3");
    }

    #[tokio::test]
    async fn load_empty_cache_returns_empty_vec() {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");

        sqlx::query(
            "CREATE TABLE calendar_events (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                calendar_id TEXT,
                title TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_all_day INTEGER DEFAULT 0,
                ignored INTEGER DEFAULT 0,
                fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .expect("Failed to create table");

        let loaded = load_cached_events(&pool).await.unwrap();
        assert!(loaded.is_empty());
    }
}

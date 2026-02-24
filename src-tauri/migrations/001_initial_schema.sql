-- User preferences (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cached calendar events (survives network outages)
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  calendar_id TEXT,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_all_day INTEGER DEFAULT 0,
  ignored INTEGER DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected calendar accounts (tokens in OS keychain, NOT here)
CREATE TABLE IF NOT EXISTS calendar_providers (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  account_name TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at TEXT,
  status TEXT NOT NULL DEFAULT 'connected'
);

-- Timer state (persists across restarts)
CREATE TABLE IF NOT EXISTS timer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  duration_seconds INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  paused_at TEXT,
  elapsed_before_pause INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);

-- Default settings (INSERT OR IGNORE preserves user changes on re-run)
INSERT OR IGNORE INTO settings (key, value) VALUES ('border_thickness', 'medium');
INSERT OR IGNORE INTO settings (key, value) VALUES ('border_position', 'all');
INSERT OR IGNORE INTO settings (key, value) VALUES ('color_palette', 'ambient');
INSERT OR IGNORE INTO settings (key, value) VALUES ('color_intensity', 'normal');
INSERT OR IGNORE INTO settings (key, value) VALUES ('warning_30min', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('warning_15min', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('warning_5min', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('warning_2min', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_interval_seconds', '60');
INSERT OR IGNORE INTO settings (key, value) VALUES ('launch_at_login', 'false');

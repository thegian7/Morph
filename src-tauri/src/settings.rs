use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use tauri::command;
use tauri_plugin_sql::DbInstances;

const DB_URL: &str = "sqlite:lighttime.db";

/// Default settings applied on first run.
const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("border_thickness", "medium"),
    ("border_position", "all"),
    ("color_palette", "ambient"),
    ("color_intensity", "normal"),
    ("warning_30min", "true"),
    ("warning_15min", "true"),
    ("warning_5min", "true"),
    ("warning_2min", "true"),
    ("poll_interval_seconds", "60"),
    ("launch_at_login", "false"),
    ("selected_display", "primary"),
];

/// Helper to get the SQLite pool from the plugin's managed state.
async fn get_pool(
    db_instances: &tauri::State<'_, DbInstances>,
) -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    let instances = db_instances.0.read().await;
    let pool = instances
        .get(DB_URL)
        .ok_or_else(|| format!("Database '{}' not loaded", DB_URL))?;
    match pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err("Expected SQLite database".to_string()),
    }
}

// --- Pool-based inner functions (testable without Tauri runtime) ---

async fn get_setting_inner(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.get("value")))
}

async fn set_setting_inner(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_all_settings_inner(pool: &SqlitePool) -> Result<Vec<(String, String)>, String> {
    let rows = sqlx::query("SELECT key, value FROM settings ORDER BY key")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| (r.get("key"), r.get("value"))).collect())
}

async fn seed_defaults_inner(pool: &SqlitePool) -> Result<(), String> {
    for (key, value) in DEFAULT_SETTINGS {
        sqlx::query(
            "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Tauri commands (delegate to inner functions) ---

/// Read a single setting by key. Returns `None` if the key does not exist.
#[command]
pub async fn get_setting(
    db_instances: tauri::State<'_, DbInstances>,
    key: String,
) -> Result<Option<String>, String> {
    let pool = get_pool(&db_instances).await?;
    get_setting_inner(&pool, &key).await
}

/// Insert or update a setting. Emits a `settings-changed` event so the
/// overlay can react to changes in real time.
#[command]
pub async fn set_setting(
    app: tauri::AppHandle,
    db_instances: tauri::State<'_, DbInstances>,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances).await?;
    set_setting_inner(&pool, &key, &value).await?;

    // Notify all windows (overlay + settings) about the change
    use tauri::Emitter;
    let _ = app.emit(
        "settings-changed",
        serde_json::json!({ "key": key, "value": value }),
    );

    Ok(())
}

/// Return all settings as a list of (key, value) pairs.
#[command]
pub async fn get_all_settings(
    db_instances: tauri::State<'_, DbInstances>,
) -> Result<Vec<(String, String)>, String> {
    let pool = get_pool(&db_instances).await?;
    get_all_settings_inner(&pool).await
}

/// Seed default settings. Only inserts rows that do not already exist.
pub async fn seed_defaults(db_instances: &tauri::State<'_, DbInstances>) -> Result<(), String> {
    let pool = get_pool(db_instances).await?;
    seed_defaults_inner(&pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create an in-memory SQLite pool with the settings table schema.
    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");
        sqlx::query(
            "CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await
        .expect("Failed to create settings table");
        pool
    }

    #[tokio::test]
    async fn test_seed_defaults_populates_expected_keys() {
        let pool = test_pool().await;
        seed_defaults_inner(&pool).await.expect("seed_defaults failed");

        let all = get_all_settings_inner(&pool).await.expect("get_all failed");
        let keys: Vec<&str> = all.iter().map(|(k, _)| k.as_str()).collect();

        for (expected_key, expected_value) in DEFAULT_SETTINGS {
            assert!(
                keys.contains(expected_key),
                "Missing default key: {expected_key}"
            );
            let actual = all.iter().find(|(k, _)| k == expected_key).unwrap();
            assert_eq!(
                actual.1, *expected_value,
                "Wrong default value for {expected_key}"
            );
        }
    }

    #[tokio::test]
    async fn test_get_set_round_trip() {
        let pool = test_pool().await;
        set_setting_inner(&pool, "theme", "dark").await.unwrap();

        let val = get_setting_inner(&pool, "theme").await.unwrap();
        assert_eq!(val, Some("dark".to_string()));
    }

    #[tokio::test]
    async fn test_get_nonexistent_key() {
        let pool = test_pool().await;
        let val = get_setting_inner(&pool, "no_such_key").await.unwrap();
        assert_eq!(val, None);
    }

    #[tokio::test]
    async fn test_get_all_settings() {
        let pool = test_pool().await;
        seed_defaults_inner(&pool).await.unwrap();

        let all = get_all_settings_inner(&pool).await.unwrap();
        assert_eq!(all.len(), DEFAULT_SETTINGS.len());
    }

    #[tokio::test]
    async fn test_set_upserts() {
        let pool = test_pool().await;
        set_setting_inner(&pool, "color", "red").await.unwrap();
        set_setting_inner(&pool, "color", "blue").await.unwrap();

        let val = get_setting_inner(&pool, "color").await.unwrap();
        assert_eq!(val, Some("blue".to_string()));
    }
}

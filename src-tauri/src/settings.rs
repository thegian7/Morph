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

/// Read a single setting by key. Returns `None` if the key does not exist.
#[command]
pub async fn get_setting(
    db_instances: tauri::State<'_, DbInstances>,
    key: String,
) -> Result<Option<String>, String> {
    let pool = get_pool(&db_instances).await?;
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?1")
        .bind(&key)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.get("value")))
}

/// Insert or update a setting.
#[command]
pub async fn set_setting(
    db_instances: tauri::State<'_, DbInstances>,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances).await?;
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(&key)
    .bind(&value)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Return all settings as a list of (key, value) pairs.
#[command]
pub async fn get_all_settings(
    db_instances: tauri::State<'_, DbInstances>,
) -> Result<Vec<(String, String)>, String> {
    let pool = get_pool(&db_instances).await?;
    let rows = sqlx::query("SELECT key, value FROM settings ORDER BY key")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| (r.get("key"), r.get("value"))).collect())
}

/// Seed default settings. Only inserts rows that do not already exist.
pub async fn seed_defaults(db_instances: &tauri::State<'_, DbInstances>) -> Result<(), String> {
    let pool = get_pool(db_instances).await?;
    for (key, value) in DEFAULT_SETTINGS {
        sqlx::query(
            "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        )
        .bind(key)
        .bind(value)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

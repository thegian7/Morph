mod calendar;
mod keychain;
mod oauth;

use chrono::{Duration, Utc};

/// The Google OAuth client ID. In a real app this would come from config/env.
/// For this spike, set the GOOGLE_CLIENT_ID env var before building,
/// or replace this placeholder.
fn get_client_id() -> String {
    std::env::var("GOOGLE_CLIENT_ID")
        .unwrap_or_else(|_| "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com".to_string())
}

/// Start the Google OAuth2 PKCE flow: open browser + listen for callback
#[tauri::command]
async fn start_auth() -> Result<String, String> {
    let client_id = get_client_id();

    // Build auth URL and open in system browser
    let auth_url = oauth::build_auth_url(&client_id);
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    // Listen for the callback on a background thread (tiny_http is blocking)
    let code = tokio::task::spawn_blocking(oauth::listen_for_callback)
        .await
        .map_err(|e| format!("Callback listener task failed: {e}"))??;

    // Exchange code for tokens
    let tokens = oauth::exchange_code(&client_id, &code).await?;

    // Store tokens in keychain
    keychain::store_access_token(&tokens.access_token)?;
    if let Some(ref refresh) = tokens.refresh_token {
        keychain::store_refresh_token(refresh)?;
    }

    // Calculate and store expiry time
    let expiry = Utc::now() + Duration::seconds(tokens.expires_in as i64);
    keychain::store_expiry(&expiry.to_rfc3339())?;

    log::info!(
        "OAuth complete. Token expires at {}. Refresh token: {}",
        expiry,
        if tokens.refresh_token.is_some() {
            "present"
        } else {
            "none"
        }
    );

    Ok("Authorization successful!".to_string())
}

/// Ensure we have a valid access token, refreshing if needed
async fn ensure_valid_token() -> Result<String, String> {
    let access_token = keychain::get_access_token()?
        .ok_or_else(|| "Not authenticated — please connect first".to_string())?;

    // Check if token is expired
    if let Some(expiry_str) = keychain::get_expiry()? {
        if let Ok(expiry) = chrono::DateTime::parse_from_rfc3339(&expiry_str) {
            if Utc::now() >= expiry.with_timezone(&Utc) {
                log::info!("Access token expired, attempting refresh...");
                return refresh_token_internal().await;
            }
        }
    }

    Ok(access_token)
}

/// Internal helper to refresh the access token
async fn refresh_token_internal() -> Result<String, String> {
    let client_id = get_client_id();
    let refresh_token = keychain::get_refresh_token()?
        .ok_or_else(|| "No refresh token available — please re-authenticate".to_string())?;

    let tokens = oauth::refresh_access_token(&client_id, &refresh_token).await?;

    keychain::store_access_token(&tokens.access_token)?;
    if let Some(ref new_refresh) = tokens.refresh_token {
        keychain::store_refresh_token(new_refresh)?;
    }

    let expiry = Utc::now() + Duration::seconds(tokens.expires_in as i64);
    keychain::store_expiry(&expiry.to_rfc3339())?;

    log::info!("Token refreshed. New expiry: {expiry}");

    Ok(tokens.access_token)
}

/// Fetch upcoming calendar events (next 24 hours)
#[tauri::command]
async fn fetch_events() -> Result<Vec<calendar::CalendarEvent>, String> {
    let access_token = ensure_valid_token().await?;

    match calendar::fetch_upcoming_events(&access_token).await {
        Ok(events) => Ok(events),
        Err(e) if e == "TOKEN_EXPIRED" => {
            // Token was actually expired despite our check — try refresh
            log::info!("Got 401, refreshing token...");
            let new_token = refresh_token_internal().await?;
            calendar::fetch_upcoming_events(&new_token).await
        }
        Err(e) => Err(e),
    }
}

/// Check if we have stored credentials
#[tauri::command]
fn check_auth_status() -> Result<bool, String> {
    let has_token = keychain::get_access_token()?.is_some();
    Ok(has_token)
}

/// Force a token refresh (for testing)
#[tauri::command]
async fn force_refresh() -> Result<String, String> {
    refresh_token_internal().await?;
    Ok("Token refreshed successfully".to_string())
}

/// Disconnect (clear stored tokens)
#[tauri::command]
fn disconnect() -> Result<String, String> {
    keychain::clear_tokens()?;
    Ok("Disconnected".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_auth,
            fetch_events,
            check_auth_status,
            force_refresh,
            disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

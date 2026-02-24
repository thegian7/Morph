use keyring::Entry;

const SERVICE_NAME: &str = "com.morph.google-oauth";

/// Store a value in the OS keychain
fn set_entry(key: &str, value: &str) -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain entry error: {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keychain set error: {e}"))
}

/// Retrieve a value from the OS keychain
fn get_entry(key: &str) -> Result<Option<String>, String> {
    let entry =
        Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain entry error: {e}"))?;
    match entry.get_password() {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keychain get error: {e}")),
    }
}

/// Delete a value from the OS keychain
fn delete_entry(key: &str) -> Result<(), String> {
    let entry =
        Entry::new(SERVICE_NAME, key).map_err(|e| format!("Keychain entry error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already gone
        Err(e) => Err(format!("Keychain delete error: {e}")),
    }
}

/// Store the access token
pub fn store_access_token(token: &str) -> Result<(), String> {
    set_entry("access_token", token)
}

/// Store the refresh token
pub fn store_refresh_token(token: &str) -> Result<(), String> {
    set_entry("refresh_token", token)
}

/// Store the token expiry time as an ISO 8601 string
pub fn store_expiry(expiry: &str) -> Result<(), String> {
    set_entry("token_expiry", expiry)
}

/// Get the stored access token
pub fn get_access_token() -> Result<Option<String>, String> {
    get_entry("access_token")
}

/// Get the stored refresh token
pub fn get_refresh_token() -> Result<Option<String>, String> {
    get_entry("refresh_token")
}

/// Get the stored token expiry time
pub fn get_expiry() -> Result<Option<String>, String> {
    get_entry("token_expiry")
}

/// Clear all stored tokens (for disconnect/logout)
pub fn clear_tokens() -> Result<(), String> {
    delete_entry("access_token")?;
    delete_entry("refresh_token")?;
    delete_entry("token_expiry")?;
    Ok(())
}

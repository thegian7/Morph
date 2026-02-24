use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use url::Url;

/// Google OAuth2 constants
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPES: &str = "https://www.googleapis.com/auth/calendar.readonly";
const REDIRECT_PORT: u16 = 19847;

/// In-memory store for the PKCE code verifier (needed between auth start and token exchange)
static CODE_VERIFIER: Mutex<Option<String>> = Mutex::new(None);

fn redirect_uri() -> String {
    format!("http://127.0.0.1:{REDIRECT_PORT}/callback")
}

/// Generate a random code verifier for PKCE (43-128 chars, URL-safe)
fn generate_code_verifier() -> String {
    let random_bytes: Vec<u8> = (0..32).map(|_| rand::rng().random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&random_bytes)
}

/// Derive the code challenge from the verifier (S256 method)
fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// Build the Google OAuth2 authorization URL with PKCE
pub fn build_auth_url(client_id: &str) -> String {
    let verifier = generate_code_verifier();
    let challenge = code_challenge(&verifier);

    // Store verifier for later token exchange
    *CODE_VERIFIER.lock().unwrap() = Some(verifier);

    let mut url = Url::parse(AUTH_URL).unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri())
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");

    url.to_string()
}

/// Start a temporary localhost HTTP server, wait for the OAuth callback,
/// and return the authorization code.
pub fn listen_for_callback() -> Result<String, String> {
    let addr = format!("127.0.0.1:{REDIRECT_PORT}");
    let server =
        tiny_http::Server::http(&addr).map_err(|e| format!("Failed to start server: {e}"))?;

    log::info!("Listening for OAuth callback on {addr}");

    // Wait for a single request (with a 120-second timeout)
    let request = server
        .recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|e| format!("Server error: {e}"))?
        .ok_or_else(|| "Timeout waiting for OAuth callback".to_string())?;

    let url_str = format!("http://localhost{}", request.url());
    let parsed = Url::parse(&url_str).map_err(|e| format!("Failed to parse callback URL: {e}"))?;

    // Check for error (user denied consent)
    if let Some(error) = parsed.query_pairs().find(|(k, _)| k == "error") {
        let html = format!(
            "<html><body><h2>Authorization failed</h2><p>{}</p><p>You can close this tab.</p></body></html>",
            error.1
        );
        let response = tiny_http::Response::from_string(html)
            .with_header("Content-Type: text/html".parse::<tiny_http::Header>().unwrap());
        let _ = request.respond(response);
        return Err(format!("User denied consent: {}", error.1));
    }

    // Extract the authorization code
    let code = parsed
        .query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .ok_or_else(|| "No authorization code in callback".to_string())?;

    // Send a success page back to the browser
    let html = "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to Morph.</p></body></html>";
    let response = tiny_http::Response::from_string(html)
        .with_header("Content-Type: text/html".parse::<tiny_http::Header>().unwrap());
    let _ = request.respond(response);

    Ok(code)
}

/// Token response from Google
#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
    pub scope: Option<String>,
}

/// Exchange the authorization code for access + refresh tokens
pub async fn exchange_code(client_id: &str, code: &str) -> Result<TokenResponse, String> {
    let verifier = CODE_VERIFIER
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "No code verifier found — did you start the auth flow?".to_string())?;

    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", &verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri()),
    ];

    let resp = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Token exchange failed: {body}"));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))
}

/// Refresh an expired access token using the refresh token
pub async fn refresh_access_token(
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Token refresh failed: {body}"));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))
}

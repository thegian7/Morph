use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::Url;

use super::error::CalendarError;
use super::provider::CalendarProvider;
use super::types::{CalendarEvent, ProviderType};

const MS_CLIENT_ID: &str = "PLACEHOLDER_AZURE_CLIENT_ID";
const AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const CALENDAR_VIEW_URL: &str = "https://graph.microsoft.com/v1.0/me/calendarView";
const REDIRECT_PORT_START: u16 = 19857;
const REDIRECT_PORT_END: u16 = 19867;
const SCOPES: &str = "Calendars.Read offline_access";
const KEYRING_SERVICE: &str = "com.morph.microsoft-oauth";

/// Microsoft Graph Calendar provider using OAuth2 PKCE.
pub struct MicrosoftCalendarProvider {
    client_id: String,
    account_email: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expiry: Option<DateTime<Utc>>,
    http_client: Client,
}

// --- MS Graph API response types ---

#[derive(Debug, Deserialize)]
struct MsCalendarViewResponse {
    value: Vec<MsEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MsEvent {
    id: Option<String>,
    subject: Option<String>,
    start: Option<MsDateTimeZone>,
    end: Option<MsDateTimeZone>,
    is_all_day: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MsDateTimeZone {
    date_time: Option<String>,
    #[allow(dead_code)]
    time_zone: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    id_token: Option<String>,
}

// --- JWT payload for extracting email ---

#[derive(Debug, Deserialize)]
struct IdTokenClaims {
    preferred_username: Option<String>,
    email: Option<String>,
}

impl Default for MicrosoftCalendarProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl MicrosoftCalendarProvider {
    pub fn new() -> Self {
        Self {
            client_id: MS_CLIENT_ID.to_string(),
            account_email: None,
            access_token: None,
            refresh_token: None,
            token_expiry: None,
            http_client: Client::new(),
        }
    }

    /// Try to load tokens from the system keyring on startup.
    pub fn load_stored_tokens(&mut self) -> Result<(), CalendarError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, "refresh_token").map_err(|e| {
            CalendarError::ProviderError {
                provider: "microsoft".into(),
                message: format!("keyring error: {e}"),
            }
        })?;

        match entry.get_password() {
            Ok(token) => {
                self.refresh_token = Some(token);
                // Also try to load email
                if let Ok(email_entry) = keyring::Entry::new(KEYRING_SERVICE, "account_email") {
                    if let Ok(email) = email_entry.get_password() {
                        self.account_email = Some(email);
                    }
                }
                Ok(())
            }
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CalendarError::ProviderError {
                provider: "microsoft".into(),
                message: format!("keyring error: {e}"),
            }),
        }
    }

    /// Store tokens in the system keyring.
    fn store_tokens(&self) -> Result<(), CalendarError> {
        if let Some(ref rt) = self.refresh_token {
            let entry = keyring::Entry::new(KEYRING_SERVICE, "refresh_token").map_err(|e| {
                CalendarError::ProviderError {
                    provider: "microsoft".into(),
                    message: format!("keyring error: {e}"),
                }
            })?;
            entry
                .set_password(rt)
                .map_err(|e| CalendarError::ProviderError {
                    provider: "microsoft".into(),
                    message: format!("keyring store error: {e}"),
                })?;
        }

        if let Some(ref email) = self.account_email {
            let entry = keyring::Entry::new(KEYRING_SERVICE, "account_email").map_err(|e| {
                CalendarError::ProviderError {
                    provider: "microsoft".into(),
                    message: format!("keyring error: {e}"),
                }
            })?;
            entry
                .set_password(email)
                .map_err(|e| CalendarError::ProviderError {
                    provider: "microsoft".into(),
                    message: format!("keyring store error: {e}"),
                })?;
        }

        Ok(())
    }

    /// Generate a PKCE code verifier (43-128 URL-safe characters).
    fn generate_code_verifier() -> String {
        let mut rng = rand::rng();
        let bytes: Vec<u8> = (0..32).map(|_| rng.random::<u8>()).collect();
        URL_SAFE_NO_PAD.encode(&bytes)
    }

    /// Generate a PKCE code challenge from the verifier (S256).
    fn generate_code_challenge(verifier: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let hash = hasher.finalize();
        URL_SAFE_NO_PAD.encode(hash)
    }

    /// Build the Microsoft authorization URL.
    fn build_auth_url(
        client_id: &str,
        redirect_uri: &str,
        code_challenge: &str,
        state: &str,
    ) -> String {
        let mut url = Url::parse(AUTH_URL).expect("valid auth URL constant");
        url.query_pairs_mut()
            .append_pair("client_id", client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("scope", SCOPES)
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", code_challenge)
            .append_pair("state", state)
            .append_pair("response_mode", "query");
        url.to_string()
    }

    /// Start a temporary HTTP server on a port in the redirect range,
    /// open the browser for auth, and wait for the callback.
    async fn run_oauth_flow(&mut self) -> Result<(), CalendarError> {
        let code_verifier = Self::generate_code_verifier();
        let code_challenge = Self::generate_code_challenge(&code_verifier);
        let state: String = URL_SAFE_NO_PAD.encode(rand::rng().random::<[u8; 16]>());

        // Find an available port in the redirect range
        let (server, port) = Self::start_redirect_server()?;
        let redirect_uri = format!("http://localhost:{port}");

        let auth_url =
            Self::build_auth_url(&self.client_id, &redirect_uri, &code_challenge, &state);

        // Open browser
        open::that(&auth_url).map_err(|e| {
            CalendarError::AuthenticationFailed(format!("failed to open browser: {e}"))
        })?;

        // Wait for the OAuth callback (blocking on the tiny_http server)
        let auth_code =
            tokio::task::spawn_blocking(move || Self::wait_for_callback(&server, &state))
                .await
                .map_err(|e| {
                    CalendarError::AuthenticationFailed(format!("callback task failed: {e}"))
                })??;

        // Exchange authorization code for tokens
        self.exchange_code(&auth_code, &code_verifier, &redirect_uri)
            .await?;

        Ok(())
    }

    /// Try to bind a tiny_http server on one of the ports in the redirect range.
    fn start_redirect_server() -> Result<(tiny_http::Server, u16), CalendarError> {
        for port in REDIRECT_PORT_START..=REDIRECT_PORT_END {
            if let Ok(server) = tiny_http::Server::http(format!("127.0.0.1:{port}")) {
                return Ok((server, port));
            }
        }
        Err(CalendarError::AuthenticationFailed(
            "could not bind to any port in redirect range 19857-19867".into(),
        ))
    }

    /// Wait for the OAuth redirect callback, extract the authorization code.
    fn wait_for_callback(
        server: &tiny_http::Server,
        expected_state: &str,
    ) -> Result<String, CalendarError> {
        // Wait up to 120 seconds for the callback
        let request = server
            .recv_timeout(std::time::Duration::from_secs(120))
            .map_err(|e| CalendarError::AuthenticationFailed(format!("server error: {e}")))?
            .ok_or_else(|| {
                CalendarError::AuthenticationFailed("timed out waiting for OAuth callback".into())
            })?;

        let url_str = format!("http://localhost{}", request.url());
        let url = Url::parse(&url_str).map_err(|e| {
            CalendarError::AuthenticationFailed(format!("invalid callback URL: {e}"))
        })?;

        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();

        // Check for errors from the identity provider
        if let Some(error) = pairs.get("error") {
            let desc = pairs.get("error_description").cloned().unwrap_or_default();
            let response =
                tiny_http::Response::from_string("Authentication failed. You can close this tab.");
            let _ = request.respond(response);
            return Err(CalendarError::AuthenticationFailed(format!(
                "{error}: {desc}"
            )));
        }

        // Validate state
        let returned_state = pairs
            .get("state")
            .ok_or_else(|| CalendarError::AuthenticationFailed("missing state parameter".into()))?;
        if returned_state != expected_state {
            let response = tiny_http::Response::from_string(
                "Authentication failed (state mismatch). You can close this tab.",
            );
            let _ = request.respond(response);
            return Err(CalendarError::AuthenticationFailed(
                "state parameter mismatch".into(),
            ));
        }

        let code = pairs
            .get("code")
            .ok_or_else(|| {
                CalendarError::AuthenticationFailed("missing authorization code in callback".into())
            })?
            .clone();

        let response =
            tiny_http::Response::from_string("Authentication successful! You can close this tab.");
        let _ = request.respond(response);

        Ok(code)
    }

    /// Exchange the authorization code for access and refresh tokens.
    async fn exchange_code(
        &mut self,
        code: &str,
        code_verifier: &str,
        redirect_uri: &str,
    ) -> Result<(), CalendarError> {
        let params = [
            ("client_id", self.client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
            ("scope", SCOPES),
        ];

        let resp = self
            .http_client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                CalendarError::AuthenticationFailed(format!("token request failed: {e}"))
            })?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(CalendarError::AuthenticationFailed(format!(
                "token exchange failed: {body}"
            )));
        }

        let token_resp: TokenResponse = resp.json().await.map_err(|e| {
            CalendarError::AuthenticationFailed(format!("failed to parse token response: {e}"))
        })?;

        self.access_token = Some(token_resp.access_token);
        self.refresh_token = token_resp.refresh_token.or(self.refresh_token.take());
        self.token_expiry = token_resp
            .expires_in
            .map(|secs| Utc::now() + Duration::seconds(secs as i64));

        // Extract email from id_token if present
        if let Some(ref id_token) = token_resp.id_token {
            if let Some(email) = Self::extract_email_from_id_token(id_token) {
                self.account_email = Some(email);
            }
        }

        self.store_tokens()?;

        Ok(())
    }

    /// Decode the JWT id_token payload (without signature verification) to
    /// extract the user's email.
    fn extract_email_from_id_token(id_token: &str) -> Option<String> {
        let parts: Vec<&str> = id_token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }

        let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
        let claims: IdTokenClaims = serde_json::from_slice(&payload_bytes).ok()?;

        claims.preferred_username.or(claims.email)
    }

    /// Returns true if a refresh token is available (loaded from keyring or from OAuth flow).
    pub fn has_refresh_token(&self) -> bool {
        self.refresh_token.is_some()
    }

    /// Check if the access token is expired or about to expire (within 60s).
    #[allow(dead_code)] // Used in tests and will be called by the poller
    fn is_token_expired(&self) -> bool {
        match self.token_expiry {
            Some(expiry) => Utc::now() + Duration::seconds(60) >= expiry,
            None => true,
        }
    }
}

#[async_trait]
impl CalendarProvider for MicrosoftCalendarProvider {
    async fn authenticate(&mut self) -> Result<(), CalendarError> {
        if self.client_id == "PLACEHOLDER_AZURE_CLIENT_ID" {
            return Err(CalendarError::AuthenticationFailed(
                "Microsoft Calendar is not configured. An Azure app registration \
                 with a valid client ID is required."
                    .to_string(),
            ));
        }
        self.run_oauth_flow().await
    }

    async fn fetch_events(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarError> {
        let access_token = self
            .access_token
            .as_ref()
            .ok_or(CalendarError::NotAuthenticated)?;

        let provider_id = self.provider_id().to_string();

        let resp = self
            .http_client
            .get(CALENDAR_VIEW_URL)
            .bearer_auth(access_token)
            .query(&[
                ("startDateTime", from.to_rfc3339()),
                ("endDateTime", to.to_rfc3339()),
                ("$select", "id,subject,start,end,isAllDay".to_string()),
                ("$orderby", "start/dateTime".to_string()),
                ("$top", "250".to_string()),
            ])
            .send()
            .await
            .map_err(|e| CalendarError::NetworkError(format!("MS Graph request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(CalendarError::FetchFailed(format!(
                "MS Graph API error {status}: {body}"
            )));
        }

        let calendar_resp: MsCalendarViewResponse = resp.json().await.map_err(|e| {
            CalendarError::DeserializationError(format!("failed to parse MS Graph response: {e}"))
        })?;

        let events = calendar_resp
            .value
            .into_iter()
            .filter_map(|ms_event| convert_ms_event(ms_event, &provider_id))
            .collect();

        Ok(events)
    }

    async fn refresh_token(&mut self) -> Result<(), CalendarError> {
        let refresh_token = self
            .refresh_token
            .as_ref()
            .ok_or(CalendarError::NotAuthenticated)?
            .clone();

        let params = [
            ("client_id", self.client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("scope", SCOPES),
        ];

        let resp = self
            .http_client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                CalendarError::TokenRefreshFailed(format!("refresh request failed: {e}"))
            })?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(CalendarError::TokenRefreshFailed(format!(
                "token refresh failed: {body}"
            )));
        }

        let token_resp: TokenResponse = resp.json().await.map_err(|e| {
            CalendarError::TokenRefreshFailed(format!("failed to parse refresh response: {e}"))
        })?;

        self.access_token = Some(token_resp.access_token);
        if let Some(new_rt) = token_resp.refresh_token {
            self.refresh_token = Some(new_rt);
        }
        self.token_expiry = token_resp
            .expires_in
            .map(|secs| Utc::now() + Duration::seconds(secs as i64));

        self.store_tokens()?;

        Ok(())
    }

    fn provider_id(&self) -> &str {
        match &self.account_email {
            Some(email) => email.as_str(),
            None => "microsoft-unknown",
        }
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::Microsoft
    }

    fn account_name(&self) -> &str {
        match &self.account_email {
            Some(email) => email.as_str(),
            None => "Microsoft Account",
        }
    }
}

/// Convert a Microsoft Graph event to our CalendarEvent type.
fn convert_ms_event(ms_event: MsEvent, provider_id: &str) -> Option<CalendarEvent> {
    let id = ms_event.id.unwrap_or_default();
    let title = ms_event
        .subject
        .unwrap_or_else(|| "(No Subject)".to_string());

    let start_str = ms_event.start?.date_time?;
    let end_str = ms_event.end?.date_time?;

    // MS Graph returns dateTime without timezone suffix for calendar events;
    // append Z to parse as UTC (the timeZone field tells us the original zone,
    // but we normalize everything to UTC).
    let start_time = parse_ms_datetime(&start_str)?;
    let end_time = parse_ms_datetime(&end_str)?;

    let is_all_day = ms_event.is_all_day.unwrap_or(false);

    Some(CalendarEvent {
        id,
        title,
        start_time,
        end_time,
        ignored: false,
        calendar_id: None,
        provider_id: provider_id.to_string(),
        is_all_day,
    })
}

/// Parse a datetime string from MS Graph. The API returns values like
/// "2026-02-20T10:00:00.0000000" without a timezone suffix.
fn parse_ms_datetime(s: &str) -> Option<DateTime<Utc>> {
    // Try parsing with Z suffix first (already UTC-tagged)
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }

    // MS Graph format: "2026-02-20T10:00:00.0000000"
    // Try appending Z
    let with_z = format!("{s}Z");
    if let Ok(dt) = DateTime::parse_from_rfc3339(&with_z) {
        return Some(dt.with_timezone(&Utc));
    }

    // Try NaiveDateTime as fallback
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(naive.and_utc());
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Some(naive.and_utc());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_generate_code_verifier_length() {
        let verifier = MicrosoftCalendarProvider::generate_code_verifier();
        assert!(verifier.len() >= 43, "verifier should be at least 43 chars");
        assert!(
            verifier.len() <= 128,
            "verifier should be at most 128 chars"
        );
    }

    #[test]
    fn test_code_challenge_is_s256() {
        let verifier = "test-verifier-string-for-pkce";
        let challenge = MicrosoftCalendarProvider::generate_code_challenge(verifier);

        // Verify it's a base64url-encoded SHA256 hash
        let decoded = URL_SAFE_NO_PAD.decode(&challenge).expect("valid base64url");
        assert_eq!(decoded.len(), 32, "SHA256 hash should be 32 bytes");

        // Same input should produce same output
        let challenge2 = MicrosoftCalendarProvider::generate_code_challenge(verifier);
        assert_eq!(challenge, challenge2);
    }

    #[test]
    fn test_build_auth_url() {
        let url_str = MicrosoftCalendarProvider::build_auth_url(
            "test-client-id",
            "http://localhost:19857",
            "test-challenge",
            "test-state",
        );

        let url = Url::parse(&url_str).expect("valid URL");
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("login.microsoftonline.com"));
        assert!(url.path().contains("/common/oauth2/v2.0/authorize"));

        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("client_id").unwrap(), "test-client-id");
        assert_eq!(pairs.get("response_type").unwrap(), "code");
        assert_eq!(pairs.get("redirect_uri").unwrap(), "http://localhost:19857");
        assert_eq!(pairs.get("scope").unwrap(), "Calendars.Read offline_access");
        assert_eq!(pairs.get("code_challenge_method").unwrap(), "S256");
        assert_eq!(pairs.get("code_challenge").unwrap(), "test-challenge");
        assert_eq!(pairs.get("state").unwrap(), "test-state");
        assert_eq!(pairs.get("response_mode").unwrap(), "query");
    }

    #[test]
    fn test_extract_email_from_id_token() {
        // Build a fake JWT with a payload containing preferred_username
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload = serde_json::json!({
            "preferred_username": "user@outlook.com",
            "email": "user@example.com"
        });
        let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let signature = URL_SAFE_NO_PAD.encode(b"fake-sig");

        let token = format!("{header}.{payload_b64}.{signature}");
        let email = MicrosoftCalendarProvider::extract_email_from_id_token(&token);
        assert_eq!(email, Some("user@outlook.com".to_string()));
    }

    #[test]
    fn test_extract_email_falls_back_to_email_claim() {
        let header = URL_SAFE_NO_PAD.encode(b"{}");
        let payload = serde_json::json!({
            "email": "fallback@example.com"
        });
        let payload_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let signature = URL_SAFE_NO_PAD.encode(b"fake-sig");

        let token = format!("{header}.{payload_b64}.{signature}");
        let email = MicrosoftCalendarProvider::extract_email_from_id_token(&token);
        assert_eq!(email, Some("fallback@example.com".to_string()));
    }

    #[test]
    fn test_extract_email_returns_none_for_invalid_token() {
        assert_eq!(
            MicrosoftCalendarProvider::extract_email_from_id_token("not-a-jwt"),
            None
        );
        assert_eq!(
            MicrosoftCalendarProvider::extract_email_from_id_token("a.b"),
            None
        );
        assert_eq!(
            MicrosoftCalendarProvider::extract_email_from_id_token(""),
            None
        );
    }

    #[test]
    fn test_convert_ms_event_basic() {
        let ms_event = MsEvent {
            id: Some("event-123".to_string()),
            subject: Some("Team Standup".to_string()),
            start: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T10:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            end: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T10:30:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            is_all_day: Some(false),
        };

        let event = convert_ms_event(ms_event, "ms-user@outlook.com").unwrap();
        assert_eq!(event.id, "event-123");
        assert_eq!(event.title, "Team Standup");
        assert_eq!(
            event.start_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap()
        );
        assert_eq!(
            event.end_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 10, 30, 0).unwrap()
        );
        assert!(!event.is_all_day);
        assert!(!event.ignored);
        assert_eq!(event.provider_id, "ms-user@outlook.com");
    }

    #[test]
    fn test_convert_ms_event_all_day() {
        let ms_event = MsEvent {
            id: Some("all-day-1".to_string()),
            subject: Some("Holiday".to_string()),
            start: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T00:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            end: Some(MsDateTimeZone {
                date_time: Some("2026-02-21T00:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            is_all_day: Some(true),
        };

        let event = convert_ms_event(ms_event, "ms-user@outlook.com").unwrap();
        assert!(event.is_all_day);
        assert_eq!(event.title, "Holiday");
    }

    #[test]
    fn test_convert_ms_event_no_subject() {
        let ms_event = MsEvent {
            id: Some("no-subj".to_string()),
            subject: None,
            start: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T14:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            end: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T15:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            is_all_day: None,
        };

        let event = convert_ms_event(ms_event, "ms-user@outlook.com").unwrap();
        assert_eq!(event.title, "(No Subject)");
        assert!(!event.is_all_day);
    }

    #[test]
    fn test_convert_ms_event_missing_start_returns_none() {
        let ms_event = MsEvent {
            id: Some("bad-1".to_string()),
            subject: Some("Bad Event".to_string()),
            start: None,
            end: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T15:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            is_all_day: None,
        };

        assert!(convert_ms_event(ms_event, "provider").is_none());
    }

    #[test]
    fn test_convert_ms_event_missing_end_returns_none() {
        let ms_event = MsEvent {
            id: Some("bad-2".to_string()),
            subject: Some("Bad Event".to_string()),
            start: Some(MsDateTimeZone {
                date_time: Some("2026-02-20T14:00:00.0000000".to_string()),
                time_zone: Some("UTC".to_string()),
            }),
            end: None,
            is_all_day: None,
        };

        assert!(convert_ms_event(ms_event, "provider").is_none());
    }

    #[test]
    fn test_parse_ms_datetime_formats() {
        // With fractional seconds (MS Graph typical format)
        let dt = parse_ms_datetime("2026-02-20T10:00:00.0000000").unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap());

        // Without fractional seconds
        let dt = parse_ms_datetime("2026-02-20T10:00:00").unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap());

        // Already with Z suffix
        let dt = parse_ms_datetime("2026-02-20T10:00:00Z").unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap());

        // With offset
        let dt = parse_ms_datetime("2026-02-20T10:00:00+00:00").unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap());
    }

    #[test]
    fn test_parse_ms_datetime_invalid() {
        assert!(parse_ms_datetime("not-a-date").is_none());
        assert!(parse_ms_datetime("").is_none());
    }

    #[test]
    fn test_token_expiry_check() {
        let mut provider = MicrosoftCalendarProvider::new();

        // No expiry set - should be considered expired
        assert!(provider.is_token_expired());

        // Set expiry in the past
        provider.token_expiry = Some(Utc::now() - Duration::seconds(100));
        assert!(provider.is_token_expired());

        // Set expiry far in the future
        provider.token_expiry = Some(Utc::now() + Duration::seconds(3600));
        assert!(!provider.is_token_expired());

        // Set expiry within 60s buffer
        provider.token_expiry = Some(Utc::now() + Duration::seconds(30));
        assert!(provider.is_token_expired());
    }

    #[test]
    fn test_provider_type_is_microsoft() {
        let provider = MicrosoftCalendarProvider::new();
        assert_eq!(provider.provider_type(), ProviderType::Microsoft);
    }

    #[test]
    fn test_provider_id_without_email() {
        let provider = MicrosoftCalendarProvider::new();
        assert_eq!(provider.provider_id(), "microsoft-unknown");
        assert_eq!(provider.account_name(), "Microsoft Account");
    }

    #[test]
    fn test_provider_id_with_email() {
        let mut provider = MicrosoftCalendarProvider::new();
        provider.account_email = Some("user@outlook.com".to_string());
        assert_eq!(provider.provider_id(), "user@outlook.com");
        assert_eq!(provider.account_name(), "user@outlook.com");
    }

    #[test]
    fn test_mock_token_response_deserialization() {
        let json = r#"{
            "access_token": "eyJ0eXAi...",
            "refresh_token": "OAAABAAAAi...",
            "expires_in": 3600,
            "id_token": "eyJ0eXAi.eyJwcmVmZXJyZWRfdXNlcm5hbWUiOiJ1c2VyQG91dGxvb2suY29tIn0.sig"
        }"#;

        let resp: TokenResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.access_token, "eyJ0eXAi...");
        assert_eq!(resp.refresh_token, Some("OAAABAAAAi...".to_string()));
        assert_eq!(resp.expires_in, Some(3600));
        assert!(resp.id_token.is_some());
    }

    #[test]
    fn test_ms_calendar_view_response_deserialization() {
        let json = r#"{
            "value": [
                {
                    "id": "AAMkAGI2...",
                    "subject": "Team Meeting",
                    "start": {
                        "dateTime": "2026-02-20T14:00:00.0000000",
                        "timeZone": "UTC"
                    },
                    "end": {
                        "dateTime": "2026-02-20T15:00:00.0000000",
                        "timeZone": "UTC"
                    },
                    "isAllDay": false
                },
                {
                    "id": "AAMkAGI3...",
                    "subject": "Lunch Break",
                    "start": {
                        "dateTime": "2026-02-20T12:00:00.0000000",
                        "timeZone": "UTC"
                    },
                    "end": {
                        "dateTime": "2026-02-20T13:00:00.0000000",
                        "timeZone": "UTC"
                    },
                    "isAllDay": false
                }
            ]
        }"#;

        let resp: MsCalendarViewResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.value.len(), 2);

        let events: Vec<CalendarEvent> = resp
            .value
            .into_iter()
            .filter_map(|e| convert_ms_event(e, "ms-test"))
            .collect();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].title, "Team Meeting");
        assert_eq!(events[1].title, "Lunch Break");
        assert_eq!(
            events[0].start_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 14, 0, 0).unwrap()
        );
    }
}

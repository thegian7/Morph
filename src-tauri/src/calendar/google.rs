use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use rand::Rng;
use reqwest::Client;
use sha2::{Digest, Sha256};
use url::Url;

use super::error::CalendarError;
use super::provider::CalendarProvider;
use super::types::{CalendarEvent, ProviderType};

// --- Constants ---

const GOOGLE_CLIENT_ID: &str =
    "715902033958-u6sdotrtdf7tsv7sm4vshtvqus1tm7hs.apps.googleusercontent.com";

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
const CALENDAR_EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events.readonly \
                     https://www.googleapis.com/auth/userinfo.email";

const KEYRING_SERVICE: &str = "com.lighttime.google-oauth";

/// Port range to try for the localhost redirect server.
const PORT_RANGE_START: u16 = 19847;
const PORT_RANGE_END: u16 = 19857;

/// Timeout for the OAuth callback server (seconds).
const CALLBACK_TIMEOUT_SECS: u64 = 120;

// --- Google API response types ---

#[derive(Debug, serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    #[allow(dead_code)]
    token_type: String,
}

#[derive(Debug, serde::Deserialize)]
struct UserInfoResponse {
    email: String,
}

#[derive(Debug, serde::Deserialize)]
struct EventsListResponse {
    items: Option<Vec<GoogleEvent>>,
}

#[derive(Debug, serde::Deserialize)]
struct GoogleEvent {
    id: Option<String>,
    summary: Option<String>,
    start: Option<EventDateTime>,
    end: Option<EventDateTime>,
    status: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct EventDateTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

// --- PKCE helpers ---

/// Generate a random PKCE code verifier (43 chars, URL-safe base64 of 32 random bytes).
fn generate_code_verifier() -> String {
    let random_bytes: Vec<u8> = (0..32).map(|_| rand::rng().random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&random_bytes)
}

/// Derive the S256 code challenge from a verifier.
fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

// --- Keyring helpers ---

fn keyring_key(email: &str, field: &str) -> String {
    format!("{email}:{field}")
}

fn store_keyring(email: &str, field: &str, value: &str) -> Result<(), CalendarError> {
    let key = keyring_key(email, field);
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| CalendarError::ProviderError {
            provider: "google".into(),
            message: format!("keyring entry error: {e}"),
        })?;
    entry
        .set_password(value)
        .map_err(|e| CalendarError::ProviderError {
            provider: "google".into(),
            message: format!("keyring set error: {e}"),
        })
}

fn load_keyring(email: &str, field: &str) -> Result<Option<String>, CalendarError> {
    let key = keyring_key(email, field);
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| CalendarError::ProviderError {
            provider: "google".into(),
            message: format!("keyring entry error: {e}"),
        })?;
    match entry.get_password() {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(CalendarError::ProviderError {
            provider: "google".into(),
            message: format!("keyring get error: {e}"),
        }),
    }
}

// --- Provider implementation ---

pub struct GoogleCalendarProvider {
    client_id: String,
    account_email: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expiry: Option<DateTime<Utc>>,
    http_client: Client,
    provider_id_cache: String,
}

impl Default for GoogleCalendarProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl GoogleCalendarProvider {
    /// Create a new provider instance. Call `authenticate()` or `try_restore_session()` before
    /// fetching events.
    pub fn new() -> Self {
        Self {
            client_id: GOOGLE_CLIENT_ID.to_string(),
            account_email: None,
            access_token: None,
            refresh_token: None,
            token_expiry: None,
            http_client: Client::new(),
            provider_id_cache: "google-unknown".to_string(),
        }
    }

    /// Attempt to restore a previously-authenticated session from the keyring.
    /// `email` must be the email used during the original auth flow.
    pub fn try_restore_session(email: &str) -> Result<Option<Self>, CalendarError> {
        let access = load_keyring(email, "access_token")?;
        let refresh = load_keyring(email, "refresh_token")?;
        let expiry_str = load_keyring(email, "token_expiry")?;

        // Need at least a refresh token to be useful
        let refresh = match refresh {
            Some(r) => r,
            None => return Ok(None),
        };

        let expiry = expiry_str.and_then(|s| {
            DateTime::parse_from_rfc3339(&s)
                .ok()
                .map(|d| d.with_timezone(&Utc))
        });

        Ok(Some(Self {
            client_id: GOOGLE_CLIENT_ID.to_string(),
            account_email: Some(email.to_string()),
            access_token: access,
            refresh_token: Some(refresh),
            token_expiry: expiry,
            http_client: Client::new(),
            provider_id_cache: format!("google-{email}"),
        }))
    }

    /// Persist current tokens to the OS keyring.
    fn persist_tokens(&self) -> Result<(), CalendarError> {
        let email = self
            .account_email
            .as_deref()
            .ok_or(CalendarError::NotAuthenticated)?;

        if let Some(ref at) = self.access_token {
            store_keyring(email, "access_token", at)?;
        }
        if let Some(ref rt) = self.refresh_token {
            store_keyring(email, "refresh_token", rt)?;
        }
        if let Some(ref exp) = self.token_expiry {
            store_keyring(email, "token_expiry", &exp.to_rfc3339())?;
        }
        Ok(())
    }

    /// Returns true if the access token is present and not expired.
    #[allow(dead_code)] // Used in tests and will be called by the poller
    pub fn token_is_valid(&self) -> bool {
        match (&self.access_token, &self.token_expiry) {
            (Some(_), Some(expiry)) => Utc::now() < *expiry - Duration::seconds(60),
            _ => false,
        }
    }

    /// Ensure we have a valid access token, refreshing if needed.
    #[allow(dead_code)] // Will be called before fetch_events in the polling flow
    pub async fn ensure_valid_token(&mut self) -> Result<(), CalendarError> {
        if self.token_is_valid() {
            return Ok(());
        }
        self.refresh_token().await
    }

    /// Find an available port in the configured range.
    fn find_available_port() -> Result<(tiny_http::Server, u16), CalendarError> {
        for port in PORT_RANGE_START..=PORT_RANGE_END {
            let addr = format!("127.0.0.1:{port}");
            if let Ok(server) = tiny_http::Server::http(&addr) {
                return Ok((server, port));
            }
        }
        Err(CalendarError::AuthenticationFailed(format!(
            "no available port in range {PORT_RANGE_START}-{PORT_RANGE_END}"
        )))
    }

    /// Listen for the OAuth callback on the given server and return the authorization code.
    fn listen_for_callback(server: tiny_http::Server) -> Result<String, CalendarError> {
        let request = server
            .recv_timeout(std::time::Duration::from_secs(CALLBACK_TIMEOUT_SECS))
            .map_err(|e| {
                CalendarError::AuthenticationFailed(format!("callback server error: {e}"))
            })?
            .ok_or_else(|| {
                CalendarError::AuthenticationFailed(
                    "timeout waiting for OAuth callback".to_string(),
                )
            })?;

        let url_str = format!("http://localhost{}", request.url());
        let parsed = Url::parse(&url_str).map_err(|e| {
            CalendarError::AuthenticationFailed(format!("failed to parse callback URL: {e}"))
        })?;

        // Check for user-denied consent
        if let Some(error) = parsed.query_pairs().find(|(k, _)| k == "error") {
            let html = format!(
                "<html><body><h2>Authorization failed</h2><p>{}</p>\
                 <p>You can close this tab.</p></body></html>",
                error.1
            );
            let response = tiny_http::Response::from_string(html).with_header(
                "Content-Type: text/html"
                    .parse::<tiny_http::Header>()
                    .expect("valid header"),
            );
            let _ = request.respond(response);
            return Err(CalendarError::AuthenticationFailed(format!(
                "user denied consent: {}",
                error.1
            )));
        }

        let code = parsed
            .query_pairs()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.to_string())
            .ok_or_else(|| {
                CalendarError::AuthenticationFailed("no authorization code in callback".to_string())
            })?;

        let html = "<html><body><h2>Authorization successful!</h2>\
                    <p>You can close this tab and return to LightTime.</p></body></html>";
        let response = tiny_http::Response::from_string(html).with_header(
            "Content-Type: text/html"
                .parse::<tiny_http::Header>()
                .expect("valid header"),
        );
        let _ = request.respond(response);

        Ok(code)
    }

    /// Exchange the authorization code for tokens.
    async fn exchange_code(
        &self,
        code: &str,
        verifier: &str,
        redirect_uri: &str,
    ) -> Result<TokenResponse, CalendarError> {
        let params = [
            ("client_id", self.client_id.as_str()),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ];

        let resp = self
            .http_client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| CalendarError::NetworkError(format!("token exchange request: {e}")))?;

        if !resp.status().is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(CalendarError::AuthenticationFailed(format!(
                "token exchange failed: {body}"
            )));
        }

        resp.json::<TokenResponse>()
            .await
            .map_err(|e| CalendarError::DeserializationError(format!("token response: {e}")))
    }

    /// Fetch the authenticated user's email address.
    async fn fetch_user_email(&self) -> Result<String, CalendarError> {
        let access_token = self
            .access_token
            .as_deref()
            .ok_or(CalendarError::NotAuthenticated)?;

        let resp = self
            .http_client
            .get(USERINFO_URL)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| CalendarError::NetworkError(format!("userinfo request: {e}")))?;

        if !resp.status().is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(CalendarError::AuthenticationFailed(format!(
                "failed to fetch user email: {body}"
            )));
        }

        let info: UserInfoResponse = resp
            .json()
            .await
            .map_err(|e| CalendarError::DeserializationError(format!("userinfo response: {e}")))?;

        Ok(info.email)
    }
}

/// Parse a Google Calendar event datetime (either `dateTime` or `date` field) into a UTC
/// `DateTime`. All-day events use `NaiveDate` and are anchored at midnight UTC.
fn parse_event_datetime(edt: &Option<EventDateTime>) -> Option<DateTime<Utc>> {
    let edt = edt.as_ref()?;

    if let Some(ref dt_str) = edt.date_time {
        // Timed event — RFC 3339 string
        DateTime::parse_from_rfc3339(dt_str)
            .ok()
            .map(|d| d.with_timezone(&Utc))
    } else if let Some(ref d_str) = edt.date {
        // All-day event — YYYY-MM-DD
        NaiveDate::parse_from_str(d_str, "%Y-%m-%d")
            .ok()
            .and_then(|nd| nd.and_hms_opt(0, 0, 0))
            .and_then(|ndt| Utc.from_local_datetime(&ndt).single())
    } else {
        None
    }
}

/// Returns `true` if the Google event datetime represents an all-day event (has `date` but no
/// `dateTime`).
fn is_all_day(edt: &Option<EventDateTime>) -> bool {
    match edt.as_ref() {
        Some(dt) => dt.date_time.is_none() && dt.date.is_some(),
        None => false,
    }
}

/// Map a Google Calendar API event to our CalendarEvent type.
fn map_google_event(event: GoogleEvent, provider_id: &str) -> Option<CalendarEvent> {
    // Skip cancelled events
    if event.status.as_deref() == Some("cancelled") {
        return None;
    }

    let start = parse_event_datetime(&event.start)?;
    let end = parse_event_datetime(&event.end)?;

    Some(CalendarEvent {
        id: event.id.unwrap_or_default(),
        title: event.summary.unwrap_or_else(|| "(No title)".to_string()),
        start_time: start,
        end_time: end,
        ignored: false,
        calendar_id: Some("primary".to_string()),
        provider_id: provider_id.to_string(),
        is_all_day: is_all_day(&event.start),
    })
}

#[async_trait]
impl CalendarProvider for GoogleCalendarProvider {
    async fn authenticate(&mut self) -> Result<(), CalendarError> {
        // 1. Generate PKCE pair
        let verifier = generate_code_verifier();
        let challenge = code_challenge(&verifier);

        // 2. Find an available port and start the callback server
        let (server, port) = Self::find_available_port()?;
        let redirect_uri = format!("http://127.0.0.1:{port}/callback");

        // 3. Build the authorization URL
        let mut auth_url = Url::parse(AUTH_URL).map_err(|e| {
            CalendarError::AuthenticationFailed(format!("failed to parse auth URL: {e}"))
        })?;
        auth_url
            .query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", SCOPE)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent");

        // 4. Open the system browser
        open::that(auth_url.as_str()).map_err(|e| {
            CalendarError::AuthenticationFailed(format!("failed to open browser: {e}"))
        })?;

        // 5. Wait for callback (blocking — run on a background thread)
        let code = tokio::task::spawn_blocking(move || Self::listen_for_callback(server))
            .await
            .map_err(|e| {
                CalendarError::AuthenticationFailed(format!("callback task panicked: {e}"))
            })??;

        // 6. Exchange authorization code for tokens
        let token_resp = self.exchange_code(&code, &verifier, &redirect_uri).await?;

        self.access_token = Some(token_resp.access_token);
        if let Some(rt) = token_resp.refresh_token {
            self.refresh_token = Some(rt);
        }
        self.token_expiry = Some(Utc::now() + Duration::seconds(token_resp.expires_in));

        // 7. Fetch user email to key the provider
        let email = self.fetch_user_email().await?;
        self.account_email = Some(email.clone());
        self.provider_id_cache = format!("google-{email}");

        // 8. Persist tokens to keyring
        self.persist_tokens()?;

        Ok(())
    }

    async fn fetch_events(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarError> {
        let access_token = self
            .access_token
            .as_deref()
            .ok_or(CalendarError::NotAuthenticated)?;

        let resp = self
            .http_client
            .get(CALENDAR_EVENTS_URL)
            .bearer_auth(access_token)
            .query(&[
                ("timeMin", from.to_rfc3339()),
                ("timeMax", to.to_rfc3339()),
                ("singleEvents", "true".to_string()),
                ("orderBy", "startTime".to_string()),
            ])
            .send()
            .await
            .map_err(|e| CalendarError::NetworkError(format!("calendar API request: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(CalendarError::TokenRefreshFailed(
                "access token expired (401)".to_string(),
            ));
        }

        if !resp.status().is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(CalendarError::FetchFailed(format!(
                "calendar API error: {body}"
            )));
        }

        let data: EventsListResponse = resp.json().await.map_err(|e| {
            CalendarError::DeserializationError(format!("calendar events response: {e}"))
        })?;

        let provider_id = &self.provider_id_cache;
        let events = data
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|e| map_google_event(e, provider_id))
            .collect();

        Ok(events)
    }

    async fn refresh_token(&mut self) -> Result<(), CalendarError> {
        let refresh = self
            .refresh_token
            .as_deref()
            .ok_or(CalendarError::TokenRefreshFailed(
                "no refresh token available".to_string(),
            ))?;

        let params = [
            ("client_id", self.client_id.as_str()),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
        ];

        let resp = self
            .http_client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| CalendarError::NetworkError(format!("token refresh request: {e}")))?;

        if !resp.status().is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(CalendarError::TokenRefreshFailed(format!(
                "refresh failed: {body}"
            )));
        }

        let token_resp: TokenResponse = resp
            .json()
            .await
            .map_err(|e| CalendarError::DeserializationError(format!("refresh response: {e}")))?;

        self.access_token = Some(token_resp.access_token);
        self.token_expiry = Some(Utc::now() + Duration::seconds(token_resp.expires_in));
        // Google may issue a new refresh token
        if let Some(rt) = token_resp.refresh_token {
            self.refresh_token = Some(rt);
        }

        self.persist_tokens()?;

        Ok(())
    }

    fn provider_id(&self) -> &str {
        &self.provider_id_cache
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::Google
    }

    fn account_name(&self) -> &str {
        self.account_email.as_deref().unwrap_or("unknown")
    }
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    // --- PKCE tests ---

    #[test]
    fn code_verifier_has_correct_length() {
        let verifier = generate_code_verifier();
        // 32 bytes base64-encoded without padding = 43 characters
        assert_eq!(verifier.len(), 43);
    }

    #[test]
    fn code_verifier_is_url_safe() {
        let verifier = generate_code_verifier();
        for ch in verifier.chars() {
            assert!(
                ch.is_ascii_alphanumeric() || ch == '-' || ch == '_',
                "unexpected character in verifier: {ch}"
            );
        }
    }

    #[test]
    fn code_challenge_is_sha256_base64url() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = code_challenge(verifier);

        // Manually verify: SHA256 of the verifier, then base64url-no-pad
        let digest = Sha256::digest(verifier.as_bytes());
        let expected = URL_SAFE_NO_PAD.encode(digest);
        assert_eq!(challenge, expected);
    }

    #[test]
    fn code_challenge_is_deterministic() {
        let verifier = generate_code_verifier();
        let c1 = code_challenge(&verifier);
        let c2 = code_challenge(&verifier);
        assert_eq!(c1, c2);
    }

    #[test]
    fn different_verifiers_produce_different_challenges() {
        let v1 = generate_code_verifier();
        let v2 = generate_code_verifier();
        assert_ne!(v1, v2);
        assert_ne!(code_challenge(&v1), code_challenge(&v2));
    }

    // --- Event mapping tests ---

    fn make_google_event(id: &str, summary: &str, start_dt: &str, end_dt: &str) -> GoogleEvent {
        GoogleEvent {
            id: Some(id.to_string()),
            summary: Some(summary.to_string()),
            start: Some(EventDateTime {
                date_time: Some(start_dt.to_string()),
                date: None,
            }),
            end: Some(EventDateTime {
                date_time: Some(end_dt.to_string()),
                date: None,
            }),
            status: Some("confirmed".to_string()),
        }
    }

    fn make_all_day_google_event(
        id: &str,
        summary: &str,
        start_date: &str,
        end_date: &str,
    ) -> GoogleEvent {
        GoogleEvent {
            id: Some(id.to_string()),
            summary: Some(summary.to_string()),
            start: Some(EventDateTime {
                date_time: None,
                date: Some(start_date.to_string()),
            }),
            end: Some(EventDateTime {
                date_time: None,
                date: Some(end_date.to_string()),
            }),
            status: Some("confirmed".to_string()),
        }
    }

    #[test]
    fn maps_timed_event() {
        let ge = make_google_event(
            "evt-1",
            "Stand-up",
            "2026-02-20T10:00:00Z",
            "2026-02-20T10:30:00Z",
        );

        let ce = map_google_event(ge, "google-test@gmail.com").unwrap();

        assert_eq!(ce.id, "evt-1");
        assert_eq!(ce.title, "Stand-up");
        assert_eq!(
            ce.start_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 10, 0, 0).unwrap()
        );
        assert_eq!(
            ce.end_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 10, 30, 0).unwrap()
        );
        assert!(!ce.is_all_day);
        assert!(!ce.ignored);
        assert_eq!(ce.provider_id, "google-test@gmail.com");
        assert_eq!(ce.calendar_id, Some("primary".to_string()));
    }

    #[test]
    fn maps_all_day_event() {
        let ge = make_all_day_google_event("evt-2", "Holiday", "2026-02-20", "2026-02-21");

        let ce = map_google_event(ge, "google-test@gmail.com").unwrap();

        assert_eq!(ce.title, "Holiday");
        assert!(ce.is_all_day);
        assert_eq!(
            ce.start_time,
            Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap()
        );
        assert_eq!(
            ce.end_time,
            Utc.with_ymd_and_hms(2026, 2, 21, 0, 0, 0).unwrap()
        );
    }

    #[test]
    fn skips_cancelled_event() {
        let ge = GoogleEvent {
            id: Some("evt-3".to_string()),
            summary: Some("Cancelled Meeting".to_string()),
            start: Some(EventDateTime {
                date_time: Some("2026-02-20T10:00:00Z".to_string()),
                date: None,
            }),
            end: Some(EventDateTime {
                date_time: Some("2026-02-20T10:30:00Z".to_string()),
                date: None,
            }),
            status: Some("cancelled".to_string()),
        };

        assert!(map_google_event(ge, "google-test@gmail.com").is_none());
    }

    #[test]
    fn handles_missing_summary() {
        let ge = GoogleEvent {
            id: Some("evt-4".to_string()),
            summary: None,
            start: Some(EventDateTime {
                date_time: Some("2026-02-20T10:00:00Z".to_string()),
                date: None,
            }),
            end: Some(EventDateTime {
                date_time: Some("2026-02-20T10:30:00Z".to_string()),
                date: None,
            }),
            status: Some("confirmed".to_string()),
        };

        let ce = map_google_event(ge, "google-test@gmail.com").unwrap();
        assert_eq!(ce.title, "(No title)");
    }

    #[test]
    fn returns_none_for_missing_start() {
        let ge = GoogleEvent {
            id: Some("evt-5".to_string()),
            summary: Some("Broken".to_string()),
            start: None,
            end: Some(EventDateTime {
                date_time: Some("2026-02-20T10:30:00Z".to_string()),
                date: None,
            }),
            status: Some("confirmed".to_string()),
        };

        assert!(map_google_event(ge, "google-test@gmail.com").is_none());
    }

    #[test]
    fn parses_event_datetime_with_offset() {
        let edt = Some(EventDateTime {
            date_time: Some("2026-02-20T10:00:00+05:00".to_string()),
            date: None,
        });
        let dt = parse_event_datetime(&edt).unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 2, 20, 5, 0, 0).unwrap());
    }

    #[test]
    fn is_all_day_detection() {
        let timed = Some(EventDateTime {
            date_time: Some("2026-02-20T10:00:00Z".to_string()),
            date: None,
        });
        assert!(!is_all_day(&timed));

        let all_day = Some(EventDateTime {
            date_time: None,
            date: Some("2026-02-20".to_string()),
        });
        assert!(is_all_day(&all_day));

        assert!(!is_all_day(&None));
    }

    #[test]
    fn provider_default_state() {
        let provider = GoogleCalendarProvider::new();
        assert_eq!(provider.provider_id(), "google-unknown");
        assert_eq!(provider.provider_type(), ProviderType::Google);
        assert_eq!(provider.account_name(), "unknown");
    }

    // --- Event list deserialization test ---

    #[test]
    fn deserializes_google_events_response() {
        let json = r#"{
            "items": [
                {
                    "id": "abc123",
                    "summary": "Team Sync",
                    "start": { "dateTime": "2026-02-20T14:00:00Z" },
                    "end": { "dateTime": "2026-02-20T14:30:00Z" },
                    "status": "confirmed"
                },
                {
                    "id": "def456",
                    "summary": "All-Day Event",
                    "start": { "date": "2026-02-21" },
                    "end": { "date": "2026-02-22" },
                    "status": "confirmed"
                }
            ]
        }"#;

        let resp: EventsListResponse = serde_json::from_str(json).unwrap();
        let items = resp.items.unwrap();
        assert_eq!(items.len(), 2);

        let events: Vec<CalendarEvent> = items
            .into_iter()
            .filter_map(|e| map_google_event(e, "google-user@test.com"))
            .collect();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].title, "Team Sync");
        assert!(!events[0].is_all_day);
        assert_eq!(events[1].title, "All-Day Event");
        assert!(events[1].is_all_day);
    }

    #[test]
    fn deserializes_empty_events_response() {
        let json = r#"{ "items": [] }"#;
        let resp: EventsListResponse = serde_json::from_str(json).unwrap();
        assert!(resp.items.unwrap().is_empty());
    }

    #[test]
    fn deserializes_missing_items_field() {
        let json = r#"{}"#;
        let resp: EventsListResponse = serde_json::from_str(json).unwrap();
        assert!(resp.items.is_none());
    }

    #[test]
    fn token_validity_checks() {
        let mut provider = GoogleCalendarProvider::new();

        // No token = not valid
        assert!(!provider.token_is_valid());

        // Token with future expiry = valid
        provider.access_token = Some("test-token".to_string());
        provider.token_expiry = Some(Utc::now() + Duration::hours(1));
        assert!(provider.token_is_valid());

        // Token that expires in 30 seconds = not valid (60s buffer)
        provider.token_expiry = Some(Utc::now() + Duration::seconds(30));
        assert!(!provider.token_is_valid());

        // Expired token = not valid
        provider.token_expiry = Some(Utc::now() - Duration::hours(1));
        assert!(!provider.token_is_valid());
    }
}

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use super::error::CalendarError;
use super::types::{CalendarEvent, ProviderType};

/// Trait implemented by each calendar backend (Google, Microsoft, Apple).
///
/// Providers are responsible for authenticating, refreshing tokens, and
/// fetching events from a single calendar account.
#[async_trait]
pub trait CalendarProvider: Send + Sync {
    /// Perform the initial authentication flow (e.g., OAuth2 PKCE).
    async fn authenticate(&mut self) -> Result<(), CalendarError>;

    /// Fetch events within the given time range.
    async fn fetch_events(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarError>;

    /// Refresh an expired access token using the stored refresh token.
    async fn refresh_token(&mut self) -> Result<(), CalendarError>;

    /// Unique identifier for this provider instance (e.g., "google-user@gmail.com").
    fn provider_id(&self) -> &str;

    /// The type of calendar backend.
    fn provider_type(&self) -> ProviderType;

    /// Human-readable account name (e.g., email address or display name).
    fn account_name(&self) -> &str;
}

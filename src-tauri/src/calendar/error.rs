use thiserror::Error;

#[derive(Debug, Error)]
pub enum CalendarError {
    #[error("authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("token refresh failed: {0}")]
    TokenRefreshFailed(String),

    #[error("failed to fetch events: {0}")]
    FetchFailed(String),

    #[error("provider not authenticated")]
    NotAuthenticated,

    #[error("network error: {0}")]
    NetworkError(String),

    #[error("deserialization error: {0}")]
    DeserializationError(String),

    #[error("provider error ({provider}): {message}")]
    ProviderError { provider: String, message: String },
}

use chrono::{DateTime, Utc};
use std::collections::HashSet;

use super::error::CalendarError;
use super::provider::CalendarProvider;
use super::types::CalendarEvent;

/// Merges events from multiple calendar providers, deduplicates, and sorts.
pub struct CalendarAggregator {
    providers: Vec<Box<dyn CalendarProvider>>,
}

/// Result from a provider fetch, including partial failures.
#[derive(Debug)]
pub struct AggregatorResult {
    /// Successfully fetched and merged events, sorted by start time.
    pub events: Vec<CalendarEvent>,
    /// Errors from providers that failed (provider_id, error).
    pub errors: Vec<(String, CalendarError)>,
}

impl CalendarAggregator {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
        }
    }

    /// Add a calendar provider.
    pub fn add_provider(&mut self, provider: Box<dyn CalendarProvider>) {
        self.providers.push(provider);
    }

    /// Remove a provider by its provider_id. Returns true if found and removed.
    pub fn remove_provider(&mut self, provider_id: &str) -> bool {
        let len_before = self.providers.len();
        self.providers
            .retain(|p| p.provider_id() != provider_id);
        self.providers.len() != len_before
    }

    /// The number of registered providers.
    pub fn provider_count(&self) -> usize {
        self.providers.len()
    }

    /// Fetch upcoming events from all providers.
    ///
    /// One provider failing does NOT prevent events from other providers from
    /// being returned. Errors are collected in `AggregatorResult::errors`.
    pub async fn fetch_events(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> AggregatorResult {
        let mut all_events: Vec<CalendarEvent> = Vec::new();
        let mut errors: Vec<(String, CalendarError)> = Vec::new();

        for provider in &self.providers {
            match provider.fetch_events(from, to).await {
                Ok(events) => all_events.extend(events),
                Err(e) => errors.push((provider.provider_id().to_string(), e)),
            }
        }

        let events = deduplicate_events(all_events);

        AggregatorResult { events, errors }
    }
}

impl Default for CalendarAggregator {
    fn default() -> Self {
        Self::new()
    }
}

/// Deduplicate events that appear in multiple calendars and sort by start time.
///
/// Deduplication strategy: events with the same title, start time, and end time
/// are considered duplicates. The first occurrence (by provider order) wins.
fn deduplicate_events(mut events: Vec<CalendarEvent>) -> Vec<CalendarEvent> {
    let mut seen = HashSet::new();
    events.retain(|event| {
        let key = (
            event.title.clone(),
            event.start_time,
            event.end_time,
        );
        seen.insert(key)
    });

    events.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    events
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::provider::CalendarProvider;
    use crate::calendar::types::ProviderType;
    use async_trait::async_trait;
    use chrono::TimeZone;

    // --- Mock providers for testing ---

    struct MockProvider {
        id: String,
        account: String,
        provider_type: ProviderType,
        events: Vec<CalendarEvent>,
    }

    impl MockProvider {
        fn new(id: &str, events: Vec<CalendarEvent>) -> Self {
            Self {
                id: id.to_string(),
                account: format!("{id}@test.com"),
                provider_type: ProviderType::Google,
                events,
            }
        }
    }

    #[async_trait]
    impl CalendarProvider for MockProvider {
        async fn authenticate(&mut self) -> Result<(), CalendarError> {
            Ok(())
        }

        async fn fetch_events(
            &self,
            _from: DateTime<Utc>,
            _to: DateTime<Utc>,
        ) -> Result<Vec<CalendarEvent>, CalendarError> {
            Ok(self.events.clone())
        }

        async fn refresh_token(&mut self) -> Result<(), CalendarError> {
            Ok(())
        }

        fn provider_id(&self) -> &str {
            &self.id
        }

        fn provider_type(&self) -> ProviderType {
            self.provider_type
        }

        fn account_name(&self) -> &str {
            &self.account
        }
    }

    struct FailingProvider {
        id: String,
    }

    #[async_trait]
    impl CalendarProvider for FailingProvider {
        async fn authenticate(&mut self) -> Result<(), CalendarError> {
            Err(CalendarError::AuthenticationFailed("mock failure".into()))
        }

        async fn fetch_events(
            &self,
            _from: DateTime<Utc>,
            _to: DateTime<Utc>,
        ) -> Result<Vec<CalendarEvent>, CalendarError> {
            Err(CalendarError::FetchFailed("mock fetch failure".into()))
        }

        async fn refresh_token(&mut self) -> Result<(), CalendarError> {
            Err(CalendarError::TokenRefreshFailed("mock refresh failure".into()))
        }

        fn provider_id(&self) -> &str {
            &self.id
        }

        fn provider_type(&self) -> ProviderType {
            ProviderType::Microsoft
        }

        fn account_name(&self) -> &str {
            "failing@test.com"
        }
    }

    // --- Helper ---

    fn make_event(id: &str, title: &str, hour: u32, provider_id: &str) -> CalendarEvent {
        CalendarEvent {
            id: id.to_string(),
            title: title.to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 19, hour, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 19, hour, 30, 0).unwrap(),
            ignored: false,
            calendar_id: None,
            provider_id: provider_id.to_string(),
            is_all_day: false,
        }
    }

    // --- Tests ---

    #[tokio::test]
    async fn fetches_from_single_provider() {
        let events = vec![
            make_event("1", "Meeting A", 10, "google-work"),
            make_event("2", "Meeting B", 14, "google-work"),
        ];

        let mut agg = CalendarAggregator::new();
        agg.add_provider(Box::new(MockProvider::new("google-work", events)));

        let from = Utc.with_ymd_and_hms(2026, 2, 19, 0, 0, 0).unwrap();
        let to = Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap();

        let result = agg.fetch_events(from, to).await;
        assert_eq!(result.events.len(), 2);
        assert!(result.errors.is_empty());
        assert_eq!(result.events[0].title, "Meeting A");
        assert_eq!(result.events[1].title, "Meeting B");
    }

    #[tokio::test]
    async fn merges_and_sorts_from_multiple_providers() {
        let google_events = vec![
            make_event("g1", "Late Meeting", 16, "google-work"),
            make_event("g2", "Early Meeting", 9, "google-work"),
        ];
        let apple_events = vec![
            make_event("a1", "Lunch", 12, "apple-personal"),
        ];

        let mut agg = CalendarAggregator::new();
        agg.add_provider(Box::new(MockProvider::new("google-work", google_events)));
        agg.add_provider(Box::new(MockProvider::new("apple-personal", apple_events)));

        let from = Utc.with_ymd_and_hms(2026, 2, 19, 0, 0, 0).unwrap();
        let to = Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap();

        let result = agg.fetch_events(from, to).await;
        assert_eq!(result.events.len(), 3);
        assert_eq!(result.events[0].title, "Early Meeting");
        assert_eq!(result.events[1].title, "Lunch");
        assert_eq!(result.events[2].title, "Late Meeting");
    }

    #[tokio::test]
    async fn deduplicates_events_across_providers() {
        // Same meeting appears in both Google and Microsoft calendars
        let shared_event_google = CalendarEvent {
            id: "g-shared".to_string(),
            title: "Team Sync".to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 19, 11, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 19, 11, 30, 0).unwrap(),
            ignored: false,
            calendar_id: None,
            provider_id: "google-work".to_string(),
            is_all_day: false,
        };
        let shared_event_ms = CalendarEvent {
            id: "ms-shared".to_string(),
            title: "Team Sync".to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 19, 11, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 19, 11, 30, 0).unwrap(),
            ignored: false,
            calendar_id: None,
            provider_id: "ms-work".to_string(),
            is_all_day: false,
        };

        let mut agg = CalendarAggregator::new();
        agg.add_provider(Box::new(MockProvider::new("google-work", vec![shared_event_google])));
        agg.add_provider(Box::new(MockProvider::new("ms-work", vec![shared_event_ms])));

        let from = Utc.with_ymd_and_hms(2026, 2, 19, 0, 0, 0).unwrap();
        let to = Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap();

        let result = agg.fetch_events(from, to).await;
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].title, "Team Sync");
    }

    #[tokio::test]
    async fn failing_provider_does_not_block_others() {
        let good_events = vec![
            make_event("1", "Good Meeting", 10, "google-work"),
        ];

        let mut agg = CalendarAggregator::new();
        agg.add_provider(Box::new(MockProvider::new("google-work", good_events)));
        agg.add_provider(Box::new(FailingProvider {
            id: "ms-broken".to_string(),
        }));

        let from = Utc.with_ymd_and_hms(2026, 2, 19, 0, 0, 0).unwrap();
        let to = Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap();

        let result = agg.fetch_events(from, to).await;
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].title, "Good Meeting");
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].0, "ms-broken");
    }

    #[tokio::test]
    async fn empty_aggregator_returns_no_events() {
        let agg = CalendarAggregator::new();
        let from = Utc.with_ymd_and_hms(2026, 2, 19, 0, 0, 0).unwrap();
        let to = Utc.with_ymd_and_hms(2026, 2, 20, 0, 0, 0).unwrap();

        let result = agg.fetch_events(from, to).await;
        assert!(result.events.is_empty());
        assert!(result.errors.is_empty());
    }

    #[test]
    fn add_and_remove_provider() {
        let mut agg = CalendarAggregator::new();
        assert_eq!(agg.provider_count(), 0);

        agg.add_provider(Box::new(MockProvider::new("google-work", vec![])));
        agg.add_provider(Box::new(MockProvider::new("apple-personal", vec![])));
        assert_eq!(agg.provider_count(), 2);

        assert!(agg.remove_provider("google-work"));
        assert_eq!(agg.provider_count(), 1);

        assert!(!agg.remove_provider("nonexistent"));
        assert_eq!(agg.provider_count(), 1);
    }

    #[test]
    fn dedup_keeps_distinct_events_with_same_title_different_times() {
        let events = vec![
            make_event("1", "Stand-up", 9, "google"),
            make_event("2", "Stand-up", 10, "google"), // different time
        ];

        let result = deduplicate_events(events);
        assert_eq!(result.len(), 2);
    }
}

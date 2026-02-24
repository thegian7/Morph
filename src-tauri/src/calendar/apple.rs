//! Apple EventKit calendar provider (macOS only).
//!
//! Uses `objc2-event-kit` bindings to access the system calendar via
//! `EKEventStore`. macOS will prompt the user for calendar permission on
//! first use; no OAuth flow is required.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use objc2::rc::Retained;
use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEvent, EKEventStore};
use objc2_foundation::NSDate;
use std::sync::mpsc;

use super::error::CalendarError;
use super::provider::CalendarProvider;
use super::types::{CalendarEvent, ProviderType};

/// Apple EventKit provider backed by `EKEventStore`.
///
/// This provider is only available on macOS and uses system-level calendar
/// permissions (no OAuth). The first call to [`authenticate`] triggers the
/// macOS permission dialog.
pub struct AppleCalendarProvider {
    store: Retained<EKEventStore>,
    authorized: bool,
    account_name: String,
}

// SAFETY: EKEventStore is internally thread-safe — it dispatches completion
// handlers on arbitrary queues and its fetch methods are documented as safe to
// call from any thread. Our access is further serialized by the
// CalendarAggregator's `Mutex`.
unsafe impl Send for AppleCalendarProvider {}
unsafe impl Sync for AppleCalendarProvider {}

impl AppleCalendarProvider {
    /// Create a new provider. Does **not** request calendar access yet —
    /// call [`authenticate`] first.
    pub fn new(account_name: impl Into<String>) -> Self {
        // SAFETY: EKEventStore.new is a standard Objective-C allocator.
        let store = unsafe { EKEventStore::new() };
        Self {
            store,
            authorized: false,
            account_name: account_name.into(),
        }
    }

    /// Check the current authorization status without triggering a prompt.
    fn is_authorized() -> bool {
        // SAFETY: Class method with no side effects.
        let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        status == EKAuthorizationStatus::FullAccess
    }
}

#[async_trait]
impl CalendarProvider for AppleCalendarProvider {
    /// Request calendar access from the user.
    ///
    /// On macOS this shows a system permission dialog the first time. If the
    /// user has already granted or denied access, the result is returned
    /// immediately.
    async fn authenticate(&mut self) -> Result<(), CalendarError> {
        if Self::is_authorized() {
            self.authorized = true;
            return Ok(());
        }

        // Use a synchronous channel to bridge the Objective-C completion
        // handler back to Rust async.
        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        // Build the block and call the EventKit API in a non-async scope so
        // the non-Send RcBlock does not live across the .await point.
        {
            let completion = block2::RcBlock::new(
                move |granted: objc2::runtime::Bool, error: *mut objc2_foundation::NSError| {
                    if granted.as_bool() {
                        let _ = tx.send(Ok(()));
                    } else if !error.is_null() {
                        // SAFETY: pointer was checked for null.
                        let desc = unsafe { (*error).localizedDescription() };
                        let _ = tx.send(Err(desc.to_string()));
                    } else {
                        let _ = tx.send(Err("calendar access denied by user".into()));
                    }
                },
            );

            // SAFETY: the raw pointer is valid for the lifetime of `completion`
            // which lives until the end of this block. EventKit retains the
            // block internally if it needs it beyond this scope.
            let ptr = block2::RcBlock::as_ptr(&completion);
            unsafe {
                self.store.requestFullAccessToEventsWithCompletion(ptr);
            }
        } // `completion` (RcBlock) dropped here — before the await

        // Wait for the completion handler on a blocking thread.
        let result = tokio::task::spawn_blocking(move || {
            rx.recv()
                .unwrap_or(Err("completion handler was never called".into()))
        })
        .await
        .map_err(|e| CalendarError::AuthenticationFailed(e.to_string()))?;

        match result {
            Ok(()) => {
                self.authorized = true;
                Ok(())
            }
            Err(msg) => Err(CalendarError::AuthenticationFailed(msg)),
        }
    }

    /// Fetch events from the system calendar within the given time range.
    async fn fetch_events(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarError> {
        if !self.authorized {
            return Err(CalendarError::NotAuthenticated);
        }

        let from_ts = from.timestamp() as f64;
        let to_ts = to.timestamp() as f64;
        let provider_id = self.provider_id().to_string();

        let start_date = NSDate::dateWithTimeIntervalSince1970(from_ts);
        let end_date = NSDate::dateWithTimeIntervalSince1970(to_ts);

        // SAFETY: creating a predicate for the date range across all
        // calendars (None = all calendars).
        let predicate = unsafe {
            self.store
                .predicateForEventsWithStartDate_endDate_calendars(&start_date, &end_date, None)
        };

        // SAFETY: fetching events matching a valid predicate.
        let ek_events = unsafe { self.store.eventsMatchingPredicate(&predicate) };

        let mut events: Vec<CalendarEvent> = ek_events
            .iter()
            .filter_map(|ek_event| map_ek_event(&ek_event, &provider_id))
            .collect();

        events.sort_by(|a, b| a.start_time.cmp(&b.start_time));
        Ok(events)
    }

    /// No-op — Apple EventKit uses system-level tokens that don't expire.
    async fn refresh_token(&mut self) -> Result<(), CalendarError> {
        // EventKit does not use OAuth tokens; access is system-managed.
        Ok(())
    }

    fn provider_id(&self) -> &str {
        "apple-calendar"
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::Apple
    }

    fn account_name(&self) -> &str {
        &self.account_name
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert an `EKEvent` into our domain `CalendarEvent`.
///
/// Returns `None` if any required field is missing (defensive — should not
/// happen for valid calendar entries).
fn map_ek_event(event: &EKEvent, provider_id: &str) -> Option<CalendarEvent> {
    // SAFETY: reading Objective-C properties from a valid EKEvent.
    // title() returns Retained<NSString> (non-optional in the bindings).
    let title = unsafe { event.title().to_string() };
    let event_id = unsafe { event.calendarItemIdentifier().to_string() };
    let is_all_day = unsafe { event.isAllDay() };

    let start_ts = unsafe { event.startDate().timeIntervalSince1970() };
    let end_ts = unsafe { event.endDate().timeIntervalSince1970() };

    let start_time = DateTime::from_timestamp(start_ts as i64, 0)?;
    let end_time = DateTime::from_timestamp(end_ts as i64, 0)?;

    let calendar_id = unsafe {
        event
            .calendar()
            .map(|cal| cal.calendarIdentifier().to_string())
    };

    Some(CalendarEvent {
        id: event_id,
        title,
        start_time,
        end_time,
        ignored: false,
        calendar_id,
        provider_id: provider_id.to_string(),
        is_all_day,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn provider_metadata() {
        let provider = AppleCalendarProvider::new("Tom's Calendar");
        assert_eq!(provider.provider_id(), "apple-calendar");
        assert_eq!(provider.provider_type(), ProviderType::Apple);
        assert_eq!(provider.account_name(), "Tom's Calendar");
        assert!(!provider.authorized);
    }

    #[test]
    fn is_authorized_check_does_not_panic() {
        // Just verify the class method can be called without crashing.
        // The actual value depends on system state.
        let _ = AppleCalendarProvider::is_authorized();
    }

    #[test]
    fn calendar_event_mapping_round_trip() {
        // Verify our domain type works correctly with Apple-sourced data.
        let event = CalendarEvent {
            id: "EK-abc-123".to_string(),
            title: "Team standup".to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 20, 9, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 20, 9, 30, 0).unwrap(),
            ignored: false,
            calendar_id: Some("personal-cal".to_string()),
            provider_id: "apple-calendar".to_string(),
            is_all_day: false,
        };

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: CalendarEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "EK-abc-123");
        assert_eq!(deserialized.title, "Team standup");
        assert_eq!(deserialized.provider_id, "apple-calendar");
        assert!(!deserialized.is_all_day);
    }
}

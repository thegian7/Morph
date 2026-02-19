use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

const CALENDAR_EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/// A simplified calendar event for the spike
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub id: String,
    pub summary: String,
    pub start: String,
    pub end: String,
    pub status: String,
}

/// Raw Google Calendar API response structures
#[derive(Debug, Deserialize)]
struct EventsListResponse {
    items: Option<Vec<GoogleEvent>>,
}

#[derive(Debug, Deserialize)]
struct GoogleEvent {
    id: Option<String>,
    summary: Option<String>,
    start: Option<EventDateTime>,
    end: Option<EventDateTime>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EventDateTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

/// Fetch upcoming calendar events (next 24 hours) from Google Calendar API
pub async fn fetch_upcoming_events(access_token: &str) -> Result<Vec<CalendarEvent>, String> {
    let now = Utc::now();
    let tomorrow = now + Duration::hours(24);

    let client = reqwest::Client::new();
    let resp = client
        .get(CALENDAR_EVENTS_URL)
        .bearer_auth(access_token)
        .query(&[
            ("timeMin", now.to_rfc3339()),
            ("timeMax", tomorrow.to_rfc3339()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
            ("maxResults", "20".to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Calendar API request failed: {e}"))?;

    if resp.status() == 401 {
        return Err("TOKEN_EXPIRED".to_string());
    }

    if !resp.status().is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Calendar API error: {body}"));
    }

    let data: EventsListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse calendar response: {e}"))?;

    let events = data
        .items
        .unwrap_or_default()
        .into_iter()
        .map(|e| {
            let start = e
                .start
                .and_then(|s| s.date_time.or(s.date))
                .unwrap_or_default();
            let end = e
                .end
                .and_then(|s| s.date_time.or(s.date))
                .unwrap_or_default();
            CalendarEvent {
                id: e.id.unwrap_or_default(),
                summary: e.summary.unwrap_or_else(|| "(No title)".to_string()),
                start,
                end,
                status: e.status.unwrap_or_else(|| "confirmed".to_string()),
            }
        })
        .collect();

    Ok(events)
}

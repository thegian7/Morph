use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A calendar event from any provider, serialized to camelCase for the TypeScript frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub ignored: bool,
    pub calendar_id: Option<String>,
    pub provider_id: String,
    pub is_all_day: bool,
}

/// The type of calendar provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Google,
    Microsoft,
    Apple,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn serializes_to_camel_case() {
        let event = CalendarEvent {
            id: "evt-1".to_string(),
            title: "Stand-up".to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 19, 10, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 19, 10, 30, 0).unwrap(),
            ignored: false,
            calendar_id: Some("cal-work".to_string()),
            provider_id: "google-user@gmail.com".to_string(),
            is_all_day: false,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"startTime\""));
        assert!(json.contains("\"endTime\""));
        assert!(json.contains("\"calendarId\""));
        assert!(json.contains("\"providerId\""));
        assert!(json.contains("\"isAllDay\""));
        assert!(!json.contains("\"start_time\""));
    }

    #[test]
    fn round_trips_through_json() {
        let event = CalendarEvent {
            id: "evt-2".to_string(),
            title: "Lunch".to_string(),
            start_time: Utc.with_ymd_and_hms(2026, 2, 19, 12, 0, 0).unwrap(),
            end_time: Utc.with_ymd_and_hms(2026, 2, 19, 13, 0, 0).unwrap(),
            ignored: true,
            calendar_id: None,
            provider_id: "apple-personal".to_string(),
            is_all_day: false,
        };

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: CalendarEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, event.id);
        assert_eq!(deserialized.title, event.title);
        assert_eq!(deserialized.start_time, event.start_time);
        assert_eq!(deserialized.ignored, event.ignored);
        assert_eq!(deserialized.calendar_id, event.calendar_id);
    }

    #[test]
    fn provider_type_serializes_lowercase() {
        let json = serde_json::to_string(&ProviderType::Google).unwrap();
        assert_eq!(json, "\"google\"");

        let json = serde_json::to_string(&ProviderType::Microsoft).unwrap();
        assert_eq!(json, "\"microsoft\"");

        let json = serde_json::to_string(&ProviderType::Apple).unwrap();
        assert_eq!(json, "\"apple\"");
    }
}

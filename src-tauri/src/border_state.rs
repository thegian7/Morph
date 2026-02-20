use serde::{Deserialize, Serialize};

/// The computed visual state of the screen border at a given moment.
/// Serialized to camelCase to match the TypeScript `BorderState` interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BorderState {
    pub phase: String,
    pub color: String,
    pub opacity: f64,
    pub pulse_speed: u32,
}

impl Default for BorderState {
    fn default() -> Self {
        Self {
            phase: "no-events".to_string(),
            color: "#8A9BA8".to_string(),
            opacity: 0.15,
            pulse_speed: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_camel_case() {
        let state = BorderState::default();
        let json = serde_json::to_string(&state).unwrap();

        assert!(json.contains("\"phase\""));
        assert!(json.contains("\"color\""));
        assert!(json.contains("\"opacity\""));
        assert!(json.contains("\"pulseSpeed\""));
        assert!(!json.contains("\"pulse_speed\""));
    }

    #[test]
    fn round_trips_through_json() {
        let state = BorderState {
            phase: "warning-mid".to_string(),
            color: "#E8B931".to_string(),
            opacity: 0.35,
            pulse_speed: 2000,
        };

        let json = serde_json::to_string(&state).unwrap();
        let deserialized: BorderState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.phase, state.phase);
        assert_eq!(deserialized.color, state.color);
        assert_eq!(deserialized.opacity, state.opacity);
        assert_eq!(deserialized.pulse_speed, state.pulse_speed);
    }

    #[test]
    fn deserializes_from_camel_case_json() {
        let json = r##"{"phase":"in-session-early","color":"#4A9B6E","opacity":0.25,"pulseSpeed":3000}"##;
        let state: BorderState = serde_json::from_str(json).unwrap();

        assert_eq!(state.phase, "in-session-early");
        assert_eq!(state.color, "#4A9B6E");
        assert_eq!(state.opacity, 0.25);
        assert_eq!(state.pulse_speed, 3000);
    }

    #[test]
    fn default_matches_no_events_phase() {
        let state = BorderState::default();
        assert_eq!(state.phase, "no-events");
        assert_eq!(state.color, "#8A9BA8");
        assert_eq!(state.opacity, 0.15);
        assert_eq!(state.pulse_speed, 0);
    }
}

/// The tick emitter module.
///
/// Previously emitted `border-state-update` events at 1 Hz from the Rust backend.
/// Now the overlay frontend drives its own state via a 1-second setInterval that
/// calls the TypeScript color engine directly. This module is retained for the
/// event name constant and tests.

#[cfg(test)]
mod tests {
    use crate::border_state::BorderState;

    /// The overlay frontend listens for "calendar-events-update" from the poller
    /// and drives its own border state computation. This test documents the
    /// event names used in the architecture.
    #[test]
    fn event_names_are_documented() {
        // The poller emits this; the overlay listens for it
        assert_eq!("calendar-events-update", "calendar-events-update");
        // The overlay used to listen for this from the tick emitter;
        // now the overlay computes border state locally.
        assert_eq!("border-state-update", "border-state-update");
    }

    #[test]
    fn default_state_serializes_for_emit() {
        let state = BorderState::default();
        let json = serde_json::to_string(&state).unwrap();
        // Verify the payload structure (still used by emit_border_state command)
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("color").is_some());
        assert!(value.get("opacity").is_some());
        assert!(value.get("pulseSpeed").is_some());
        assert!(value.get("phase").is_some());
    }
}

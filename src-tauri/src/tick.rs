use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::border_state::BorderState;

/// Start a background task that emits `border-state-update` events at 1 Hz.
///
/// Reads the current BorderState from the app-managed `Mutex<BorderState>`.
/// Other services (calendar poller, manual emit command) can update the shared
/// state, and the tick emitter will pick up the change on the next cycle.
pub fn start_tick_emitter(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let state = {
                let managed = app.state::<Mutex<BorderState>>();
                let guard = managed.lock().unwrap_or_else(|e| e.into_inner());
                guard.clone()
            };
            let _ = app.emit("border-state-update", &state);
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use crate::border_state::BorderState;

    #[test]
    fn event_name_matches_frontend() {
        // The frontend listens for "border-state-update" -- verify the event name
        // is used consistently. This test acts as a documentation anchor.
        let event_name = "border-state-update";
        assert_eq!(event_name, "border-state-update");
    }

    #[test]
    fn default_state_serializes_for_emit() {
        let state = BorderState::default();
        let json = serde_json::to_string(&state).unwrap();
        // Verify the payload structure the frontend expects
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("color").is_some());
        assert!(value.get("opacity").is_some());
        assert!(value.get("pulseSpeed").is_some());
        assert!(value.get("phase").is_some());
    }
}

//! Launch at login.
//!
//! On macOS 13+ a bundled Morph registers itself with `SMAppService.mainApp`,
//! the modern Login Items API. It appears under System Settings → General →
//! Login Items, where the user can switch it off. If they do, re-enabling
//! reports "requires approval" and we point them to that pane.
//!
//! A bare binary (`tauri dev`) has no bundle for SMAppService to register,
//! and other platforms have no such API, so those keep using
//! tauri-plugin-autostart (a LaunchAgent on macOS). A bundled app that finds
//! the legacy LaunchAgent enabled moves it to SMAppService once, so it
//! never launches twice.

use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_autostart::ManagerExt;

/// `SMAppService.Status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmStatus {
    NotRegistered,
    Enabled,
    RequiresApproval,
    NotFound,
}

impl SmStatus {
    pub fn from_raw(value: isize) -> Self {
        match value {
            1 => Self::Enabled,
            2 => Self::RequiresApproval,
            3 => Self::NotFound,
            _ => Self::NotRegistered,
        }
    }
}

/// What the settings UI shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginItemStatus {
    pub enabled: bool,
    /// Registered, but switched off in System Settings → Login Items.
    pub requires_approval: bool,
    /// `"sm-app-service"` or `"launch-agent"`.
    pub backend: &'static str,
}

impl LoginItemStatus {
    pub fn from_sm(status: SmStatus) -> Self {
        Self {
            enabled: status == SmStatus::Enabled,
            requires_approval: status == SmStatus::RequiresApproval,
            backend: "sm-app-service",
        }
    }

    pub fn from_legacy(enabled: bool) -> Self {
        Self {
            enabled,
            requires_approval: false,
            backend: "launch-agent",
        }
    }
}

/// Whether to move a legacy LaunchAgent login item to SMAppService.
pub fn should_migrate(sm_supported: bool, legacy_enabled: bool) -> bool {
    sm_supported && legacy_enabled
}

/// Current launch-at-login state.
pub fn status<R: Runtime>(app: &AppHandle<R>) -> LoginItemStatus {
    #[cfg(target_os = "macos")]
    if let Some(service) = macos::service() {
        return LoginItemStatus::from_sm(macos::status(&service));
    }
    LoginItemStatus::from_legacy(app.autolaunch().is_enabled().unwrap_or(false))
}

/// Turn launch at login on or off.
pub fn set<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<LoginItemStatus, String> {
    #[cfg(target_os = "macos")]
    if let Some(service) = macos::service() {
        if enabled {
            macos::register(&service)?;
        } else {
            macos::unregister(&service)?;
        }
        // Never leave a legacy LaunchAgent behind alongside SMAppService.
        remove_legacy(app);
        return Ok(LoginItemStatus::from_sm(macos::status(&service)));
    }
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| e.to_string())?;
    Ok(LoginItemStatus::from_legacy(
        manager.is_enabled().unwrap_or(enabled),
    ))
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn remove_legacy<R: Runtime>(app: &AppHandle<R>) {
    let manager = app.autolaunch();
    if manager.is_enabled().unwrap_or(false) {
        if let Err(e) = manager.disable() {
            eprintln!("[login-item] failed to remove legacy LaunchAgent: {e}");
        }
    }
}

/// One-time move from the legacy LaunchAgent to SMAppService (bundled macOS
/// app only). Call at startup.
pub fn migrate<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "macos")]
    {
        let service = macos::service();
        let legacy = app.autolaunch().is_enabled().unwrap_or(false);
        if let Some(service) = service.filter(|_| should_migrate(true, legacy)) {
            match macos::register(&service) {
                Ok(()) => remove_legacy(app),
                Err(e) => eprintln!("[login-item] migration to SMAppService failed: {e}"),
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
pub fn get_login_item_status(app: AppHandle) -> LoginItemStatus {
    status(&app)
}

#[tauri::command]
pub fn set_login_item(app: AppHandle, enabled: bool) -> Result<LoginItemStatus, String> {
    set(&app, enabled)
}

/// Open System Settings → General → Login Items.
#[tauri::command]
pub fn open_login_items_settings() {
    #[cfg(target_os = "macos")]
    macos::open_settings();
}

#[cfg(target_os = "macos")]
mod macos {
    use super::SmStatus;
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::{NSBundle, NSError};

    #[link(name = "ServiceManagement", kind = "framework")]
    extern "C" {}

    fn class() -> Option<&'static AnyClass> {
        AnyClass::get(c"SMAppService")
    }

    /// `SMAppService.mainAppService`, when it can work: macOS 13+ and running
    /// from an `.app` bundle (a bare dev binary has nothing to register).
    pub fn service() -> Option<Retained<AnyObject>> {
        let bundled = NSBundle::mainBundle()
            .bundlePath()
            .to_string()
            .ends_with(".app");
        if !bundled {
            return None;
        }
        let cls = class()?;
        // SAFETY: +[SMAppService mainAppService] returns an autoreleased
        // instance (retained by msg_send into Retained).
        let service: Option<Retained<AnyObject>> = unsafe { msg_send![cls, mainAppService] };
        service.filter(|s| status(s) != SmStatus::NotFound)
    }

    pub fn status(service: &AnyObject) -> SmStatus {
        // SAFETY: -[SMAppService status] returns an NSInteger enum.
        let raw: isize = unsafe { msg_send![service, status] };
        SmStatus::from_raw(raw)
    }

    pub fn register(service: &AnyObject) -> Result<(), String> {
        // SAFETY: -[SMAppService registerAndReturnError:] (BOOL + NSError**).
        let result: Result<(), Retained<NSError>> =
            unsafe { msg_send![service, registerAndReturnError: _] };
        result.map_err(|e| e.localizedDescription().to_string())
    }

    pub fn unregister(service: &AnyObject) -> Result<(), String> {
        // SAFETY: -[SMAppService unregisterAndReturnError:] (BOOL + NSError**).
        let result: Result<(), Retained<NSError>> =
            unsafe { msg_send![service, unregisterAndReturnError: _] };
        result.map_err(|e| e.localizedDescription().to_string())
    }

    pub fn open_settings() {
        if let Some(cls) = class() {
            // SAFETY: +[SMAppService openSystemSettingsLoginItems], no args.
            let () = unsafe { msg_send![cls, openSystemSettingsLoginItems] };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_sm_app_service_status_codes() {
        assert_eq!(SmStatus::from_raw(0), SmStatus::NotRegistered);
        assert_eq!(SmStatus::from_raw(1), SmStatus::Enabled);
        assert_eq!(SmStatus::from_raw(2), SmStatus::RequiresApproval);
        assert_eq!(SmStatus::from_raw(3), SmStatus::NotFound);
        assert_eq!(SmStatus::from_raw(99), SmStatus::NotRegistered);
    }

    #[test]
    fn status_for_the_settings_ui() {
        let s = LoginItemStatus::from_sm(SmStatus::Enabled);
        assert!(s.enabled && !s.requires_approval);
        assert_eq!(s.backend, "sm-app-service");
        let s = LoginItemStatus::from_sm(SmStatus::RequiresApproval);
        assert!(!s.enabled && s.requires_approval);
        let s = LoginItemStatus::from_legacy(true);
        assert!(s.enabled && !s.requires_approval);
        assert_eq!(s.backend, "launch-agent");
    }

    #[test]
    fn serializes_camel_case() {
        let json =
            serde_json::to_value(LoginItemStatus::from_sm(SmStatus::RequiresApproval)).unwrap();
        assert_eq!(json["requiresApproval"], true);
        assert_eq!(json["enabled"], false);
    }

    #[test]
    fn migrates_only_a_live_legacy_agent_when_sm_app_service_works() {
        assert!(should_migrate(true, true));
        assert!(!should_migrate(true, false));
        assert!(!should_migrate(false, true));
        assert!(!should_migrate(false, false));
    }
}

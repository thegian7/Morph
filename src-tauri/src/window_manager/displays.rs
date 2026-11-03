//! Stable display identities and the per-display on/off setting.
//!
//! Platform-independent so it can be unit-tested anywhere.

/// Hardware identity of a display (CoreGraphics vendor / model / serial).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DisplayHardware {
    pub vendor: u32,
    pub model: u32,
    pub serial: u32,
}

/// Stable IDs for a list of displays, in the same order.
///
/// Based on vendor/model/serial so an ID survives rearranging displays,
/// unplugging and re-plugging, and reboots (unlike screen-position IDs).
/// Identical monitors that report the same serial (often 0) get `-2`, `-3`…
/// suffixes in list order.
pub fn stable_ids(displays: &[DisplayHardware]) -> Vec<String> {
    let mut out: Vec<String> = Vec::with_capacity(displays.len());
    for d in displays {
        let base = format!("display-{:x}-{:x}-{:x}", d.vendor, d.model, d.serial);
        let dupes = out
            .iter()
            .filter(|id| *id == &base || id.starts_with(&format!("{base}-")))
            .count();
        out.push(if dupes == 0 {
            base
        } else {
            format!("{base}-{}", dupes + 1)
        });
    }
    out
}

/// Parse the `disabled_displays` setting (a JSON array of display IDs).
/// Anything malformed means "none disabled", so the border never silently
/// vanishes because of a bad value.
pub fn parse_disabled(value: Option<&str>) -> Vec<String> {
    value
        .and_then(|v| serde_json::from_str::<Vec<String>>(v).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUILTIN: DisplayHardware = DisplayHardware {
        vendor: 0x610,
        model: 0xa04f,
        serial: 0,
    };
    const DELL: DisplayHardware = DisplayHardware {
        vendor: 0x10ac,
        model: 0x42f5,
        serial: 0x3132_4c50,
    };

    #[test]
    fn ids_come_from_hardware_identity() {
        assert_eq!(
            stable_ids(&[BUILTIN, DELL]),
            vec!["display-610-a04f-0", "display-10ac-42f5-31324c50"]
        );
    }

    #[test]
    fn ids_do_not_depend_on_order_for_distinct_displays() {
        let a = stable_ids(&[BUILTIN, DELL]);
        let b = stable_ids(&[DELL, BUILTIN]);
        assert_eq!(a[0], b[1]);
        assert_eq!(a[1], b[0]);
    }

    #[test]
    fn identical_monitors_get_suffixes() {
        let twin = DisplayHardware {
            vendor: 1,
            model: 2,
            serial: 0,
        };
        assert_eq!(
            stable_ids(&[twin, BUILTIN, twin, twin]),
            vec![
                "display-1-2-0",
                "display-610-a04f-0",
                "display-1-2-0-2",
                "display-1-2-0-3"
            ]
        );
    }

    #[test]
    fn disabled_setting_parsing_is_forgiving() {
        assert_eq!(parse_disabled(Some(r#"["a","b"]"#)), vec!["a", "b"]);
        assert!(parse_disabled(Some("[]")).is_empty());
        assert!(parse_disabled(Some("not json")).is_empty());
        assert!(parse_disabled(Some(r#"{"a":1}"#)).is_empty());
        assert!(parse_disabled(None).is_empty());
    }
}

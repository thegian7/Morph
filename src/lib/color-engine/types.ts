/**
 * All 13 visual phases of the LightTime ambient border.
 * Each phase maps to a specific color, opacity, and pulse speed.
 */
export type Phase =
  | 'free-deep'
  | 'warning-far'
  | 'warning-mid'
  | 'warning-near'
  | 'warning-imminent'
  | 'in-session-early'
  | 'in-session-mid'
  | 'in-session-late'
  | 'in-session-end'
  | 'overtime'
  | 'gap-short'
  | 'gap-long'
  | 'no-events';

/**
 * Calendar event as received from the Rust backend via Tauri events.
 * Field names use camelCase (serialized from Rust snake_case via serde).
 * Times are ISO 8601 strings to match Tauri's JSON serialization.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  ignored: boolean;
  calendarId?: string;
  providerId: string;
  isAllDay: boolean;
}

/**
 * The computed visual state of the screen border at a given moment.
 * Consumed by the overlay renderer to apply CSS styles.
 */
export interface BorderState {
  color: string; // hex (e.g. "#4A9B6E")
  opacity: number; // 0–1
  pulseSpeed: number; // ms per cycle, 0 = no pulse
  phase: Phase;
}

/** A single entry in a color palette, defining the visual style for one phase. */
export interface PaletteEntry {
  hex: string;
  opacity: number;
  pulseSpeed: number; // 0 = no pulse
}

/** A complete palette mapping every phase to its visual style. */
export type Palette = Record<Phase, PaletteEntry>;

/** User-configurable intensity level that scales opacity values. */
export type Intensity = 'subtle' | 'normal' | 'vivid';

/** Which named palette to use. */
export type PaletteName = 'ambient' | 'ocean';

/** Which screen edges display the border. */
export type BorderPosition = 'all' | 'top' | 'sides' | 'bottom';

/** Border thickness preset. */
export type BorderThickness = 'thin' | 'medium' | 'thick';

/** User-configurable settings that affect color engine output. */
export interface UserSettings {
  /** Warning thresholds in minutes before an event (sorted descending). */
  warningWindows: number[];
  intensity: Intensity;
  palette: PaletteName;
  borderThickness: BorderThickness;
  borderPosition: BorderPosition;
}

/** Default user settings. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  warningWindows: [30, 15, 5, 2],
  intensity: 'normal',
  palette: 'ambient',
  borderThickness: 'medium',
  borderPosition: 'all',
};

/** Opacity multipliers for each intensity level. */
export const INTENSITY_MULTIPLIERS: Record<Intensity, number> = {
  subtle: 0.6,
  normal: 1.0,
  vivid: 1.4,
};

/** Maximum opacity after intensity scaling (vivid is capped here). */
export const MAX_OPACITY = 0.95;

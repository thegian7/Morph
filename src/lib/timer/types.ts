/** Possible timer statuses. */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'stopped';

/** Serializable timer state. All dates are ISO 8601 strings. */
export interface TimerState {
  status: TimerStatus;
  durationSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
  /** Seconds of elapsed time accumulated before the current (or most recent) pause. */
  elapsedBeforePause: number;
}

/** Actions that can be dispatched to the timer state machine. */
export type TimerAction =
  | { type: 'start'; durationSeconds: number; now: string }
  | { type: 'pause'; now: string }
  | { type: 'resume'; now: string }
  | { type: 'stop' }
  | { type: 'reset' };

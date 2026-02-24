import { useState, useEffect, useCallback } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { getDefaultPresets } from '@/lib/timer/presets';
import { getRemainingSeconds } from '@/lib/timer/index';
import type { TimerState, TimerPreset } from '@/lib/timer/types';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(seconds / 60)}m`;
}

export default function TimerTab() {
  const presets = getDefaultPresets();
  const [timer, setTimer] = useState<TimerState>({
    status: 'idle',
    durationSeconds: 0,
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
  });
  const [remaining, setRemaining] = useState(0);

  // Listen for timer state updates from the backend
  useEffect(() => {
    const unlisten = listen<TimerState>('timer-state-update', (event) => {
      setTimer(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Update remaining time every second when running
  useEffect(() => {
    if (timer.status !== 'running') {
      if (timer.status === 'paused') {
        setRemaining(getRemainingSeconds(timer, new Date()));
      }
      return;
    }

    function tick() {
      setRemaining(getRemainingSeconds(timer, new Date()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const isActive = timer.status === 'running' || timer.status === 'paused';
  const progress =
    timer.durationSeconds > 0 ? Math.max(0, Math.min(1, 1 - remaining / timer.durationSeconds)) : 0;

  const handleStart = useCallback((preset: TimerPreset) => {
    emit('start-timer', preset.durationSeconds);
  }, []);

  const handleStop = useCallback(() => {
    emit('stop-timer', {});
    setTimer({
      status: 'idle',
      durationSeconds: 0,
      startedAt: null,
      pausedAt: null,
      elapsedBeforePause: 0,
    });
    setRemaining(0);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">Timer</h2>
        <p className="text-sm text-gray-500 mb-6">
          Start a focus timer. The border overlay will reflect the timer's progress.
        </p>
      </div>

      {/* Active Timer Display */}
      {isActive && (
        <section className="bg-gray-50 rounded-lg p-6">
          <div className="text-center">
            <p className="text-4xl font-mono font-bold text-gray-900 mb-2">
              {formatTime(remaining)}
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {timer.status === 'paused' ? 'Paused' : 'Running'}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={handleStop}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Preset List */}
      <section>
        <p className="text-sm font-medium text-gray-900 mb-3">Quick Start</p>
        <div className="grid grid-cols-2 gap-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleStart(preset)}
              disabled={isActive}
              className={`p-4 rounded-lg border text-left transition-colors ${
                isActive
                  ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <p className="text-sm font-medium text-inherit">{preset.name}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDuration(preset.durationSeconds)}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

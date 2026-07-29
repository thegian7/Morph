import { useState } from 'react';
import { Button } from '@/shared/components';

interface WelcomeTabProps {
  onGoToCalendar: () => void;
  onComplete: () => void;
}

const STEPS = [
  { id: 1, title: 'What is Morph?' },
  { id: 2, title: 'Connect your calendar' },
  { id: 3, title: 'What the colors mean' },
  { id: 4, title: "You're all set" },
] as const;

const COLOR_PHASES = [
  {
    situation: 'Nothing for 60+ min',
    color: 'bg-green-400',
    label: 'Green',
    feel: 'Deep focus zone',
  },
  {
    situation: 'Meeting in ~30 min',
    color: 'bg-green-400',
    label: 'Soft green',
    feel: 'Subconscious nudge',
  },
  {
    situation: 'Meeting in ~15 min',
    color: 'bg-yellow-400',
    label: 'Yellow-green',
    feel: 'Body starts preparing',
  },
  {
    situation: 'Meeting in ~5 min',
    color: 'bg-amber-400',
    label: 'Warm amber',
    feel: 'Time to wrap up',
  },
  {
    situation: 'Meeting in ~2 min',
    color: 'bg-orange-400',
    label: 'Orange',
    feel: 'Transition imminent',
  },
  {
    situation: 'In a meeting (early)',
    color: 'bg-green-500',
    label: 'Calm green',
    feel: 'Settled in',
  },
  {
    situation: 'In a meeting (late)',
    color: 'bg-purple-400',
    label: 'Soft purple',
    feel: 'Approaching the end',
  },
  { situation: 'Overtime', color: 'bg-purple-600', label: 'Deep purple', feel: "Time's up" },
];

export default function WelcomeTab({ onGoToCalendar, onComplete }: WelcomeTabProps) {
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-6 max-w-lg">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-2">
        {STEPS.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
              style={{
                backgroundColor:
                  step === s.id
                    ? 'var(--color-primary)'
                    : step > s.id
                      ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                      : 'var(--color-surface-overlay)',
                color:
                  step === s.id
                    ? '#ffffff'
                    : step > s.id
                      ? 'var(--color-primary)'
                      : 'var(--color-text-muted)',
                transition: 'var(--transition-fast)',
              }}
            >
              {step > s.id ? '\u2713' : s.id}
            </div>
            {s.id < STEPS.length && (
              <div
                className="w-8 h-0.5"
                style={{
                  backgroundColor:
                    step > s.id
                      ? 'color-mix(in srgb, var(--color-primary) 40%, transparent)'
                      : 'var(--color-border)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Welcome to Morph</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Morph paints a subtle, color-changing border around your screen based on your calendar.
            Green when you have space. Amber when a meeting is approaching. Purple when time's up.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            No alarms. No pop-ups. Just color in your peripheral vision — the way your brain
            processes time best.
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Let's get you set up in about 30 seconds.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Connect your calendar</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Morph reads your upcoming events to decide which color to show. Connect Google Calendar
            or Microsoft 365 to get started.
          </p>

          <Button variant="primary" onClick={onGoToCalendar}>
            Go to Calendar settings
          </Button>

          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-amber) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-amber) 35%, transparent)',
            }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              Google users: "unverified app" warning
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Google will show a warning that Morph is "not verified." This is normal for beta apps
              and does not mean it's unsafe. To continue: click <strong>Advanced</strong>, then{' '}
              <strong>Go to Morph (unsafe)</strong>. Morph only reads your calendar event times and
              titles — nothing else.
            </p>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            You can also skip this and connect a calendar later from the Calendar tab.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">What the colors mean</h2>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Colors shift gradually — your brain absorbs the change without ever having to "check the
            time."
          </p>

          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--color-surface-overlay)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Color</th>
                  <th className="text-left px-3 py-2 font-medium">You feel</th>
                </tr>
              </thead>
              <tbody>
                {COLOR_PHASES.map((phase, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor:
                        i % 2 === 0
                          ? 'var(--color-surface-raised)'
                          : 'var(--color-surface-overlay)',
                    }}
                  >
                    <td className="px-3 py-1.5" style={{ color: 'var(--color-text)' }}>
                      {phase.situation}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-full ${phase.color}`} />
                        <span style={{ color: 'var(--color-text-secondary)' }}>{phase.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      {phase.feel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">You're all set</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Morph is running in your menu bar. The border will appear automatically based on your
            calendar events.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            You can adjust border thickness, color palette, and more from these settings at any
            time. Right-click the menu bar icon to access quick controls.
          </p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          style={{ opacity: step === 1 ? 0.4 : 1, cursor: step === 1 ? 'default' : 'pointer' }}
        >
          Back
        </Button>

        {step < 4 ? (
          <Button variant="primary" onClick={() => setStep((s) => Math.min(4, s + 1))}>
            Next
          </Button>
        ) : (
          <Button variant="primary" onClick={onComplete}>
            Get started
          </Button>
        )}
      </div>
    </div>
  );
}

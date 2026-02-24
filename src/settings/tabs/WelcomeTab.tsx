import { useState } from 'react';

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
  { situation: 'Nothing for 60+ min', color: 'bg-green-400', label: 'Green', feel: 'Deep focus zone' },
  { situation: 'Meeting in ~30 min', color: 'bg-green-400', label: 'Soft green', feel: 'Subconscious nudge' },
  { situation: 'Meeting in ~15 min', color: 'bg-yellow-400', label: 'Yellow-green', feel: 'Body starts preparing' },
  { situation: 'Meeting in ~5 min', color: 'bg-amber-400', label: 'Warm amber', feel: 'Time to wrap up' },
  { situation: 'Meeting in ~2 min', color: 'bg-orange-400', label: 'Orange', feel: 'Transition imminent' },
  { situation: 'In a meeting (early)', color: 'bg-green-500', label: 'Calm green', feel: 'Settled in' },
  { situation: 'In a meeting (late)', color: 'bg-purple-400', label: 'Soft purple', feel: 'Approaching the end' },
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
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s.id
                  ? 'bg-blue-500 text-white'
                  : step > s.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.id ? '\u2713' : s.id}
            </div>
            {s.id < STEPS.length && (
              <div className={`w-8 h-0.5 ${step > s.id ? 'bg-blue-200' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Welcome to Morph</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Morph paints a subtle, color-changing border around your screen based on
            your calendar. Green when you have space. Amber when a meeting is
            approaching. Purple when time's up.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            No alarms. No pop-ups. Just color in your peripheral vision — the way your
            brain processes time best.
          </p>
          <p className="text-sm text-gray-500">
            Let's get you set up in about 30 seconds.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Connect your calendar</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Morph reads your upcoming events to decide which color to show. Connect
            Google Calendar or Microsoft 365 to get started.
          </p>

          <button
            onClick={onGoToCalendar}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
          >
            Go to Calendar settings
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 mb-1">
              Google users: "unverified app" warning
            </p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Google will show a warning that Morph is "not verified." This is
              normal for beta apps and does not mean it's unsafe.
              To continue: click <strong>Advanced</strong>, then{' '}
              <strong>Go to Morph (unsafe)</strong>. Morph only reads your calendar
              event times and titles — nothing else.
            </p>
          </div>

          <p className="text-xs text-gray-400">
            You can also skip this and connect a calendar later from the Calendar tab.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">What the colors mean</h2>
          <p className="text-sm text-gray-600 mb-3">
            Colors shift gradually — your brain absorbs the change without ever having
            to "check the time."
          </p>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Color</th>
                  <th className="text-left px-3 py-2 font-medium">You feel</th>
                </tr>
              </thead>
              <tbody>
                {COLOR_PHASES.map((phase, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-700">{phase.situation}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-full ${phase.color}`} />
                        <span className="text-gray-600">{phase.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{phase.feel}</td>
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
          <p className="text-sm text-gray-600 leading-relaxed">
            Morph is running in your menu bar. The border will appear automatically
            based on your calendar events.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            You can adjust border thickness, color palette, and more from these
            settings at any time. Right-click the menu bar icon to access quick
            controls.
          </p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            step === 1
              ? 'text-gray-300 cursor-default'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          disabled={step === 1}
        >
          Back
        </button>

        {step < 4 ? (
          <button
            onClick={() => setStep((s) => Math.min(4, s + 1))}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
          >
            Next
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
          >
            Get started
          </button>
        )}
      </div>
    </div>
  );
}

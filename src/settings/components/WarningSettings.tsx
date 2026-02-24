import { useSettings } from '../hooks/useSettings';

interface WarningThreshold {
  key: string;
  label: string;
  description: string;
}

const WARNING_THRESHOLDS: WarningThreshold[] = [
  {
    key: 'warning_30min',
    label: '30 minutes before',
    description: 'Border begins subtle color shift',
  },
  {
    key: 'warning_15min',
    label: '15 minutes before',
    description: 'Border color becomes more noticeable',
  },
  {
    key: 'warning_5min',
    label: '5 minutes before',
    description: 'Border pulses gently to draw attention',
  },
  {
    key: 'warning_2min',
    label: '2 minutes before',
    description: 'Border enters urgent mode with vivid color',
  },
];

export default function WarningSettings() {
  const { getSetting, setSetting } = useSettings();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Warning Thresholds</h3>
        <p className="text-xs text-gray-500 mt-1">
          Choose when the border starts warning you about upcoming events.
        </p>
      </div>

      <div className="space-y-3">
        {WARNING_THRESHOLDS.map((threshold) => {
          const enabled = getSetting(threshold.key) === 'true';

          return (
            <div key={threshold.key} className="flex items-center justify-between py-2">
              <div className="flex-1 min-w-0 mr-4">
                <span className="text-sm font-medium text-gray-800">{threshold.label}</span>
                <p className="text-xs text-gray-500 mt-0.5">{threshold.description}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`Toggle ${threshold.label}`}
                onClick={() => {
                  setSetting(threshold.key, enabled ? 'false' : 'true');
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  enabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useSettings } from '../hooks/useSettings';

interface WarningSettingsProps {
  isPro?: boolean;
}

interface WarningThreshold {
  key: string;
  label: string;
  description: string;
  proOnly: boolean;
}

const WARNING_THRESHOLDS: WarningThreshold[] = [
  {
    key: 'warning_30min',
    label: '30 minutes before',
    description: 'Border begins subtle color shift',
    proOnly: true,
  },
  {
    key: 'warning_15min',
    label: '15 minutes before',
    description: 'Border color becomes more noticeable',
    proOnly: true,
  },
  {
    key: 'warning_5min',
    label: '5 minutes before',
    description: 'Border pulses gently to draw attention',
    proOnly: false,
  },
  {
    key: 'warning_2min',
    label: '2 minutes before',
    description: 'Border enters urgent mode with vivid color',
    proOnly: false,
  },
];

export default function WarningSettings({ isPro = false }: WarningSettingsProps) {
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
          const disabled = threshold.proOnly && !isPro;

          return (
            <div
              key={threshold.key}
              className="flex items-center justify-between py-2"
            >
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {threshold.label}
                  </span>
                  {threshold.proOnly && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700">
                      Pro
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {threshold.description}
                </p>
                {disabled && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Upgrade to Pro to enable this threshold
                  </p>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`Toggle ${threshold.label}`}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    setSetting(threshold.key, enabled ? 'false' : 'true');
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  enabled ? 'bg-blue-500' : 'bg-gray-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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

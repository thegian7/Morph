import { useSettings } from '../hooks/useSettings';
import { Toggle, SectionHeader } from '@/shared/components';

interface WarningThreshold {
  key: string;
  label: string;
  description: string;
}

const WARNING_THRESHOLDS: WarningThreshold[] = [
  {
    key: 'warning_30min',
    label: '30 minutes',
    description: 'Border begins subtle color shift',
  },
  {
    key: 'warning_15min',
    label: '15 minutes',
    description: 'Border color becomes more noticeable',
  },
  {
    key: 'warning_5min',
    label: '5 minutes',
    description: 'Border pulses gently to draw attention',
  },
  {
    key: 'warning_2min',
    label: '2 minutes',
    description: 'Border enters urgent mode with vivid color',
  },
];

export default function AlertsTab() {
  const { getSetting, setSetting } = useSettings();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <SectionHeader
        title="Alerts"
        description="The border shifts color as events approach, giving you ambient awareness without interruption."
      />

      <section>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Warning Thresholds
        </p>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-4)',
          }}
        >
          Choose when the border starts warning you about upcoming events.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {WARNING_THRESHOLDS.map((threshold) => {
            const enabled = getSetting(threshold.key) === 'true';
            return (
              <div key={threshold.key}>
                <Toggle
                  label={threshold.label}
                  checked={enabled}
                  onChange={(checked) => setSetting(threshold.key, checked ? 'true' : 'false')}
                />
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--space-1)',
                    paddingLeft: 0,
                  }}
                >
                  {threshold.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

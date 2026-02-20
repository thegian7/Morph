import { useSettings } from '../hooks/useSettings';

const THICKNESS_OPTIONS = [
  { value: 'thin', label: 'Thin', barWidth: 'w-0.5' },
  { value: 'medium', label: 'Medium', barWidth: 'w-1.5' },
  { value: 'thick', label: 'Thick', barWidth: 'w-3' },
] as const;

const POSITION_OPTIONS = [
  { value: 'all', label: 'All Edges' },
  { value: 'top', label: 'Top Only' },
  { value: 'sides', label: 'Sides Only' },
  { value: 'bottom', label: 'Bottom Only' },
] as const;

const PALETTE_OPTIONS = [
  {
    value: 'ambient',
    label: 'Ambient',
    description: 'Green \u2192 yellow \u2192 orange \u2192 purple',
    colors: ['#22c55e', '#eab308', '#f97316', '#a855f7'],
  },
  {
    value: 'ocean',
    label: 'Ocean',
    description: 'Blue \u2192 orange (colorblind-accessible)',
    colors: ['#3b82f6', '#60a5fa', '#f59e0b', '#f97316'],
  },
] as const;

const INTENSITY_OPTIONS = [
  { value: 'subtle', label: 'Subtle', description: '0.6\u00d7 opacity \u2014 bright environments' },
  { value: 'normal', label: 'Normal', description: '1.0\u00d7 \u2014 default' },
  { value: 'vivid', label: 'Vivid', description: '1.4\u00d7 intensity \u2014 dark environments' },
] as const;

const DEFAULTS = {
  border_thickness: 'medium',
  border_position: 'all',
  color_palette: 'ambient',
  color_intensity: 'normal',
} as const;

function PositionDiagram({ position }: { position: string }) {
  const active = 'bg-blue-500';
  const inactive = 'bg-gray-200';

  return (
    <div className="w-8 h-6 border border-gray-300 rounded-sm relative overflow-hidden">
      {/* Top */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 ${position === 'all' || position === 'top' ? active : inactive}`}
      />
      {/* Bottom */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-0.5 ${position === 'all' || position === 'bottom' ? active : inactive}`}
      />
      {/* Left */}
      <div
        className={`absolute top-0 left-0 bottom-0 w-0.5 ${position === 'all' || position === 'sides' ? active : inactive}`}
      />
      {/* Right */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-0.5 ${position === 'all' || position === 'sides' ? active : inactive}`}
      />
    </div>
  );
}

export default function BorderTab() {
  const { getSetting, setSetting } = useSettings();

  const thickness = getSetting('border_thickness') ?? 'medium';
  const position = getSetting('border_position') ?? 'all';
  const palette = getSetting('color_palette') ?? 'ambient';
  const intensity = getSetting('color_intensity') ?? 'normal';

  const selectedClasses = 'ring-2 ring-blue-500 border-blue-500 bg-blue-50';
  const unselectedClasses = 'border-gray-200 hover:border-gray-300';

  function resetToDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      setSetting(key, value);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">Border Settings</h2>
        <p className="text-sm text-gray-500 mb-6">
          Customize how the ambient border appears on your screen.
        </p>
      </div>

      {/* Thickness */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Thickness</h3>
        <div className="flex gap-3">
          {THICKNESS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSetting('border_thickness', opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                thickness === opt.value ? selectedClasses : unselectedClasses
              }`}
            >
              <div className={`h-5 ${opt.barWidth} bg-gray-700 rounded-full`} />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Position */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Position</h3>
        <div className="flex gap-3">
          {POSITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSetting('border_position', opt.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                position === opt.value ? selectedClasses : unselectedClasses
              }`}
            >
              <PositionDiagram position={opt.value} />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Color Palette */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Color Palette</h3>
        <div className="flex gap-3">
          {PALETTE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSetting('color_palette', opt.value)}
              className={`flex flex-col items-start gap-2 px-4 py-3 rounded-lg border text-sm ${
                palette === opt.value ? selectedClasses : unselectedClasses
              }`}
            >
              <div className="flex gap-1">
                {opt.colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-gray-500">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Intensity */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Intensity</h3>
        <div className="flex gap-3">
          {INTENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSetting('color_intensity', opt.value)}
              className={`flex flex-col items-start px-4 py-2 rounded-lg border text-sm ${
                intensity === opt.value ? selectedClasses : unselectedClasses
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-gray-500">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Reset */}
      <section>
        <button
          onClick={resetToDefaults}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Reset to Defaults
        </button>
      </section>
    </div>
  );
}

import React from 'react';

interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

export function Slider({ min, max, step = 1, value, onChange, label }: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </div>
  );
}

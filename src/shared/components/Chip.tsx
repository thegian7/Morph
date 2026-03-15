import React from 'react';

interface ChipProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function Chip({ label, selected, onSelect }: ChipProps) {
  return (
    <button
      onClick={onSelect}
      className="px-3 py-1.5 rounded-full font-medium cursor-pointer"
      style={{
        fontSize: 'var(--text-sm)',
        backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-surface-overlay)',
        color: selected ? '#FFFFFF' : 'var(--color-text)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        transition: 'var(--transition-fast)',
      }}
    >
      {label}
    </button>
  );
}

import React from 'react';

interface ChipProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function Chip({ label, selected, onSelect }: ChipProps) {
  return (
    <button onClick={onSelect} className={`chip ${selected ? 'chip-selected' : ''}`}>
      {label}
    </button>
  );
}

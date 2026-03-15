import React from 'react';

interface BadgeProps {
  color: string;
  text: string;
}

export function Badge({ color, text }: BadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ fontSize: 'var(--text-xs)' }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
    </span>
  );
}

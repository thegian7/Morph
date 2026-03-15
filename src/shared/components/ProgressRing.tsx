import React from 'react';

interface ProgressRingProps {
  progress: number; // 0-1
  size: number;
  strokeWidth?: number;
  color?: string;
}

export function ProgressRing({ progress, size, strokeWidth = 3, color }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const progressColor = color ?? (progress < 0.7 ? 'var(--color-primary)' : 'var(--color-amber)');

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={progressColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
      />
    </svg>
  );
}

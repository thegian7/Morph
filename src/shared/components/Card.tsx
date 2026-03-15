import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function Card({ children, className = '', onClick, selected }: CardProps) {
  return (
    <div
      className={`rounded-xl p-4 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--color-surface-raised)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        transition: 'var(--transition-fast)',
      }}
    >
      {children}
    </div>
  );
}

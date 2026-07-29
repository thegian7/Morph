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
      className={`card ${onClick ? 'card-clickable' : ''} ${selected ? 'card-selected' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

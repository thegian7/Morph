import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  title: string;
}

export function IconButton({ children, title, className = '', ...props }: IconButtonProps) {
  return (
    <button
      className={`p-2 rounded-lg cursor-pointer ${className}`}
      title={title}
      style={{
        color: 'var(--color-text-secondary)',
        transition: 'var(--transition-fast)',
      }}
      {...props}
    >
      {children}
    </button>
  );
}

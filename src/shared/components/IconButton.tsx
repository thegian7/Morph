import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  title: string;
}

export function IconButton({ children, title, className = '', ...props }: IconButtonProps) {
  return (
    <button className={`icon-btn ${className}`} title={title} {...props}>
      {children}
    </button>
  );
}

import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="mb-4">
      <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text)', fontWeight: 600 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
          {description}
        </p>
      )}
    </div>
  );
}

import React, { useRef, useEffect } from 'react';

interface MiniPreviewProps {
  borderState: { color: string; opacity: number; pulseSpeed: number };
  position: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  thickness: number;
}

export function MiniPreview({ borderState, position, thickness }: MiniPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, 200, 120);

      // Screen outline
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 10, 160, 100);

      // Scaled border thickness (map 8-28px real to 2-8px preview)
      const scaledThickness = Math.max(2, Math.round((thickness / 28) * 8));

      // Compute pulse opacity
      let opacity = borderState.opacity;
      if (borderState.pulseSpeed > 0) {
        const cycle = (timestamp % borderState.pulseSpeed) / borderState.pulseSpeed;
        const pulse = Math.sin(cycle * Math.PI * 2) * 0.15;
        opacity = Math.max(0, Math.min(0.95, opacity + pulse));
      }

      ctx.globalAlpha = opacity;
      ctx.fillStyle = borderState.color;

      if (position.top) ctx.fillRect(20, 10, 160, scaledThickness);
      if (position.bottom) ctx.fillRect(20, 110 - scaledThickness, 160, scaledThickness);
      if (position.left) ctx.fillRect(20, 10, scaledThickness, 100);
      if (position.right) ctx.fillRect(180 - scaledThickness, 10, scaledThickness, 100);

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [borderState, position, thickness]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      className="rounded-lg"
      style={{ backgroundColor: 'var(--color-surface-overlay)' }}
    />
  );
}

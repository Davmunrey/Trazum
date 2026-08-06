'use client';

import { cn } from '@/lib/utils';

/**
 * A sheen that travels across the text.
 *
 * react-bits drives this from `useAnimationFrame`, stepping a motion value and
 * writing `background-position` every frame. That is a JavaScript loop running
 * forever for something CSS keyframes do on the compositor, so this is the
 * keyframe version: same look, no frame budget, and it stops dead under
 * `prefers-reduced-motion` via the global rule in `globals.css`.
 *
 * Used once, on the button that is doing work. A sheen that never stops is a
 * distraction; a sheen that means "this is running" is a status.
 */
export interface ShinyTextProps {
  children: React.ReactNode;
  /** Seconds per pass. */
  speed?: number;
  disabled?: boolean;
  className?: string;
}

export function ShinyText({ children, speed = 2.2, disabled = false, className }: ShinyTextProps) {
  if (disabled) return <span className={className}>{children}</span>;

  return (
    <span
      className={cn(
        'inline-block bg-[length:200%_auto] bg-clip-text text-transparent',
        'animate-[trazum-sheen_var(--sheen-speed)_linear_infinite]',
        className,
      )}
      style={
        {
          '--sheen-speed': `${speed}s`,
          backgroundImage:
            'linear-gradient(110deg, currentColor 0%, currentColor 38%, color-mix(in oklab, currentColor 35%, white) 50%, currentColor 62%, currentColor 100%)',
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}

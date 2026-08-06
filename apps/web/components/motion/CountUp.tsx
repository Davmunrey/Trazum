'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up to its value.
 *
 * The API is react-bits' `CountUp`, deliberately: same prop names, same
 * behaviour, so this can be swapped for theirs the day the project takes a
 * dependency on `motion`. It does not take one today — the upstream component
 * is built on `useSpring`/`useMotionValue`, and one animated integer is not
 * worth 50 KB in an application whose entire backend has zero dependencies.
 * This is `requestAnimationFrame` and an ease-out curve instead.
 *
 * Two things it does that a decorative counter would not:
 *
 * - It **lands on the exact value**. Interpolating and rounding each frame can
 *   finish a pixel short, and the last frame here is the real number rather
 *   than the curve's opinion of it. This component is used on money.
 * - It **is not read aloud while it moves**. Screen readers would otherwise
 *   announce a stream of intermediate figures. The animated digits are hidden
 *   from the accessibility tree and the final value is exposed once, in text.
 */
export interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  startWhen?: boolean;
  /** Rendered instead of the raw number — thousands separators, `$`, `%`. */
  format?: (value: number) => string;
}

/** Fast at first and settling gently, so the figure is readable before it stops. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CountUp({
  to,
  from = 0,
  duration = 0.7,
  delay = 0,
  className,
  startWhen = true,
  format = (value) => String(Math.round(value)),
}: CountUpProps) {
  // Starting at `to` matters for more than the reduced-motion case: it is also
  // what the server renders. Starting at `from` would ship HTML claiming the
  // saving is zero, which is the wrong number to show anyone whose JavaScript
  // is slow, blocked, or turned off.
  const [value, setValue] = useState(to);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!startWhen) return;
    if (prefersReducedMotion() || duration <= 0) {
      setValue(to);
      return;
    }

    const run = () => {
      const started = performance.now();
      const span = duration * 1000;

      const step = (now: number) => {
        const elapsed = now - started;
        if (elapsed >= span) {
          // The exact value, not the curve's last sample.
          setValue(to);
          frame.current = null;
          return;
        }
        setValue(from + (to - from) * easeOut(elapsed / span));
        frame.current = requestAnimationFrame(step);
      };

      setValue(from);
      frame.current = requestAnimationFrame(step);
    };

    if (delay > 0) timer.current = setTimeout(run, delay * 1000);
    else run();

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [to, from, duration, delay, startWhen]);

  return (
    <span className={className}>
      <span aria-hidden="true">{format(value)}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  );
}

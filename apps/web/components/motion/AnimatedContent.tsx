'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Fades and lifts its children into place the first time they are seen.
 *
 * react-bits' `AnimatedContent` with the same props, on an
 * `IntersectionObserver` and a CSS transition rather than GSAP. One entrance
 * animation is not worth an animation runtime.
 *
 * The rule it follows: **content is present before it animates**. The children
 * are always in the DOM and always laid out — the transition only changes
 * opacity and a few pixels of translation. Nothing here gates whether a result
 * exists on whether an observer fired, so a browser that never runs the effect
 * shows the finished state, which is also what the server renders.
 */
export interface AnimatedContentProps {
  children: React.ReactNode;
  /** Pixels to travel. Small on purpose: this is punctuation, not a journey. */
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  delay?: number;
  /**
   * Wait until the element scrolls into view instead of animating on mount.
   *
   * Off by default, and that default is a bug fix rather than a preference.
   * With the observer always on, the results summary rendered *blank*: the
   * reader had scrolled down to reach the Optimise button, so the card mounted
   * above the viewport, the observer reported "not intersecting", and a 214px
   * card sat there at zero opacity until something scrolled it into view. The
   * reveal here is triggered by content arriving, not by scrolling, and the
   * observer was answering a question nobody had asked.
   *
   * Turn it on for content that is below the fold when the page loads.
   */
  onView?: boolean;
  /** Fraction of the element that must be visible before it starts. */
  threshold?: number;
  className?: string;
}

export function AnimatedContent({
  children,
  distance = 12,
  direction = 'vertical',
  reverse = false,
  duration = 0.4,
  delay = 0,
  onView = false,
  threshold = 0.1,
  className,
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Nothing to wait for, or no observer to wait with (old browser, jsdom, a
    // crawler): show it. Failing open is the only acceptable direction when the
    // alternative is invisible content.
    if (!onView || typeof IntersectionObserver === 'undefined') {
      // One frame's grace, so the transition has a "from" state to leave.
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onView, threshold]);

  const axis = direction === 'horizontal' ? 'X' : 'Y';
  const offset = reverse ? -distance : distance;

  return (
    <div
      ref={ref}
      className={cn('will-change-[opacity,transform]', className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translate${axis}(${offset}px)`,
        transition: `opacity ${duration}s ease-out ${delay}s, transform ${duration}s ease-out ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

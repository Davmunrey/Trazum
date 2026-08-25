'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { TOUR_STEPS } from '@/lib/tour';
import type { WebMessages } from '@/lib/i18n';

/**
 * The guided tour's overlay — the 1.73 arc, and deliberately not a library.
 *
 * One dimmed page, one ringed rectangle, one card. The dimming is the ring's
 * own box-shadow spread over the viewport, so there is exactly one moving
 * element to measure and the target stays fully visible inside it. The card
 * carries the step's copy from `t.tour`, next/back, a skip that is always on
 * screen, and the progress count.
 *
 * What it gets right on purpose:
 * - **Never auto-plays.** `App` renders it only after the visitor asked.
 * - **A missing target is a layout, not a crash.** On a phone, or after a
 *   refactor the suite should have caught, the card centres and the ring is
 *   skipped.
 * - **Reduced motion is instant motion.** Scrolling to a target respects
 *   `prefers-reduced-motion`; nothing else here animates at all.
 * - **Escape leaves, focus enters.** The card takes focus on every step so
 *   arrow-less keyboards and screen readers travel with the tour, and the
 *   body is announced politely.
 * - **Nothing fetches**, held by the suite alongside Bill and the playground.
 */

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RING_PADDING = 6;

export function Tour({
  t,
  onTabChange,
  onClose,
}: {
  t: WebMessages;
  /** Opens the tab a step describes — Tabs are controlled by `App`. */
  onTabChange(tab: string): void;
  onClose(): void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const step = TOUR_STEPS[index];
  const copy = t.tour.steps[step.id];

  const measure = useCallback(() => {
    if (step.target === null) {
      setRect(null);
      return;
    }
    const element = document.querySelector(`[data-tour="${step.target}"]`);
    if (element === null) {
      setRect(null);
      return;
    }
    const box = element.getBoundingClientRect();
    // Off-screen or collapsed means the ring would point at nothing readable;
    // the centred card is the honest fallback.
    if (box.width === 0 || box.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [step.target]);

  // Each step: open its tab, let the panel mount, scroll the target into
  // view (instantly for a reader who asked for no motion), then measure.
  useEffect(() => {
    onTabChange(step.tab);
    const frame = requestAnimationFrame(() => {
      const element =
        step.target !== null ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      if (element !== null) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }
      measure();
      cardRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step, onTabChange, measure]);

  // The rectangle is a snapshot of layout, so layout changes re-take it.
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const last = index === TOUR_STEPS.length - 1;

  // The card sits under the ring when there is room, above it otherwise, and
  // centres when there is no ring at all.
  const cardPosition =
    rect === null
      ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
      : rect.top + rect.height + 200 < window.innerHeight
        ? {
            top: rect.top + rect.height + RING_PADDING + 12,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 380)),
          }
        : {
            bottom: window.innerHeight - rect.top + RING_PADDING + 12,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 380)),
          };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.tour.dialogLabel}>
      {/* The dim and the ring are one element: the shadow is the backdrop. */}
      {rect !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg border-2 border-primary"
          style={{
            top: rect.top - RING_PADDING,
            left: rect.left - RING_PADDING,
            width: rect.width + RING_PADDING * 2,
            height: rect.height + RING_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/55" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className="fixed w-[min(360px,calc(100vw-32px))] rounded-lg border bg-background p-4 shadow-lg outline-none"
        style={cardPosition}
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{copy.title}</h2>
          <span className="shrink-0 text-[12px] tabular-nums text-faint">
            {t.tour.progress(index + 1, TOUR_STEPS.length)}
          </span>
        </div>
        <p aria-live="polite" className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {copy.body}
        </p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] text-faint underline-offset-2 hover:underline"
          >
            {t.tour.skip}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="rounded-md border px-3 py-1.5 text-[13px] hover:bg-layer-hover"
              >
                {t.tour.back}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
              className="rounded-md border border-primary bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
            >
              {last ? t.tour.done : t.tour.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

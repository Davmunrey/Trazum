'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { runDemo } from '@/lib/demo';
import type { DemoAction } from '@/lib/demo';
import { TOUR_STEPS } from '@/lib/tour';
import type { WebMessages } from '@/lib/i18n';

/**
 * The guided tour's overlay — the 1.73 arc, polished under Playwright in
 * 1.74.x, and still deliberately not a library.
 *
 * One dimmed page, one ringed rectangle, one card. The dimming is the ring's
 * own box-shadow spread over the viewport, so there is exactly one moving
 * element to measure — and it *glides*: the ring transitions between targets
 * instead of jumping, which is most of what makes a tour feel alive. The
 * global reduced-motion rule turns every transition instant, so nothing here
 * needs its own motion gate beyond the one scroll.
 *
 * What the screenshots taught, kept as law:
 * - **A panel taller than the viewport still gets a ring.** The measured
 *   rectangle is clamped to the viewport before anything is drawn; ringing
 *   the raw rectangle of a tall panel painted the shadow off-screen and the
 *   "dim" vanished entirely.
 * - **The card can never leave the screen.** Its top is clamped into the
 *   viewport whatever the target's shape — the un-clamped card sat off-view
 *   on tall panels and clipped its title on phones.
 * - **The welcome dim is inline style, not a class.** The class form
 *   silently failed once; a backdrop that can quietly not render is a modal
 *   with no modality.
 *
 * The rest of the 1.73 contract stands: never auto-plays, `Escape` leaves,
 * focus travels with the card, the step body is announced politely, arrow
 * keys walk the steps, and nothing fetches.
 *
 * **A native modal, not a div that says it is one (#860).** The overlay was a
 * `div` with `role="dialog"` and `aria-modal="true"`, and nothing behind the
 * claim: measured in Chromium, the third Tab left the card for the page under
 * the dim, which went on taking focus while a screen reader was told it could
 * not. It is a `<dialog>` opened with `showModal()`, so the browser makes the
 * rest of the page inert, keeps focus inside, turns Escape into `cancel` and
 * puts focus back on the button that opened it. The guide it follows is
 * Modern Web Guidance's `dialog`, rule 1: an overlay that blocks the page.
 *
 * One rule of that guide is left out on purpose: scroll containment. The
 * reader may scroll the page under the tour, and the ring follows (the
 * `scroll` listener below), so `overscroll-behavior: contain` would take away
 * something the tour was built to allow.
 */

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RING_PADDING = 6;
const EDGE = 12;
const CARD_WIDTH = 372;
const CARD_ESTIMATED_HEIGHT = 240;

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
  /**
   * The glide is for travelling between steps, not for chasing the reader's
   * scroll: a 320ms transition applied to every scroll-driven re-measure
   * lags the ring and the card behind the page — the production screenshots
   * showed the card half out of view mid-scroll. True for a beat after each
   * step change, false the rest of the time.
   */
  const [gliding, setGliding] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const step = TOUR_STEPS[index];

  /**
   * Shown as a modal on mount, closed before it leaves the page.
   *
   * A layout effect, so the close runs while the element is still in the
   * document: removing an open modal takes it out of the top layer but does
   * not run the close steps, and it is the close steps that give focus back to
   * the button that opened the tour. `open` is checked both ways so a
   * development double mount neither throws nor leaves it shut.
   */
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
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
    if (box.width === 0 || box.height === 0) {
      setRect(null);
      return;
    }
    // Clamp to the viewport: a panel taller than the screen is ringed by its
    // visible part, which is the part the sentence beside it is about.
    const top = Math.max(EDGE, box.top);
    const left = Math.max(EDGE, box.left);
    const right = Math.min(window.innerWidth - EDGE, box.left + box.width);
    const bottom = Math.min(window.innerHeight - EDGE, box.top + box.height);
    if (right - left < 40 || bottom - top < 40) {
      setRect(null);
      return;
    }
    setRect({ top, left, width: right - left, height: bottom - top });
  }, [step.target]);

  // Each step: open its tab, let the panel mount, scroll the target into
  // view (instantly for a reader who asked for no motion), then measure.
  useEffect(() => {
    onTabChange(step.tab);
    setGliding(true);
    const frame = requestAnimationFrame(() => {
      const element =
        step.target !== null ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      if (element !== null) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const taller = element.getBoundingClientRect().height > window.innerHeight * 0.8;
        // A tall panel centred puts its middle — often empty scroll — on
        // screen; its top is where the panel introduces itself.
        element.scrollIntoView({
          behavior: reduced ? 'auto' : 'smooth',
          block: taller ? 'start' : 'center',
        });
      }
      measure();
      cardRef.current?.focus();
    });
    /**
     * The smooth scroll lands over a few frames, and a tab a fast click just
     * opened can be measured before its panel is visible — the 1.73 tour had
     * no re-measure and a quick walker got centred cards with no ring for the
     * rest of the step. Timers owned by the effect, not the rAF callback: a
     * cleanup returned inside requestAnimationFrame is returned to nobody.
     */
    const settle = setTimeout(measure, 360);
    const glided = setTimeout(() => setGliding(false), 420);
    /**
     * The 1.76 arc: a step that carries a demo performs it once the panel
     * has mounted and the ring has settled — the sample prompt optimised,
     * the comparison run, the sample month priced, a command typed into the
     * terminal. Dispatched from here and nowhere else, so a demo can only
     * ever fire from an open tour on the step that owns it; closing the
     * tour unmounts this effect and the pending dispatch with it.
     */
    const demo =
      step.demo !== undefined ? setTimeout(() => runDemo(step.demo as DemoAction), 450) : null;
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      clearTimeout(glided);
      if (demo !== null) clearTimeout(demo);
    };
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

  const last = index === TOUR_STEPS.length - 1;
  const advance = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const retreat = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Escape is the dialog's `cancel`, handled on the element.
      if (event.key === 'ArrowRight') advance();
      else if (event.key === 'ArrowLeft') retreat();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, retreat]);

  /**
   * The card sits under the ring when there is room, above it otherwise, and
   * its top is clamped into the viewport either way — with a height cap and
   * its own scroll as the last line, so no copy is ever unreachable.
   */
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  let cardTop: number;
  let cardLeft: number;
  if (rect === null) {
    cardTop = Math.max(EDGE, viewportH / 2 - CARD_ESTIMATED_HEIGHT / 2);
    cardLeft = Math.max(EDGE, viewportW / 2 - CARD_WIDTH / 2);
  } else {
    const below = rect.top + rect.height + RING_PADDING + 14;
    const above = rect.top - RING_PADDING - 14 - CARD_ESTIMATED_HEIGHT;
    cardTop = below + CARD_ESTIMATED_HEIGHT <= viewportH - EDGE ? below : Math.max(EDGE, above);
    cardTop = Math.min(cardTop, viewportH - EDGE - Math.min(CARD_ESTIMATED_HEIGHT, viewportH * 0.6));
    cardLeft = Math.max(EDGE, Math.min(rect.left, viewportW - CARD_WIDTH - EDGE));
  }

  // The glide. Instant under reduced motion via the global rule, and off
  // entirely outside the step-change beat so scroll tracking is immediate.
  const glide = gliding
    ? 'top 320ms cubic-bezier(0.2, 0.8, 0.2, 1), left 320ms cubic-bezier(0.2, 0.8, 0.2, 1), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1), height 320ms cubic-bezier(0.2, 0.8, 0.2, 1)'
    : 'none';

  return (
    /*
      The user-agent box is undone: a modal dialog is centred, sized to its
      content, padded, bordered and painted, and this one is a transparent
      sheet over the whole viewport whose only paint is the ring's shadow. The
      `::backdrop` is cleared for the same reason. `cancel` is Escape: the
      default would shut the element while the tour stayed mounted, so it is
      prevented and the tour closes itself, which closes the dialog.
    */
    <dialog
      ref={dialogRef}
      aria-label={t.tour.dialogLabel}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-auto max-h-none w-auto max-w-none overflow-visible border-0 bg-transparent p-0 text-foreground backdrop:bg-transparent"
    >
      {/* The dim and the ring are one element: the shadow is the backdrop. */}
      {rect !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl border-2 border-primary"
          style={{
            top: rect.top - RING_PADDING,
            left: rect.left - RING_PADDING,
            width: rect.width + RING_PADDING * 2,
            height: rect.height + RING_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 0 4px color-mix(in oklab, var(--primary) 35%, transparent)',
            transition: glide,
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }} />
      )}

      <div
        key={step.id}
        ref={cardRef}
        tabIndex={-1}
        className="tour-card-in fixed rounded-xl border bg-background p-4 shadow-2xl outline-none"
        style={{
          top: cardTop,
          left: cardLeft,
          width: `min(${CARD_WIDTH}px, calc(100vw - ${EDGE * 2}px))`,
          maxHeight: '60vh',
          overflowY: 'auto',
          transition: glide,
        }}
      >
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{copy.title}</h2>
          <span className="shrink-0 text-[11.5px] tabular-nums text-faint">
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
          {/*
            The walked path, drawn: one dot per step, the current one a pill.
            Buttons, so a reader can jump — and the glide makes the jump read.
          */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                tabIndex={-1}
                onClick={() => setIndex(i)}
                className={
                  i === index
                    ? 'h-1.5 w-5 rounded-full bg-primary transition-all duration-300'
                    : i < index
                      ? 'h-1.5 w-1.5 rounded-full bg-primary/50 transition-all duration-300'
                      : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all duration-300'
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={retreat}
                className="rounded-md border px-3 py-1.5 text-[13px] transition-colors hover:bg-layer-hover"
              >
                {t.tour.back}
              </button>
            )}
            <button
              type="button"
              onClick={advance}
              className="rounded-md border border-primary bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {last ? t.tour.done : t.tour.next}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

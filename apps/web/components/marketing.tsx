'use client';

import { useEffect, useState } from 'react';

import {
  MARKETING_LOCALE_KEY,
  isMarketingLocale,
  type MarketingLocale,
} from '../lib/marketing-locales';

/**
 * Shared plumbing for the marketing surface: the landing and every public page
 * the site shell carries.
 *
 * The Persuade surface sells, the tool operates, and they part ways on
 * language on purpose. **The tool speaks the two languages this project has
 * reviewed** (en, es): its numbers make precise claims, and a claim is only
 * as trustworthy as the language it is checked in, the same principle the
 * trimming dictionaries hold themselves to. **The marketing speaks the
 * world's**: reach is not a precise claim, so a machine-drafted French,
 * German or Portuguese landing serves a reader better than forcing them into
 * English, exactly the reasoning `maintainers.ts` uses for the unreviewed
 * dictionaries, applied to copy that sells rather than measures.
 *
 * So the site carries its own locale, under its own storage key, and never
 * pushes an unreviewed language into the tool: a French visitor reads a
 * French landing and lands in the English tool, which is the honest split.
 * The visual system is the app's own (Space Grotesk, acid yellow, the semantic
 * tokens), not a second brand. Like the Bill tab, there is no fetch here.
 *
 * The lists themselves live in `lib/marketing-locales.ts`, because the server
 * picks a page's metadata from them before any of this runs.
 */

export {
  MARKETING_LOCALES,
  MARKETING_LOCALE_KEY,
  MARKETING_LOCALE_META,
  isMarketingLocale,
} from '../lib/marketing-locales';
export type { MarketingLocale } from '../lib/marketing-locales';

/**
 * The site's language: the server's guess from `Accept-Language` first, so
 * the first paint is already in the reader's language, then a choice stored
 * on an earlier visit, which wins.
 */
export function useMarketingLocale(
  initial: MarketingLocale = 'en',
): [MarketingLocale, (next: MarketingLocale) => void] {
  const [locale, setLocale] = useState<MarketingLocale>(initial);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MARKETING_LOCALE_KEY);
      if (isMarketingLocale(stored)) setLocale(stored);
    } catch {
      // Storage can throw (private mode); the header's language is a full page.
    }
  }, []);
  const set = (next: MarketingLocale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(MARKETING_LOCALE_KEY, next);
    } catch {
      // Not persisting is fine; the choice still applies to this visit.
    }
  };
  return [locale, set];
}

/*
 * `Reveal` used to live here, and deleting it is the fix rather than a
 * retreat from one.
 *
 * ## Two attempts, one failure mode
 *
 * The first rendered its children at `opacity-0` and waited for an
 * IntersectionObserver. A full-page capture of the built landing showed the
 * hero and two paragraphs on seven thousand pixels of blank paper: nothing had
 * scrolled, so nothing had intersected, and every section below the fold was
 * in the DOM, laid out, and invisible.
 *
 * The second replaced the observer with `animation-timeline: view()`, which
 * removed the script and kept the fault: a scroll timeline has no progress
 * when there is nothing to scroll, so on a document shorter than the viewport
 * (a large display, a short locale, a print, a capture) `fill-mode: both`
 * pins the element at the `from` keyframe, which is opacity zero. Tightening
 * the range moved the boundary without removing it.
 *
 * ## Why nothing replaced it
 *
 * Both attempts were paying a real risk of invisible copy for fourteen
 * identical fade-ups, which the craft floor names directly: *one authored
 * moment, not scattered effects and not one identical entrance on every
 * section*. The page's motion is now the bill's ledger filling once on load:
 * time-based, so it cannot depend on a scroll position that may not exist,
 * and written so the finished state is the default and the animation is
 * subtracted from it. Text is text, and it is on the page from the first
 * paint.
 *
 * The scroll-progress line that sat under the old header went with the
 * header: a second moving thing on a page that has one authored moment.
 */

/**
 * Trazum Pro, as this site states it: the tiers, whether it is open, and where
 * to say you want it. The one source `/pro` reads, and the one
 * `pro-page.test.mjs` holds the page to.
 *
 * Pro is a separate, proprietary service built in its own private repository.
 * Nothing here is part of it: these are the facts the open site repeats about
 * it, kept in one place so the page cannot state one figure in its table and
 * another in its prose.
 *
 * **The tiers were decided by the owner, not measured.** They are written in
 * Trazum Pro's `docs/pricing.md`, which says so of itself: a price for this
 * product is a bet, not a fact somebody reads off a page. Change a figure there
 * first and then here, in the same words, and never round one for effect. The
 * share of spend is the one stated beside each tier in that file, and the test
 * checks that it is the price divided by the ceiling, so a tier cannot move
 * without its share moving with it.
 *
 * **It is not open.** The service is in development and its billing is not
 * built: Pro's own milestone list puts collection behind a demand gate. While
 * `PRO_OPEN` is false the page says so, and the test fails if it stops saying
 * it. Turning it to true is the owner's decision and comes with the page that
 * describes an open service, which this one is not.
 */

import type { MarketingLocale } from './marketing-locales';

/** Whether anybody can use Trazum Pro today. */
export const PRO_OPEN: boolean = false;

export type ProTierId = 'team' | 'growth' | 'scale' | 'enterprise';

export interface ProTier {
  readonly id: ProTierId;
  /** The tier's name, which is not translated. */
  readonly name: string;
  /** Euros a month for the organisation, or `null` for a price by agreement. */
  readonly priceEur: number | null;
  /** The managed spend a month the tier covers, in euros, up to and including; `null` above the last ceiling. */
  readonly ceilingEur: number | null;
  /** The price as a percentage of the ceiling, as `docs/pricing.md` states it; `null` where there is no price. */
  readonly sharePct: number | null;
}

/** The tiers, in order, from Trazum Pro's `docs/pricing.md`. */
export const PRO_TIERS: readonly ProTier[] = [
  { id: 'team', name: 'Team', priceEur: 149, ceilingEur: 5_000, sharePct: 2.98 },
  { id: 'growth', name: 'Growth', priceEur: 499, ceilingEur: 25_000, sharePct: 2 },
  { id: 'scale', name: 'Scale', priceEur: 1_499, ceilingEur: 100_000, sharePct: 1.5 },
  { id: 'enterprise', name: 'Enterprise', priceEur: null, ceilingEur: null, sharePct: null },
];

/** The tier the break-even sentence of `docs/pricing.md` is said of. */
export const PRO_BREAK_EVEN_TIER: ProTierId = 'growth';

/** "Free with one member. Paid from the second.", from the same file. */
export const PRO_FREE_MEMBERS = 1;

/**
 * Where to say you want it: the one address this repository publishes, in
 * `CODE_OF_CONDUCT.md`. Not a list and not a form: a message to the
 * maintainer, who reads it.
 */
export const PRO_CONTACT = 'davidmunozrey@protonmail.com';

/** The subject the message starts with, in English whatever the page's language, so it is one subject to look for. */
export const PRO_MAIL_SUBJECT = 'Trazum Pro: tell me when it opens';

/** The link the call to action is: the address and the subject, and no body. */
export const PRO_MAILTO = `mailto:${PRO_CONTACT}?subject=${encodeURIComponent(PRO_MAIL_SUBJECT)}`;

/**
 * Euros as each language writes them, without `Intl`: the server and the
 * browser render the same page, and two ICU builds that disagree about a
 * space would make the page that hydrates differ from the one that was sent.
 */
const MONEY: Record<MarketingLocale, { group: string; decimal: string; euro: (n: string) => string; pct: (n: string) => string }> = {
  en: { group: ',', decimal: '.', euro: (n) => `€${n}`, pct: (n) => `${n}%` },
  es: { group: '.', decimal: ',', euro: (n) => `${n} €`, pct: (n) => `${n} %` },
  fr: { group: ' ', decimal: ',', euro: (n) => `${n} €`, pct: (n) => `${n} %` },
  de: { group: '.', decimal: ',', euro: (n) => `${n} €`, pct: (n) => `${n} %` },
  pt: { group: ' ', decimal: ',', euro: (n) => `${n} €`, pct: (n) => `${n}%` },
};

const grouped = (whole: number, group: string) => String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, group);

/** A whole number of euros: `€1,499` in English, `1.499 €` in Spanish. */
export function euros(amount: number, locale: MarketingLocale): string {
  const style = MONEY[locale];
  return style.euro(grouped(amount, style.group));
}

/** A share as the pricing file states it, to two places: `2.98%`, `2,00 %`. */
export function share(pct: number, locale: MarketingLocale): string {
  const style = MONEY[locale];
  const [whole, cents] = pct.toFixed(2).split('.');
  return style.pct(`${whole}${style.decimal}${cents}`);
}

/** The same share in a sentence, without the zeros a table keeps: `2%`, as the pricing file says it. */
export function shareInProse(pct: number, locale: MarketingLocale): string {
  const style = MONEY[locale];
  const [whole, cents] = pct.toFixed(2).split('.');
  const trimmed = cents.replace(/0+$/, '');
  return style.pct(trimmed === '' ? whole : `${whole}${style.decimal}${trimmed}`);
}

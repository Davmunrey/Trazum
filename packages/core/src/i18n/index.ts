import { en } from './en.js';
import { es } from './es.js';
import { DEFAULT_LOCALE, LOCALES } from './types.js';
import type { CoreMessages, Locale } from './types.js';

const CATALOGUES: Record<Locale, CoreMessages> = { en, es };

/** Message catalogue for a locale. */
export function getMessages(locale: Locale = DEFAULT_LOCALE): CoreMessages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}

/** Whether a string is a locale Trazum ships. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Highest-priority locale in `input` that Trazum actually ships, or `null`
 * when it lists none.
 *
 * Accepts a bare tag (`es`), a regional tag (`es-ES`, `en_GB`), a POSIX locale
 * string (`es_ES.UTF-8`) or an Accept-Language list, so the same helper works
 * for an HTTP header, a CLI flag and the LANG environment variable.
 *
 * The whole list is walked rather than just the first entry: a browser sending
 * `fr-FR,es;q=0.9` prefers French, which we do not have, but it does read
 * Spanish, which we do — falling straight back to English would ignore a
 * preference the user actually expressed. Quality values are assumed to be in
 * descending order, as every real client sends them.
 *
 * Returning `null` instead of a default is what lets callers tell "asked for
 * something we don't have" from "asked for English", and so fall through to
 * the next configuration source.
 */
export function matchLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  for (const tag of input.split(',')) {
    const base = tag.trim().split(/[-_.;]/)[0]?.toLowerCase() ?? '';
    if (isLocale(base)) return base;
  }
  return null;
}

/**
 * Same as `matchLocale`, but falls back to the default locale rather than
 * returning `null`: a bad locale should never be the reason an optimisation
 * fails.
 */
export function resolveLocale(input: string | null | undefined): Locale {
  return matchLocale(input) ?? DEFAULT_LOCALE;
}

export { DEFAULT_LOCALE, LOCALES, en, es };
export type {
  BelowCacheMinimumParams,
  CachePrefixReorderParams,
  ContextOverflowParams,
  CoreMessages,
  Locale,
  LocalizedMessage,
  ModelDowngradeParams,
  OutputDominatedParams,
  PromoPricingParams,
  PromptCachingParams,
  RuleCopy,
  RuleId,
} from './types.js';

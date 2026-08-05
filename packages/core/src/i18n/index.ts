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
 * Best-effort locale resolution from arbitrary input.
 *
 * Accepts a bare tag (`es`), a regional tag (`es-ES`, `en_GB`) or a POSIX
 * locale string (`es_ES.UTF-8`), so the same helper works for an HTTP
 * Accept-Language header, a CLI flag and the LANG environment variable.
 * Falls back to the default locale rather than throwing: a bad locale should
 * never be the reason an optimisation fails.
 */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  // Take the highest-priority tag of an Accept-Language style list.
  const primary = input.split(',')[0] ?? '';
  const base = primary.trim().split(/[-_.;]/)[0]?.toLowerCase() ?? '';
  return isLocale(base) ? base : DEFAULT_LOCALE;
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

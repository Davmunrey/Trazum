import { DEFAULT_LOCALE, LOCALES, resolveLocale } from '@trazum/core';
import type { Locale } from '@trazum/core';

import { en } from './en';
import { es } from './es';
import type { WebMessages } from './types';

const DICTIONARIES: Record<Locale, WebMessages> = { en, es };

export function getWebMessages(locale: Locale = DEFAULT_LOCALE): WebMessages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** Key used to remember the reader's choice across visits. */
export const LOCALE_STORAGE_KEY = 'trazum:locale';

/**
 * Locale for a request, from the browser's `Accept-Language` header.
 * Server-side only; the client overrides it with the stored choice once it
 * hydrates, so an explicit pick always beats the header.
 */
export function localeFromHeaders(acceptLanguage: string | null): Locale {
  return resolveLocale(acceptLanguage);
}

export { DEFAULT_LOCALE, LOCALES, en, es };
export type { Locale, WebMessages };

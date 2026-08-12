import { DEFAULT_LOCALE, matchLocale } from '@trazum/core';
import type { Locale } from '@trazum/core';

import { en } from './en.js';
import { es } from './es.js';
import type { CliMessages } from './types.js';

const CATALOGUES: Record<Locale, CliMessages> = { en, es };

export function getCliMessages(locale: Locale = DEFAULT_LOCALE): CliMessages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}

/**
 * Locale for this run, most explicit source first:
 * the `--locale` flag, then `TRAZUM_LOCALE`, then the usual POSIX variables,
 * and last the project config file.
 *
 * **The config comes last on purpose.** A repository stating `"locale": "es"`
 * is choosing the language its CI logs read in, where `LANG` is usually unset
 * or `C`; a contributor whose machine says otherwise should still get their own
 * language. So the project sets the floor and the person at the keyboard wins.
 *
 * An unrecognised value falls back to English rather than failing: the point
 * of the tool is to optimise the prompt, and the language of the report is
 * never a good reason to refuse to do that.
 */
/**
 * Every environment variable this reads, in precedence order.
 *
 * Exported because it was a hardcoded list in two places and they drifted. The
 * CLI's own test suite has to neutralise the ambient locale before asserting on
 * English output, and its copy of this list omitted `LC_MESSAGES` — so the suite
 * passed on a CI runner and failed for a contributor whose machine sets it.
 * There is one list now, and it is this one: a variable added here is read by the
 * detector and neutralised by the tests in the same commit, or by neither.
 */
export const LOCALE_ENV_VARS = ['TRAZUM_LOCALE', 'LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

export function detectLocale(
  flag: string | undefined,
  env: Record<string, string | undefined> = process.env,
  configLocale?: string,
): Locale {
  const candidates = [flag, ...LOCALE_ENV_VARS.map((name) => env[name]), configLocale];
  for (const candidate of candidates) {
    // An unrecognised value does not stop the search: `LANG=fr_FR.UTF-8` with
    // `TRAZUM_LOCALE` unset should still reach the default rather than being
    // mistaken for an explicit choice.
    const matched = matchLocale(candidate);
    if (matched) return matched;
  }
  return DEFAULT_LOCALE;
}

export { en, es };
export type { CliMessages, HelpDefaults } from './types.js';

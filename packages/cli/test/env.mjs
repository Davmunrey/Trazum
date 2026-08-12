import { LOCALE_ENV_VARS } from '../dist/i18n/index.js';

/**
 * The environment every spawned `trazum` runs under in these tests.
 *
 * **The suite was environment-dependent and nobody noticed for months.** Three
 * spawns in `i18n.test.js` inherited the ambient locale and asserted on English
 * output, so they passed on a CI runner — where `LANG` is unset — and failed for
 * any contributor whose machine says `es_ES.UTF-8`. Seven tests, on a laptop, in
 * the middle of a release.
 *
 * Five variants of this object had grown across the test files by then. Three
 * blanked `LANG`, `LC_ALL` and `TRAZUM_LOCALE`; **none** blanked `LC_MESSAGES`,
 * which `detectLocale` also reads. That is the failure mode of a list kept in two
 * places, so the list is imported from the detector now: a variable added there
 * is neutralised here in the same commit, or in neither.
 *
 * **Blanked rather than pinned to `en`.** Setting `TRAZUM_LOCALE: 'en'` looks
 * tidier and is wrong — it outranks the project config, so every test that gets
 * its language from `"locale": "es"` in `trazum.config.json` would silently
 * report in English and assert against the wrong catalogue. Clearing the
 * environment leaves the precedence chain intact and only removes the machine
 * from it. A test that wants a language asks for it, by flag or by config.
 */
export const SPAWN_ENV = {
  ...process.env,
  ...Object.fromEntries(LOCALE_ENV_VARS.map((name) => [name, ''])),
  NO_COLOR: '1',
  // `where` warns when it is running inside a tool that bills by subscription,
  // and Claude Code is one. Left set, that warning lands in output these tests
  // assert on — but only for the person running them from inside it.
  CLAUDECODE: '',
};

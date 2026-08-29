import { readFileSync } from 'node:fs';

const DETECTOR = new URL('../src/i18n/index.ts', import.meta.url);

/**
 * The variables `detectLocale` reads, taken from the detector itself.
 *
 * Read out of the source rather than imported from `../dist/i18n/index.js`,
 * which is what this file did first. The import was the stronger link and it
 * cost too much: suites in `packages/core`, `packages/mcp` and `apps/web` spawn
 * processes this repository built too, and an import here would have made every
 * one of them fail to load until the CLI happened to be compiled. The parse is
 * held by a guard instead — `i18n.test.js` asserts this list equals the one the
 * detector exports — so a rename breaks a test rather than silently neutralising
 * nothing.
 */
export const NEUTRALISED = (() => {
  const source = readFileSync(DETECTOR, 'utf8');
  const declared = /export const LOCALE_ENV_VARS = \[([^\]]*)\]/.exec(source);
  if (declared === null) {
    throw new Error(`LOCALE_ENV_VARS is no longer declared in ${DETECTOR.pathname}`);
  }
  const names = [...declared[1].matchAll(/'([A-Z_]+)'/g)].map(([, name]) => name);
  if (names.length === 0) {
    throw new Error(`LOCALE_ENV_VARS parsed to nothing from ${DETECTOR.pathname}`);
  }
  return names;
})();

/**
 * The environment every spawned Trazum process runs under in these tests.
 *
 * **The suite was environment-dependent and nobody noticed for months.** Three
 * spawns in `i18n.test.js` inherited the ambient locale and asserted on English
 * output, so they passed on a CI runner — where `LANG` is unset — and failed for
 * any contributor whose machine says `es_ES.UTF-8`. Seven tests, on a laptop, in
 * the middle of a release. It happened again at 1.85.0, in `own-gate.test.js`:
 * one spawn, no `env`, and a Spanish Mac reading `un crecimiento de 151 tokens
 * supera el límite de 25` where the assertion wanted `over the limit`.
 *
 * Five variants of this object had grown across the test files by then. Three
 * blanked `LANG`, `LC_ALL` and `TRAZUM_LOCALE`; **none** blanked `LC_MESSAGES`,
 * which `detectLocale` also reads. That is the failure mode of a list kept in two
 * places, so the list is derived from the detector now: a variable added there
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
  ...Object.fromEntries(NEUTRALISED.map((name) => [name, ''])),
  NO_COLOR: '1',
  // `where` warns when it is running inside a tool that bills by subscription,
  // and Claude Code is one. Left set, that warning lands in output these tests
  // assert on — but only for the person running them from inside it.
  CLAUDECODE: '',
};

import { readFileSync } from 'node:fs';

const DETECTOR = new URL('../src/i18n/index.ts', import.meta.url);
const PAINTER = new URL('../src/style.ts', import.meta.url);

/** The names inside an `export const <NAME> = [...]` declaration, or a throw. */
const declaredList = (source, name, where) => {
  const declared = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(source);
  if (declared === null) throw new Error(`${name} is no longer declared in ${where}`);
  const names = [...declared[1].matchAll(/'([A-Z_]+)'/g)].map(([, found]) => found);
  if (names.length === 0) throw new Error(`${name} parsed to nothing from ${where}`);
  return names;
};

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
export const NEUTRALISED = declaredList(
  readFileSync(DETECTOR, 'utf8'),
  'LOCALE_ENV_VARS',
  DETECTOR.pathname,
);

/**
 * The variables the colour decision reads, taken from the painter itself.
 *
 * **Removed, not blanked, and that is the opposite of the rule above.** The
 * locale detector treats an empty string as no answer and moves down its
 * precedence chain, so blanking is what "the machine said nothing" looks like.
 * Node's own colour depth reads `FORCE_COLOR` for its *presence*: an empty
 * value turns colour on, and any value at all makes Node print
 * `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` into
 * the output these tests parse. Two variables, two rules, because two programs
 * read them differently.
 */
export const REMOVED = declaredList(readFileSync(PAINTER, 'utf8'), 'COLOUR_ENV_VARS', PAINTER.pathname);

/** The machine's environment with every colour variable gone. */
const withoutColour = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !REMOVED.includes(name)),
);

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
 * **And once more the same day, through a different variable.** This object set
 * `NO_COLOR` and inherited `FORCE_COLOR`, which outranks it in the CLI and in
 * Node. On a machine whose shell exports `FORCE_COLOR` the whole suite ran
 * against painted output: twenty-nine tests failed, some on ANSI codes between
 * the words they matched, some on `JSON.parse` meeting Node's own warning that
 * the two variables disagreed. Setting the variable a test wants is half the
 * job; removing the one that overrides it is the other half.
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
  ...withoutColour,
  ...Object.fromEntries(NEUTRALISED.map((name) => [name, ''])),
  NO_COLOR: '1',
  // `where` warns when it is running inside a tool that bills by subscription,
  // and Claude Code is one. Left set, that warning lands in output these tests
  // assert on — but only for the person running them from inside it.
  CLAUDECODE: '',
};

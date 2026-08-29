import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { CONFIG_KEYS, CONFIG_USAGE_KEYS, CONTRACT_NAMES, LOCALES } from '@trazum/core';

import { LOCALE_ENV_VARS, detectLocale, en, es, getCliMessages } from '../dist/i18n/index.js';
import { NEUTRALISED, SPAWN_ENV } from './env.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The values `--help` interpolates, in one place.
 *
 * Five copies of this object lived in this file, and adding a field to
 * `HelpDefaults` made every one of them throw at the first `.join` — five
 * failures, one cause. The help screen is rendered from data precisely so the
 * enumerations in it cannot go stale, and a test that retypes that data is the
 * staleness one layer down.
 */
const HELP_DEFAULTS = {
  model: 'claude-opus-5',
  callsPerMonth: 1000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  locales: LOCALES,
  contracts: CONTRACT_NAMES,
};

describe('locale detection', () => {
  it('the flag wins over everything else', () => {
    const env = { TRAZUM_LOCALE: 'en', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
    assert.equal(detectLocale('es', env), 'es');
    assert.equal(detectLocale('es-ES', env), 'es');
  });

  it('TRAZUM_LOCALE wins over the POSIX variables', () => {
    assert.equal(detectLocale(undefined, { TRAZUM_LOCALE: 'es', LANG: 'en_US.UTF-8' }), 'es');
  });

  it('LC_ALL wins over LANG', () => {
    assert.equal(detectLocale(undefined, { LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }), 'es');
  });

  it('reads a POSIX LANG value', () => {
    assert.equal(detectLocale(undefined, { LANG: 'es_ES.UTF-8' }), 'es');
    assert.equal(detectLocale(undefined, { LANG: 'en_GB.UTF-8' }), 'en');
  });

  it('an unrecognised source does not stop the search', () => {
    // The point of matchLocale returning null: LANG=fr must not be mistaken
    // for an explicit choice that ends the lookup.
    assert.equal(detectLocale(undefined, { LANG: 'fr_FR.UTF-8', TRAZUM_LOCALE: 'es' }), 'es');
    assert.equal(detectLocale('fr', { TRAZUM_LOCALE: 'es' }), 'es');
  });

  it('falls back to English when nothing names a locale we ship', () => {
    assert.equal(detectLocale(undefined, {}), 'en');
    assert.equal(detectLocale(undefined, { LANG: 'C' }), 'en');
    assert.equal(detectLocale(undefined, { LANG: 'POSIX' }), 'en');
    assert.equal(detectLocale('nonsense', {}), 'en');
  });
});

describe('catalogue parity', () => {
  it('a catalogue exists for every locale the core ships', () => {
    for (const locale of LOCALES) {
      assert.equal(getCliMessages(locale).locale, locale);
    }
  });

  it('an unknown locale falls back rather than returning undefined', () => {
    assert.equal(getCliMessages('fr').locale, 'en');
  });

  it('all catalogues expose the same keys', () => {
    // Derived, not listed. The hardcoded version silently stopped covering
    // `eval` the moment that section was added — the parity test passed while
    // an entire section could have gone untranslated.
    const sections = Object.entries(en)
      .filter(([, value]) => value !== null && typeof value === 'object')
      .map(([key]) => key);

    assert.ok(sections.length >= 5, 'the catalogue lost sections');
    assert.deepEqual(
      sections.sort(),
      Object.entries(es)
        .filter(([, value]) => value !== null && typeof value === 'object')
        .map(([key]) => key)
        .sort(),
      'the two catalogues do not even have the same sections',
    );
    for (const section of sections) {
      assert.deepEqual(
        Object.keys(es[section]).sort(),
        Object.keys(en[section]).sort(),
        `section "${section}" differs between catalogues`,
      );
    }
    assert.deepEqual(Object.keys(es.models.columns).sort(), Object.keys(en.models.columns).sort());
  });

  it('every command appears in the help, in every locale', () => {
    // Regression: `eval` shipped fully implemented and completely
    // undiscoverable — the only way to find it was reading the changelog. A
    // command the help does not mention may as well not exist.
    const COMMANDS = ['optimize', 'check', 'eval', 'diff', 'models', 'rules'];
    const defaults = HELP_DEFAULTS;

    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      for (const command of COMMANDS) {
        assert.ok(
          help.includes(`trazum ${command}`),
          `${locale}: help never mentions "trazum ${command}"`,
        );
      }
    }
  });

  it('every flag the CLI accepts is documented in every locale', () => {
    // Derived from what the binary actually accepts, not from a list kept here.
    // A hardcoded list is how `--reorder` shipped fully implemented and absent
    // from `--help`: the old version of this test named four *required* flags
    // and passed the whole time. The rejection message for an unknown flag
    // prints the real allow-list for that command, so it is the list.
    const CLI = new URL('../dist/index.js', import.meta.url).pathname;
    const COMMANDS = ['optimize', 'check', 'eval', 'diff'];
    const defaults = HELP_DEFAULTS;

    const accepted = new Set();
    for (const command of COMMANDS) {
      const { stdout, stderr } = spawnSync(
        process.execPath,
        [CLI, command, 'README.md', '--definitely-not-a-flag'],
        { encoding: 'utf8', env: SPAWN_ENV },
      );
      const list = /This command accepts: (.+?)\.?$/m.exec(`${stdout}${stderr}`);
      assert.ok(list, `${command}: could not read the accepted-flag list`);
      for (const name of list[1].split(', ')) accepted.add(name.trim());
    }

    // Single letters are aliases of a long name that carries the description.
    const documented = [...accepted].filter((name) => name.length > 1);
    assert.ok(documented.includes('reorder'), 'the derivation stopped finding flags');

    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      for (const flag of documented) {
        assert.ok(help.includes(`--${flag}`), `${locale}: help does not document --${flag}`);
      }
    }
  });

  it('every flag handled before a command is chosen is documented too', () => {
    /**
     * The test above derives its list from the rejection message, which is
     * per-command — so a flag belonging to no command is invisible to it.
     * `--clear-suggestion-cache` is exactly that: an errand that runs with no
     * command named. It shipped documented nowhere and the suite stayed green.
     *
     * This reads `main()` instead, which is where such a flag has to be handled
     * to work at all.
     */
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('async function main('));
    assert.ok(body.length > 0, 'main() could not be found — has it been renamed?');

    const handled = new Set(
      [...body.matchAll(/boolFlag\(args, '([^']+)'\)/g)].map((match) => match[1]),
    );
    assert.ok(handled.has('clear-suggestion-cache'), 'the derivation stopped finding flags');

    const defaults = HELP_DEFAULTS;

    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      for (const flag of handled) {
        // `-h` is an alias printed beside --help on one line.
        if (flag === 'h') continue;
        assert.ok(help.includes(`--${flag}`), `${locale}: help does not document --${flag}`);
      }
    }
  });

  it('every config key is documented in every locale', () => {
    // Derived from the schema, not listed here. A hardcoded copy is how `eval`
    // came to be fully implemented and completely undiscoverable — the parity
    // test passed the whole time.
    const defaults = HELP_DEFAULTS;

    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      for (const key of [...CONFIG_KEYS, ...CONFIG_USAGE_KEYS]) {
        assert.ok(help.includes(key), `${locale}: help never mentions the config key "${key}"`);
      }
      assert.ok(
        help.includes('trazum.config.json'),
        `${locale}: help does not name the config file`,
      );
    }
  });

  it('every catalogue renders a non-empty help screen', () => {
    const defaults = HELP_DEFAULTS;
    for (const locale of LOCALES) {
      const help = getCliMessages(locale).help(defaults, (s) => s);
      assert.ok(help.includes('trazum optimize'), `${locale}: help lost the usage block`);
      assert.ok(help.includes('--locale'), `${locale}: help does not document --locale`);
      assert.ok(help.includes(defaults.model), `${locale}: help does not show the default model`);
    }
  });

  it('every message renders a non-empty string in every locale', () => {
    // Catches a catalogue entry left as an empty string, which type-checks
    // fine and reads as a missing label at runtime.
    const samples = {
      errors: {
        optionNeedsValue: ['level'],
        mustBeNonNegative: ['calls', 'x'],
        badLevel: ['nope'],
        unknownRuleInDisable: ['nope'],
        unknownCommand: ['nope'],
        missingInputFile: [],
        llmNotConfigured: [],
        exactTokensNeedsKey: [],
        checkNeedsMaxTokens: [],
        cannotNegate: ['max-tokens'],
        noPromptsFound: ['prompts/', '.txt .md'],
        noBudgetsApply: ['prompts/', 'trazum.config.json'],
        errorLabel: [],
      },
      report: {
        inputTokens: [],
        estimated: [],
        exactCount: [],
        rulesApplied: [],
        nothingToTrim: [],
        levelAggressive: [],
        levelSafe: [],
        ruleHits: [2, 10],
        llmPass: [],
        llmApplied: ['p', 'm', 10, 5],
        llmRejected: ['reason'],
        costWith: ['Claude Opus 5'],
        usageLine: ['1,000', 500, true],
        perMonthSaving: ['$1.00', '2.0'],
        beyondShortening: [],
        perMonthSuffix: ['$1.00'],
        diff: [],
        wroteTo: ['out.txt'],
      },
      check: {
        okLabel: [],
        failedLabel: [],
        ok: ['10', '20'],
        failed: ['30', '20'],
        wouldFit: ['safe', '15'],
        stillTooBig: ['25'],
        directoryHeading: ['prompts/', 3],
        directorySummary: [1, 3],
        noBudget: [],
        walkTruncated: [],
        exactCountsCost: [3],
      },
    };

    for (const locale of LOCALES) {
      const t = getCliMessages(locale);
      for (const [section, entries] of Object.entries(samples)) {
        for (const [key, args] of Object.entries(entries)) {
          const value = t[section][key](...args);
          assert.ok(
            typeof value === 'string' && value.trim().length > 0,
            `${locale}/${section}.${key} rendered empty`,
          );
        }
      }
    }
  });
});

describe('the CLI rejects what it does not understand', () => {
  // These are behavioural, driven through the built binary, because the bug
  // they guard against was invisible from the inside: an unknown flag parsed
  // fine, was stored, and was simply never read.
  const CLI = new URL('../dist/index.js', import.meta.url).pathname;

  function run(args) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: SPAWN_ENV,
    });
    return `${result.stdout}${result.stderr}`;
  }

  it('rejects an unknown flag instead of ignoring it', () => {
    // On a gate command, silently ignoring a flag means CI passing while the
    // author believes a threshold is set.
    const output = run(['check', 'README.md', '--max-tokens', '5', '--not-a-flag']);
    assert.match(output, /Unknown option --not-a-flag/);
  });

  it('suggests the intended flag on a near miss', () => {
    assert.match(run(['check', 'README.md', '--max-token', '5']), /Did you mean --max-tokens/);
    assert.match(run(['eval', 'README.md', '--case', 'x']), /Did you mean --cases/);
  });

  it('does not guess when nothing is close', () => {
    // `--llm` is three edits from `--help`, which a fixed budget accepted and
    // then confidently suggested. A wrong guess is worse than the full list:
    // it sends the reader off to check it.
    const output = run(['check', 'README.md', '--max-tokens', '5', '--llm']);
    assert.match(output, /Unknown option --llm/);
    assert.doesNotMatch(output, /Did you mean/);
  });

  it('rejects a flag that belongs to a different command', () => {
    assert.match(run(['check', 'README.md', '--max-tokens', '5', '--batch']), /Unknown option --batch/);
  });

  it('still accepts every flag it documents', () => {
    const output = run(['optimize', 'README.md', '--level', 'aggressive', '--calls', '10', '--json']);
    assert.doesNotMatch(output, /Unknown option/);
  });

  it('reports the rejection in the requested locale', () => {
    assert.match(
      run(['check', 'README.md', '--max-tokens', '5', '--nope', '--locale', 'es']),
      /Opción desconocida/,
    );
  });
});

describe('trazum diff', () => {
  const CLI = new URL('../dist/index.js', import.meta.url).pathname;

  function run(args) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: SPAWN_ENV,
    });
    return { out: `${r.stdout}${r.stderr}`, code: r.status };
  }

  const BEFORE = new URL('./fixtures/diff-before.txt', import.meta.url).pathname;
  const AFTER = new URL('./fixtures/diff-after.txt', import.meta.url).pathname;

  it('the gate is opt-in', () => {
    // A tool that fails a build nobody armed gets removed from the pipeline
    // rather than fixed.
    assert.equal(run(['diff', BEFORE, AFTER]).code, 0, 'growth alone must not fail the build');
  });

  it('fails only when a limit was asked for and passed', () => {
    assert.equal(run(['diff', BEFORE, AFTER, '--max-growth', '5']).code, 1);
    assert.equal(run(['diff', BEFORE, AFTER, '--max-growth', '500']).code, 0);
  });

  it('needs both sides', () => {
    assert.match(run(['diff', BEFORE]).out, /needs two files/);
  });

  it('catches the typo the gate depends on', () => {
    // `--max-growh 5` silently ignored would mean CI green while the author
    // believes a limit is set. This is the scenario the flag check exists for.
    assert.match(run(['diff', BEFORE, AFTER, '--max-growh', '5']).out, /Did you mean --max-growth/);
  });

  it('reports the delta with its sign', () => {
    const { out } = run(['diff', BEFORE, AFTER, '--calls', '50000']);
    assert.match(out, /\+\d+ \(\+\d+%\)/, `no signed delta in: ${out}`);
    assert.match(out, /\+\$/, 'the cost delta should carry an explicit sign');
  });

  it('names what the edit broke', () => {
    assert.match(run(['diff', BEFORE, AFTER]).out, /contradictory-instructions/);
  });

  it('reports resolution when run the other way round', () => {
    const { out } = run(['diff', AFTER, BEFORE]);
    assert.match(out, /contradictory-instructions/);
    assert.match(out, /-\d+ \(-\d+%\)/, 'a shrinking prompt should show a negative delta');
  });
});

describe('the suite does not depend on the machine it runs on', () => {
  /**
   * Seven tests in this file passed in CI for months and failed on the first
   * contributor laptop with a Spanish locale, because three spawns inherited the
   * ambient environment and asserted on English output. The fix is `env.mjs`;
   * this is what stops the next spawn from reintroducing it.
   *
   * **It did not stop it.** At 1.85.0 `packages/core/test/own-gate.test.js`
   * spawned the gate with no `env` at all and asserted on `over the limit`, and a
   * Spanish Mac read `un crecimiento de 151 tokens supera el límite de 25`. The
   * guard below had two holes and the failure went through both: it read one
   * directory, so nothing outside `packages/cli/test` was ever looked at, and it
   * matched only an environment *built inline*, so passing none was invisible to
   * it. `apps/web` had meanwhile grown a sixth hand-rolled copy of the object,
   * two directories away from the guard that exists to prevent exactly that.
   *
   * Both holes are closed here: every tracked suite in the repository, and the
   * absent `env` as well as the inline one.
   */
  const repoRoot = join(here, '..', '..', '..');
  const suites = execFileSync('git', ['ls-files', '*.test.js', '*.test.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  /**
   * The end of the expression starting at `from`, by bracket depth.
   *
   * Quoted runs are skipped so that a bracket or a semicolon inside a string —
   * `['-c', 'a; b']` is ordinary here — does not end the expression early.
   */
  const endOfExpression = (source, from) => {
    let index = from;
    let depth = 0;
    let quote = null;
    while (index < source.length) {
      const char = source[index];
      if (quote !== null) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = null;
      } else if (char === "'" || char === '"' || char === '`') {
        quote = char;
      } else if ('([{'.includes(char)) {
        depth += 1;
      } else if (')]}'.includes(char)) {
        if (depth === 0) break;
        depth -= 1;
      } else if (char === ';' && depth === 0) {
        break;
      }
      index += 1;
    }
    return index;
  };

  /**
   * The names in one suite that stand for something this repository built.
   *
   * A binding whose initialiser names a `dist/index.js` is one, and so is a
   * binding built out of such a name — `own-gate.test.js` puts the path into a
   * shell script and spawns the script, and a check that only looked at the
   * spawn's own arguments would have missed it exactly as the old guard did.
   */
  const entryPointNames = (source) => {
    const bindings = [];
    const declaration = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
    let found;
    while ((found = declaration.exec(source)) !== null) {
      bindings.push({
        name: found[1],
        text: source.slice(found.index, endOfExpression(source, declaration.lastIndex)),
      });
    }
    const named = new Set();
    for (let pass = 0; pass <= bindings.length; pass += 1) {
      const before = named.size;
      for (const binding of bindings) {
        if (named.has(binding.name)) continue;
        const built =
          /dist\/index\.js|'dist',\s*'index\.js'/.test(binding.text) ||
          [...named].some((name) => new RegExp(`\\b${name}\\b`).test(binding.text));
        if (built) named.add(binding.name);
      }
      if (named.size === before) break;
    }
    return [...named];
  };

  it('every spawn goes through the shared environment', () => {
    assert.ok(suites.length > 100, `only ${suites.length} suites found — has the layout moved?`);

    const offenders = [];
    for (const file of suites) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      // A spawn env built inline from `process.env` is the shape that carried the
      // bug: it inherits whatever the machine says. `blame.test.js` also assigns
      // to `process.env.PATH` directly, which is not an env object for a spawn,
      // so the pattern is deliberately anchored on the spread.
      if (/env:\s*\{[^}]*\.\.\.process\.env/.test(source)) offenders.push(file);
    }

    assert.deepEqual(
      offenders,
      [],
      `these build a spawn environment inline instead of importing SPAWN_ENV: ${offenders.join(', ')}`,
    );
  });

  it('and no run of something this repository built inherits the machine', () => {
    /**
     * The half that was missing. An inline environment is a copy of the shared
     * one; **no** environment is the machine itself, which is what a spawn gets
     * by default and what `own-gate.test.js` got for the whole of 1.85.0.
     *
     * Only spawns that run something built here are held to it. A `git ls-files`
     * for a filename list is a spawn too, and demanding an environment for it
     * would be ceremony rather than a guard.
     */
    const call = /(?<![.\w$])(execFileSync|execSync|spawnSync|execFile|spawn|fork)\s*\(/g;
    const offenders = [];
    let checked = 0;

    for (const file of suites) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      if (!source.includes('node:child_process')) continue;
      const names = entryPointNames(source);
      if (names.length === 0) continue;

      call.lastIndex = 0;
      let found;
      while ((found = call.exec(source)) !== null) {
        const text = source.slice(found.index, endOfExpression(source, call.lastIndex) + 1);
        if (!names.some((name) => new RegExp(`\\b${name}\\b`).test(text))) continue;
        checked += 1;
        if (/\benv\s*:/.test(text)) continue;
        offenders.push(`${file}:${source.slice(0, found.index).split('\n').length}`);
      }
    }

    assert.ok(checked > 100, `only ${checked} runs found — has the spawn convention moved?`);
    assert.deepEqual(
      offenders,
      [],
      'these run something this repository built and pass no environment, so they read ' +
        `the locale of whoever is running them: ${offenders.join(', ')}`,
    );
  });

  it('and the shared environment clears every variable the detector reads', () => {
    // The list lives in the detector and is imported here. Both halves are
    // asserted because the import could be dropped and replaced with a copy,
    // which is exactly how `LC_MESSAGES` came to be missing.
    for (const name of LOCALE_ENV_VARS) {
      assert.equal(SPAWN_ENV[name], '', `${name} is not cleared for spawned runs`);
    }
    assert.ok(LOCALE_ENV_VARS.includes('LC_MESSAGES'), 'the variable that was missed is missing again');
  });

  it('and what the shared environment read out of the detector is what the detector exports', () => {
    /**
     * `env.mjs` parses the list out of `src/i18n/index.ts` rather than importing
     * the compiled module, so that a suite in another workspace can use it
     * without the CLI having been built first. This is the guard that keeps the
     * parse honest: a rename, a reformat that breaks the pattern, or a variable
     * added to the detector fails here instead of quietly neutralising nothing.
     */
    assert.deepEqual(NEUTRALISED, [...LOCALE_ENV_VARS]);
  });
});

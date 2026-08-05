import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { isPrivateHost, optimize, validateLlmEndpoint } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/**
 * These are the invariants that make Trazum safe to run on someone else's
 * prompt, on a public server, with contributions from strangers. They are
 * tests rather than documentation because a promise nobody checks is a promise
 * that expires.
 */

describe('SSRF: endpoint validation', () => {
  const blocked = [
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['metadata by name', 'https://metadata.google.internal/v1/'],
    ['loopback', 'https://127.0.0.1/v1'],
    ['loopback by name', 'https://localhost/v1'],
    ['private class A', 'https://10.0.0.5/v1'],
    ['private class B', 'https://172.16.4.4/v1'],
    ['private class C', 'https://192.168.1.1/v1'],
    ['carrier-grade NAT', 'https://100.64.1.1/v1'],
    ['IPv6 loopback', 'https://[::1]/v1'],
    ['IPv6 link-local', 'https://[fe80::1]/v1'],
    ['IPv6 unique-local', 'https://[fd00::1]/v1'],
    ['IPv4-mapped IPv6', 'https://[::ffff:169.254.169.254]/v1'],
    ['internal TLD', 'https://vault.internal/v1'],
    ['local TLD', 'https://printer.local/v1'],
    ['trailing-dot bypass', 'https://localhost./v1'],
    ['uppercase bypass', 'https://LOCALHOST/v1'],
  ];

  for (const [name, url] of blocked) {
    it(`blocks ${name}`, () => {
      assert.equal(validateLlmEndpoint(url), 'private-host', url);
    });
  }

  it('blocks non-https schemes', () => {
    assert.equal(validateLlmEndpoint('http://example.com/v1'), 'insecure-scheme');
    assert.equal(validateLlmEndpoint('file:///etc/passwd'), 'insecure-scheme');
    assert.equal(validateLlmEndpoint('gopher://example.com/'), 'insecure-scheme');
    assert.equal(validateLlmEndpoint('ftp://example.com/'), 'insecure-scheme');
  });

  it('blocks credentials embedded in the URL', () => {
    // They would be forwarded to whatever the host turns out to be, and would
    // land in any log line that records the endpoint.
    assert.equal(validateLlmEndpoint('https://user:pass@example.com/v1'), 'credentials-in-url');
  });

  it('rejects malformed input rather than throwing', () => {
    for (const bad of ['', 'not a url', '///', 'https://', '  ']) {
      assert.equal(validateLlmEndpoint(bad), 'invalid-url', JSON.stringify(bad));
    }
  });

  it('allows ordinary public endpoints', () => {
    for (const url of [
      'https://api.anthropic.com/v1',
      'https://llm.example.com/v1',
      'https://openrouter.ai/api/v1',
    ]) {
      assert.equal(validateLlmEndpoint(url), null, url);
    }
  });

  it('only relaxes the rules when explicitly asked', () => {
    assert.equal(validateLlmEndpoint('http://localhost:8000/v1'), 'insecure-scheme');
    assert.equal(
      validateLlmEndpoint('http://localhost:8000/v1', { allowInsecure: true }),
      null,
      'development mode should permit a local LLM',
    );
  });

  it('treats an empty or unknown host as private', () => {
    // Failing closed: anything the parser cannot make sense of is not fetched.
    assert.ok(isPrivateHost(''));
    assert.ok(isPrivateHost('   '));
  });
});

describe('no runtime dependencies', () => {
  // The core and the CLI process untrusted text. Every runtime dependency is
  // code that would run on that text with no review from this project, so the
  // dependency count is a security property, not a packaging preference.
  for (const pkg of ['packages/core', 'packages/cli']) {
    it(`${pkg} depends on nothing outside this repo`, () => {
      const manifest = JSON.parse(readFileSync(join(repoRoot, pkg, 'package.json'), 'utf8'));
      const deps = Object.keys(manifest.dependencies ?? {});
      const external = deps.filter((name) => !name.startsWith('@trazum/'));
      assert.deepEqual(
        external,
        [],
        `${pkg} added runtime dependencies: ${external.join(', ')}. ` +
          'If one is genuinely needed, say so in the pull request and update this test deliberately.',
      );
      assert.deepEqual(
        Object.keys(manifest.optionalDependencies ?? {}),
        [],
        `${pkg} added optional dependencies`,
      );
    });
  }
});

describe('the core does not reach the network on its own', () => {
  it('only the modules that exist to make calls mention fetch', () => {
    // optimize() must stay offline and free. A fetch appearing anywhere else
    // means some code path started phoning home.
    const allowed = new Set(['llm.ts', 'tokenizer.ts']);
    const srcDir = join(repoRoot, 'packages/core/src');

    const offenders = [];
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}${entry.name}/`);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        if (allowed.has(entry.name)) continue;
        const source = readFileSync(path, 'utf8');
        if (/\bfetch\s*\(|XMLHttpRequest|node:https?\b/.test(source)) {
          offenders.push(`${prefix}${entry.name}`);
        }
      }
    };
    walk(srcDir);

    assert.deepEqual(
      offenders,
      [],
      `network access appeared outside ${[...allowed].join(', ')}: ${offenders.join(', ')}`,
    );
  });
});

describe('the core does not touch the filesystem on its own', () => {
  const srcDir = join(repoRoot, 'packages/core/src');

  /**
   * Source with comments removed.
   *
   * Every assertion below reads source text, and twice now the pattern matched
   * the comment explaining the invariant rather than a violation of it. A test
   * that fails when you document the reasoning teaches people to stop
   * documenting the reasoning.
   */
  const codeOf = (file) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');

  it('only the modules that exist to read files mention fs', () => {
    // The web app exposes optimize() over HTTP with a prompt from the request
    // body. If any module on that path grew a file read, a path in a prompt
    // would become a file the server hands back — path traversal, reachable by
    // anyone who can reach the API. The config loader and the directory walk
    // are the two modules that legitimately read from disk; both are CLI-only.
    const allowed = new Set(['config.ts', 'walk.ts']);

    const offenders = [];
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}${entry.name}/`);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        if (allowed.has(entry.name)) continue;
        // Import statements only. Matching any mention of "node:fs" caught the
        // comments explaining why the boundary exists — a test that fails when
        // you document it teaches people to stop documenting it.
        const source = codeOf(path);
        if (/\bfrom\s+['"]node:fs(?:\/[^'"]*)?['"]|\brequire\(['"](?:node:)?fs['"]\)/.test(source)) {
          offenders.push(`${prefix}${entry.name}`);
        }
      }
    };
    walk(srcDir);

    assert.deepEqual(
      offenders,
      [],
      `filesystem access appeared outside ${[...allowed].join(', ')}: ${offenders.join(', ')}`,
    );
  });

  it('nothing reachable from the main entry point imports a Node builtin', () => {
    // The test above says which *files* may read the disk. It does not say they
    // are unreachable from the browser, and the first version of this shipped
    // exactly that gap: config.ts was allowed AND re-exported from index.ts, so
    // `next build` failed with "the chunking context does not support external
    // modules (request: node:fs/promises)". A module allow-list is not a
    // boundary; the import graph is. This walks it.
    //
    // Every `node:` builtin, not only fs: `node:path` would have broken the web
    // build in exactly the same way, and only did not because it got caught
    // before the second push.
    const FS = /\bfrom\s+['"]node:[^'"]+['"]/;
    const IMPORTS = /\bfrom\s+['"](\.[^'"]*)['"]/g;

    const resolve = (specifier, fromFile) => {
      const base = join(fromFile, '..', specifier).replace(/\.js$/, '');
      for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
        try {
          readFileSync(candidate, 'utf8');
          return candidate;
        } catch {
          /* try the next shape */
        }
      }
      return null;
    };

    const seen = new Set();
    const offenders = [];
    const visit = (file, chain) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = codeOf(file);
      if (FS.test(source)) {
        offenders.push([...chain, file].map((f) => f.slice(srcDir.length + 1)).join(' → '));
        return;
      }
      for (const [, specifier] of source.matchAll(IMPORTS)) {
        const next = resolve(specifier, file);
        if (next) visit(next, [...chain, file]);
      }
    };
    visit(join(srcDir, 'index.ts'), []);

    assert.deepEqual(
      offenders,
      [],
      `a Node builtin is reachable from the browser-safe entry point:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('the node-only entry point is where the filesystem lives', () => {
    // The other half of the boundary: if this stopped reaching node:fs, the
    // split above would be passing for the wrong reason — nothing left to split.
    const seen = new Set();
    let reachesFs = false;
    const visit = (file) => {
      if (seen.has(file) || reachesFs) return;
      seen.add(file);
      const source = codeOf(file);
      if (/\bfrom\s+['"]node:fs(?:\/promises)?['"]/.test(source)) {
        reachesFs = true;
        return;
      }
      for (const [, specifier] of source.matchAll(/\bfrom\s+['"](\.[^'"]*)['"]/g)) {
        const base = join(file, '..', specifier).replace(/\.js$/, '');
        for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
          try {
            readFileSync(candidate, 'utf8');
            visit(candidate);
            break;
          } catch {
            /* try the next shape */
          }
        }
      }
    };
    visit(join(srcDir, 'node.ts'));
    assert.ok(reachesFs, 'node.ts no longer reaches the filesystem — has the split gone stale?');
  });

  it('the directory walk refuses to follow a symlink', () => {
    // Pinned in the source as well as behaviourally: dropping this check would
    // turn "check the prompts folder" into reading whatever a link points at,
    // and a link loop into a hang.
    const source = codeOf(join(srcDir, 'walk.ts'));
    assert.match(source, /isSymbolicLink\(\)/);
  });

  it('the config file is measured and read through one handle', () => {
    // CodeQL flagged the stat-then-readFile version as a race, and it was one:
    // resolving the path twice means what gets read is not necessarily what got
    // measured, so a symlink swapped in between the two calls defeats the size
    // limit. One open, then everything asked of the handle.
    const code = codeOf(join(srcDir, 'config.ts'));
    assert.match(code, /handle\.stat\(\)/);
    assert.match(code, /handle\.readFile\(/);
    assert.doesNotMatch(
      code,
      /\breadFile\(\s*path\b|\bstat\(\s*path\b/,
      'reading or measuring by path again reopens the race this was written to close',
    );
  });
});

describe('ReDoS resistance', () => {
  /**
   * Trazum is a regex engine pointed at untrusted text, reachable over HTTP.
   * A rule with catastrophic backtracking is a denial-of-service bug, and the
   * kind of thing that arrives in an innocent-looking pull request.
   *
   * The budget is generous — this is a cliff detector, not a benchmark. A
   * backtracking regex does not take 3 seconds, it takes minutes.
   */
  const BUDGET_MS = 5000;

  const pathological = [
    ['whitespace run', ' '.repeat(60_000)],
    ['punctuation run', '!'.repeat(40_000)],
    ['single long word', 'a'.repeat(200_000)],
    ['comma storm', ', '.repeat(40_000)],
    ['courtesy storm', 'please, '.repeat(20_000)],
    ['newline storm', '\n'.repeat(60_000)],
    ['unclosed code fence', '```\n' + 'x'.repeat(100_000)],
    ['url-like run', `https://${'a.'.repeat(20_000)}`],
    ['unclosed placeholders', '{{'.repeat(30_000)],
    ['unclosed xml', '<'.repeat(30_000)],
    ['nested quantifier bait', `respond ${'x '.repeat(5_000)}in english`],
    ['example header flood', `Input: ${'word '.repeat(40_000)}`],
    ['mixed adversarial', `${'{{a}} '.repeat(5_000)}${'<b> '.repeat(5_000)}${'`c` '.repeat(5_000)}`],

    // The shape this suite originally missed, and CodeQL caught: a *single
    // line* that starts like a label and then runs on in whitespace without
    // ever reaching the terminator the pattern needs. Every line-oriented
    // regex has to fail across the whole run, which was quadratic until the
    // label quantifiers were bounded — 651ms at 40k spaces, about a minute at
    // the 400 KB cap the HTTP API accepts.
    //
    // The lesson generalises: the earlier fixtures were all *repeated tokens*,
    // which exercise the happy path repeatedly rather than making a match fail
    // as late and as often as possible. New fixtures should be a plausible
    // prefix followed by a long run that never completes the match.
    ['label prefix, unterminated whitespace run', `example${' '.repeat(200_000)}`],
    ['field prefix, unterminated whitespace run', `Output${' '.repeat(200_000)}`],
    ['many unterminated label lines', `${`input${' '.repeat(2_000)}\n`.repeat(100)}`],
    ['fence prefix, unterminated', `${' '.repeat(100_000)}\`\`\``],
  ];

  for (const [name, input] of pathological) {
    it(`survives ${name}`, () => {
      const started = Date.now();
      optimize(input, { level: 'aggressive' });
      const elapsed = Date.now() - started;
      assert.ok(
        elapsed < BUDGET_MS,
        `took ${elapsed}ms on ${input.length} chars — suspect catastrophic backtracking in a recently added pattern`,
      );
    });
  }
});

describe('the CLI diff is bounded', () => {
  it('declines a diff too large to align rather than allocating for it', () => {
    // The alignment table is quadratic in lines. At 6,000 lines it is 36
    // million cells and roughly 288 MB before anything else runs, so a large
    // file passed to --diff could take the process down.
    //
    // Asserted against the source rather than by allocating 288 MB in a test:
    // the guard is a constant and a comparison, and reproducing the failure
    // would mean reintroducing it.
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');

    assert.match(cli, /const MAX_DIFF_LINES = \d+/, 'the diff line cap is gone');
    const cap = Number(/const MAX_DIFF_LINES = (\d+)/.exec(cli)[1]);
    assert.ok(cap > 0 && cap <= 5000, `cap of ${cap} lines is too high to be a bound`);

    // The cap has to be checked before the table is built, not after.
    const renderDiff = cli.slice(cli.indexOf('function renderDiff'));
    const guardAt = renderDiff.indexOf('MAX_DIFF_LINES');
    const tableAt = renderDiff.indexOf('lcsTable(');
    assert.ok(guardAt !== -1, 'renderDiff no longer checks the cap');
    assert.ok(guardAt < tableAt, 'the cap is checked after the table is already allocated');
  });
});

describe('the packaged Action', () => {
  // This is what other people run inside their own workflows, with their own
  // tokens in scope. It has to hold at least the standard this repository
  // holds itself to — for a while it did not.
  const action = readFileSync(join(repoRoot, 'action.yml'), 'utf8');

  it('installs without running dependency lifecycle scripts', () => {
    // Our own CI has had --ignore-scripts from the start; the action, which is
    // the one running on somebody else's runner, did not. That was backwards.
    const install = /npm ci[^\n]*/.exec(action);
    assert.ok(install, 'the action no longer installs');
    assert.match(install[0], /--ignore-scripts/, `npm ci is missing --ignore-scripts: ${install[0]}`);
  });

  /**
   * Every `${{ }}` interpolated into a shell script, whatever it interpolates.
   *
   * The previous version of this looked for `${{ inputs.* }}` inside a body it
   * matched with `/run:\s*(>-|\||>)?\s*\n([\s\S]*?)…/`, and it was ineffective
   * in two ways that only became visible when a feature needed the shapes it
   * missed:
   *
   * 1. The newline in that pattern is not optional, so `run: echo "${{ ... }}"`
   *    on one line was never recognised as a run block at all.
   * 2. Searching only for `inputs.` ignores every other interpolable value, and
   *    the dangerous ones are elsewhere: `github.event.pull_request.title`,
   *    `...body`, and `github.head_ref` are written by whoever opened the pull
   *    request. `inputs.*` is workflow-authored and the *safest* of the set.
   *
   * So the rule is now positional and source-blind: **nothing may be
   * interpolated into a `run:` body, ever.** A value's provenance is not
   * something a regex can judge, and a step that derives an input from a PR
   * title turns a "safe" source into an unsafe one without touching this file.
   *
   * Note the harm does not depend on the token being writable: substitution
   * happens before bash parses, so the payload executes on the caller's runner
   * with whatever secrets that job has in scope.
   */
  const interpolationsInRunBlocks = (yaml) => {
    const lines = yaml.split('\n');
    const found = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^(\s*)(?:- )?run:(.*)$/.exec(line);
      if (!match) continue;

      const [, indent, inline] = match;
      // `run: echo hi` — the body is on this line. This is the form the old
      // pattern could not see.
      if (inline.trim() !== '' && !/^\s*(\||>-?|>\+?)\s*$/.test(inline)) {
        if (inline.includes('${{')) found.push(`line ${i + 1}: ${line.trim()}`);
        continue;
      }

      // A block scalar: the body is every following line indented past the key.
      for (let j = i + 1; j < lines.length; j++) {
        const body = lines[j];
        if (body.trim() === '') continue;
        const bodyIndent = /^\s*/.exec(body)[0].length;
        if (bodyIndent <= indent.length) break;
        if (body.includes('${{')) found.push(`line ${j + 1}: ${body.trim()}`);
      }
    }
    return found;
  };

  it('never interpolates anything into a shell script', () => {
    assert.match(action, /\brun:/, 'no run blocks found — has the action changed shape?');
    assert.deepEqual(
      interpolationsInRunBlocks(action),
      [],
      'a template expression is interpolated straight into a shell script. ' +
        'Pass it through env: instead — substitution happens before bash parses, ' +
        'so quoting inside the template is not a fix.',
    );
  });

  it('the interpolation scanner actually catches what it claims to', () => {
    // Positive controls, because the version this replaced passed for two years
    // of shapes it could not see. A security test with no proof it can fail is
    // a test that passes.
    const mutants = [
      ['single-line run with an input', '    - name: X\n      shell: bash\n      run: echo "${{ inputs.file }}"'],
      ['block run with a PR title', '    - name: X\n      shell: bash\n      run: |\n        echo "${{ github.event.pull_request.title }}"'],
      ['block run with an input', '    - name: X\n      shell: bash\n      run: |\n        echo "${{ inputs.max-tokens }}"'],
      ['folded run with head_ref', '    - name: X\n      shell: bash\n      run: >-\n        echo "${{ github.head_ref }}"'],
      ['a step output threaded through', '    - name: X\n      shell: bash\n      run: echo "${{ steps.meta.outputs.title }}"'],
    ];

    for (const [name, snippet] of mutants) {
      assert.ok(
        interpolationsInRunBlocks(`${action}\n${snippet}\n`).length > 0,
        `the scanner does not catch: ${name}`,
      );
    }

    // And a negative control: the explanatory YAML comments in action.yml quote
    // `${{ inputs.file }}` in prose. Flagging those would make the test fail
    // when somebody documents the reasoning.
    assert.deepEqual(
      interpolationsInRunBlocks(action),
      [],
      'the scanner is flagging the comments that explain why the rule exists',
    );
  });

  it('the reporting steps run even when the check fails', () => {
    // A composite action skips the rest of its steps once one fails, so without
    // `if: always()` the summary and the comment would appear only on a passing
    // run — exactly the runs nobody needs a report for.
    const steps = action.split(/\n {4}- name: /).slice(1);
    const reporting = steps.filter((step) =>
      /run summary|Comment on the pull request|budget verdict/.test(step),
    );
    assert.equal(reporting.length, 3, 'the reporting steps changed shape');
    for (const step of reporting) {
      assert.match(step, /if: always\(\)/, `a reporting step lost always(): ${step.split('\n')[0]}`);
    }
  });

  it('the budget verdict is raised, and a missing outcome counts as failure', () => {
    // The check step deliberately does not end the job, so something has to. If
    // that step never reached its own last line, treating the absent value as a
    // pass would turn a crash into a green build.
    const verdict = action.slice(action.indexOf('Report the budget verdict'));
    assert.match(verdict, /TRAZUM_OUTCOME:-1/, 'a missing outcome must default to failure');
    assert.match(verdict, /exit 1/);
  });

  it('the comment step cannot fail the build', () => {
    // The report has already reached the run summary by then. A red build for
    // "could not comment" gets the action deleted rather than configured.
    const comment = action.slice(
      action.indexOf('Comment on the pull request'),
      action.indexOf('Report the budget verdict'),
    );
    assert.match(comment, /\|\| true/, 'the comment step must not be able to fail the job');
  });

  it('no workflow or the action uses pull_request_target', () => {
    // The event a reviewer reaches for when a fork PR cannot post a comment. It
    // runs with a writable token against the BASE repository while checking out
    // code the contributor controls, which is how "we just wanted to comment on
    // the PR" becomes arbitrary code execution with the repository's secrets.
    // If 0.11.0 ever needs it, that needs arguing in a pull request, not a
    // quiet addition.
    const workflows = readdirSync(join(repoRoot, '.github/workflows'))
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .map((name) => [name, readFileSync(join(repoRoot, '.github/workflows', name), 'utf8')]);

    assert.ok(workflows.length > 0, 'no workflows found — has the layout changed?');
    for (const [name, source] of [...workflows, ['action.yml', action]]) {
      assert.doesNotMatch(source, /pull_request_target/, `${name} uses pull_request_target`);
    }
  });

  it('passes every declared input through to the CLI', () => {
    // A declared input nobody reads is a promise the action does not keep.
    // Scoped to the `inputs:` block — matching two-space keys across the whole
    // file also picks up `steps:` under `runs:`.
    const inputsBlock = action.slice(action.indexOf('\ninputs:'), action.indexOf('\nruns:'));
    assert.ok(inputsBlock.length > 0, 'could not find the inputs block');
    const declared = [...inputsBlock.matchAll(/^ {2}([a-z][a-z-]*):$/gm)].map((m) => m[1]);
    assert.ok(declared.length >= 2, `only found ${declared.length} inputs — regex is wrong`);
    for (const input of declared) {
      assert.ok(
        action.includes(`inputs.${input}`),
        `input "${input}" is declared but never used`,
      );
    }
  });

  it('every input reference sits in an env: assignment or a condition', () => {
    // The stronger version of what this test used to check. It asserted that each
    // input reached a `TRAZUM_*` variable, which was a usefulness check dressed
    // as a security one — and it broke the moment an input legitimately gated a
    // step (`comment`) instead of being forwarded to the CLI.
    //
    // What actually matters is the *position*: an input may be assigned to an
    // environment variable, or tested in an `if:`, and nowhere else. Anywhere
    // else means a value being spliced into something that interprets it.
    const lines = action.split('\n');
    const misplaced = [];

    lines.forEach((line, index) => {
      if (!line.includes('${{')) return;
      if (/^\s*#/.test(line)) return; // a YAML comment explaining the rule
      const allowed =
        /^\s*[A-Za-z_][A-Za-z0-9_]*:\s*\$\{\{[^}]*\}\}\s*$/.test(line) || // ENV: ${{ ... }}
        /^\s*if:\s/.test(line) ||
        /^\s*working-directory:\s/.test(line);
      if (!allowed) misplaced.push(`line ${index + 1}: ${line.trim()}`);
    });

    assert.deepEqual(
      misplaced,
      [],
      `a template expression sits somewhere it could be interpreted:\n  ${misplaced.join('\n  ')}`,
    );
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import {
  allowedEndpoints,
  isPrivateHost,
  optimize,
  reorderForCache,
  resolveEndpoint,
  validateLlmEndpoint,
} from '../dist/index.js';

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

  /**
   * `reorderForCache` is not reached by `optimize`, so none of the fixtures
   * above touch it — and it shipped with two quadratic patterns that this suite
   * would have caught the moment it was pointed at them.
   *
   * Both were mine, both looked innocuous, and both are the same shape the
   * comment above describes: a long run that makes a match fail as late and as
   * often as possible. `split(/(?<=\n)(?=\s*\n)/)` re-consumed the whole run
   * at every position inside it (3.3s on 60 KB of newlines), and `/\s*$/` on a
   * prompt holding a long whitespace run that does *not* end in one took 31
   * seconds at 200 KB — inside the 400 KB the HTTP API accepts.
   */
  const reorderPathological = [
    // Sized so the old pattern is well past the budget rather than near it: at
    // 60k newlines it took 3.5s, which a 5s cliff detector would have waved
    // through. Quadratic means the fixture, not the budget, has to be honest.
    ['blank-line storm', `A.\n\n{{x}}${'\n'.repeat(120_000)}`],
    ['near-blank line storm', `A.\n\n{{x}}${'\n \n'.repeat(60_000)}`],
    ['CRLF storm', `A.\r\n\r\n{{x}}${'\r\n'.repeat(60_000)}`],
    ['whitespace run, prompt does not end in one', `${' '.repeat(200_000)}\n\n{{x}}\n\nBe brief.`],
    ['whitespace run after the placeholder', `A.\n\n{{x}}\n\n${' '.repeat(200_000)}`],
    ['block prefix, unterminated whitespace run', `A.\n\n{{x}}\n\nrule${' '.repeat(200_000)}`],
    ['tab and space run', `A.\n\n{{x}}\n\n${' \t'.repeat(100_000)}`],
    ['one block per blank line', `A.\n\n{{x}}\n\n${'Be brief.\n\n'.repeat(20_000)}`],
    ['unclosed placeholders', '{{'.repeat(30_000)],
    ['backward reference in every block', `A.\n\n{{x}}\n\n${'See above.\n\n'.repeat(20_000)}`],
  ];

  for (const [name, input] of reorderPathological) {
    it(`reorderForCache survives ${name}`, () => {
      const started = Date.now();
      reorderForCache(input);
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

  it('every third-party action is pinned to a commit SHA', () => {
    // A tag can be moved and a branch moves by design, so `@v3` means "whatever
    // that publisher pushes there next" — with our token and our secrets in
    // scope. `actions/dependency-review-action@v5` was the sharpest case: its
    // majors are published as *branches*, not tags.
    //
    // Pinning only freezes you if nothing bumps it, and .github/dependabot.yml
    // has a github-actions ecosystem entry that does. The `# vN` comment is what
    // Dependabot reads to know which line it is looking at.
    const SHA = /^[0-9a-f]{40}$/;
    const unpinned = [];

    for (const name of readdirSync(join(repoRoot, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = readFileSync(join(repoRoot, '.github/workflows', name), 'utf8');

      for (const [, ref] of source.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)) {
        // `./` is this repository's own action, checked out at the tested commit.
        if (ref.startsWith('./')) continue;
        const version = ref.split('@')[1];
        if (!version || !SHA.test(version)) unpinned.push(`${name}: ${ref}`);
      }
    }

    assert.deepEqual(
      unpinned,
      [],
      `an action is referenced by a movable ref rather than a commit:\n  ${unpinned.join('\n  ')}`,
    );
  });

  it('every pinned action says which version it is', () => {
    // The SHA is the security property; the trailing `# vN` is what makes the
    // file readable and what Dependabot matches on. A pin with no comment is a
    // line nobody can review and nothing will ever update.
    const missing = [];

    for (const name of readdirSync(join(repoRoot, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = readFileSync(join(repoRoot, '.github/workflows', name), 'utf8');

      for (const line of source.split('\n')) {
        if (!/^\s*(?:- )?uses:\s*\S+@[0-9a-f]{40}/.test(line)) continue;
        if (!/#\s*v?\d/.test(line)) missing.push(`${name}: ${line.trim()}`);
      }
    }

    assert.deepEqual(missing, [], `a pinned action has no version comment:\n  ${missing.join('\n  ')}`);
  });

  it('the docs recommend a SHA pin too, not a tag', (t) => {
    // The rule above governs what this repository runs. This one governs what it
    // *tells other people to run*, which had drifted: the README recommended
    // `Davmunrey/Trazum@v1.0.0` for a whole release — a tag that did not exist,
    // so the copy-pasteable example 404'd, and a tag at all, which is the exact
    // movable ref SECURITY.md warns against. Nothing was checking.
    const SHA_PIN = /^Davmunrey\/Trazum@[0-9a-f]{40}$/;
    const bad = [];
    /** Pins whose commit this clone does not have, reported rather than ignored. */
    const unchecked = [];
    let pins = 0;

    for (const name of ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'docs/authoring-rules.md']) {
      let source;
      try {
        source = readFileSync(join(repoRoot, name), 'utf8');
      } catch {
        continue;
      }
      for (const line of source.split('\n')) {
        // Only `uses:` lines are instructions to run something. Prose naming a
        // version, and the changelog's record of what past releases did, are not.
        const ref = /^\s*(?:- )?uses:\s*(Davmunrey\/Trazum\S*)/.exec(line);
        if (!ref) continue;
        pins += 1;
        if (!SHA_PIN.test(ref[1])) {
          bad.push(`${name}: ${ref[1]}`);
          continue;
        }
        // The comment has to name a version that exists, not one we hope to
        // release. The first pass at this test only asked for `#\s*v?\d`, and
        // the fix it was written to guard shipped saying `# 1.1.0` against
        // manifests reading 1.0.0 — a version with no tag and no package.
        const comment = /#\s*v?(\d+\.\d+\.\d+)/.exec(line);
        if (!comment) {
          bad.push(`${name}: ${ref[1]} (no version comment)`);
          continue;
        }

        /**
         * The label has to be true about **the commit it labels**, which is not
         * the same question as whether it matches the working tree.
         *
         * This compared the comment to `package.json` until 1.8.0 was prepared,
         * and that coupling made an honest release impossible: bumping the
         * manifests to 1.8.0 turned a correct `# 1.0.0` into a failure, and the
         * only ways to satisfy it were to relabel a 1.0.0 commit as 1.8.0 — a
         * lie about a real SHA — or to pin a commit that does not exist yet,
         * since the 1.8.0 commit is the one the bump is part of. A guard whose
         * only exits are a lie or a paradox is asking the wrong question.
         *
         * So it asks git. The pinned commit either says 1.0.0 in its own
         * manifest or it does not, and that is checkable without knowing
         * anything about what is being released today.
         */
        const sha = ref[1].split('@')[1];
        const show = spawnSync('git', ['show', `${sha}:package.json`], {
          cwd: repoRoot,
          encoding: 'utf8',
        });

        if (show.status !== 0) {
          // A shallow clone — CI checks out with the default `fetch-depth: 1`,
          // so the object is genuinely absent rather than wrong. Named out loud
          // rather than passed over: a check that quietly does nothing reports
          // the same "0 failures" as one that verified something.
          unchecked.push(`${name}: ${sha.slice(0, 7)} not in this clone`);
          continue;
        }

        const pinned = JSON.parse(show.stdout).version;
        if (comment[1] !== pinned) {
          bad.push(`${name}: comment says ${comment[1]}, ${sha.slice(0, 7)} says ${pinned}`);
        }
      }
    }

    assert.ok(pins > 0, 'no action pin found in the docs — has the example moved?');
    assert.deepEqual(
      bad,
      [],
      `the docs tell readers to use a movable or unlabelled ref:\n  ${bad.join('\n  ')}`,
    );
    if (unchecked.length > 0) {
      /**
       * On stderr, not through `t.diagnostic`, because the diagnostic does not
       * appear in this runner's default output — checked, in a shallow clone,
       * and the test passed printing nothing at all. A skip nobody can see is
       * the failure this repository keeps writing tests about, and writing one
       * into the test that was meant to avoid it would have been a good joke at
       * my expense.
       *
       * CI checks out with `fetch-depth: 0` so this branch never runs there.
       */
      console.error(`  ! label not verified against the pinned commit: ${unchecked.join(', ')}`);
    }
  });

  it('publishing needs no stored credential', () => {
    // The design decision in the release workflow, and the reason it uses npm
    // trusted publishing. A long-lived NPM_TOKEN would be the highest-value
    // credential this project holds, sitting in repository secrets permanently
    // for something used a few times a year — and unlike every other secret
    // here, a leak of it is not recoverable by rotation alone: whatever was
    // published under it stays published.
    const offenders = [];

    for (const name of readdirSync(join(repoRoot, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      // Comments stripped, for the third time in this file: the release
      // workflow's own comment explains why there is no NPM_TOKEN, and matching
      // that would fail the test for documenting the reasoning behind it.
      const source = readFileSync(join(repoRoot, '.github/workflows', name), 'utf8')
        .replace(/^\s*#.*$/gm, '')
        .replace(/\s#.*$/gm, '');
      if (/NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9]/.test(source)) offenders.push(name);
    }

    assert.deepEqual(
      offenders,
      [],
      `a workflow reaches for a publish token instead of OIDC:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('the release workflow cannot publish a version the tag does not name', () => {
    // A tag reading v1.2.0 against manifests reading 1.1.0 publishes 1.1.0 under
    // a release note for 1.2.0. npm allows unpublishing for 72 hours and then
    // the number is spent, so this is the one mistake with no correction.
    const release = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

    assert.match(release, /id-token:\s*write/, 'OIDC is not requested, so publishing cannot work');
    assert.match(release, /GITHUB_REF_NAME/, 'nothing reads the tag');
    assert.match(release, /--provenance/, 'published without provenance, which OIDC gives free');

    // Every publish step gated on a tag. A publish reachable from
    // workflow_dispatch would be a release with no tag to check against.
    const steps = release.split(/^      - /m).filter((s) => /run:\s*npm publish/.test(s));
    assert.ok(steps.length >= 2, 'both packages should have a publish step');
    for (const step of steps) {
      assert.match(
        step,
        /if:\s*startsWith\(github\.ref, 'refs\/tags\/'\)/,
        `a publish step is not gated on a tag:\n${step.slice(0, 200)}`,
      );
    }

    // The gate has to run the same checks the pull-request gate does. A release
    // that verifies less than a PR lets through exactly what the tag was for.
    assert.match(release, /npm run verify/, 'the release does not run the full verify');
    assert.ok(
      release.indexOf('npm run verify') < release.indexOf('npm publish'),
      'verify runs after publish, which is not a gate',
    );
  });

  it('a finding already on main fails a build, not only a new one', () => {
    // The gap the rest of this suite could not see. CodeQL's pull-request
    // check reports *new* alerts in the code that pull request changed, so a
    // finding already open on `main` is not new and every later pull request
    // goes green beside it. Eleven consecutive green runs happened that way,
    // with a critical SSRF alert open the whole time.
    const security = readFileSync(join(repoRoot, '.github/workflows/security.yml'), 'utf8');
    const job = security.slice(security.indexOf('open-alerts:'));

    assert.ok(job.length > 0, 'the open-alerts job is gone');
    assert.match(job, /code-scanning\/alerts\?state=open/, 'it no longer asks for open alerts');
    assert.match(job, /refs\/heads\/main/, 'it no longer asks about main');

    // Both severity fields. `severity` is the query's own rating and
    // `security_severity_level` is the CVSS-style one the UI shows as
    // "Critical" — reading only the first would have let today's critical
    // through as a mere "error".
    assert.match(job, /security_severity_level/, 'it reads the wrong severity field');
    assert.match(job, /critical/);
    assert.match(job, /high/);

    // It has to be able to fail. A gate that cannot is worse than none,
    // because it looks like coverage.
    assert.match(job, /exit 1/, 'the job cannot fail');
  });

  it('the alert gate waits for the analysis it reads', () => {
    // It did not, and the first merge that fixed both alerts failed because of
    // it. The two jobs started together, the gate finished in one second, and
    // CodeQL uploaded a full minute later — so the gate judged the merge
    // against the state of the commit before it and printed line numbers that
    // no longer existed. A gate racing its own input is not a gate; worse, a
    // red build for a fix that worked is how people learn to re-run until
    // green.
    const security = readFileSync(join(repoRoot, '.github/workflows/security.yml'), 'utf8');

    /**
     * The job with its YAML comments removed.
     *
     * The first version of this test asserted `/needs:\s*codeql/` against the
     * raw text and passed with the dependency deleted, because the comment
     * explaining the dependency says `needs: codeql` in prose. That is the
     * fourth time in this repository a test has matched the sentence describing
     * an invariant instead of the invariant, and it is the reason for the
     * mutant below: a rule that is only asserted positively cannot tell you
     * whether it can fail.
     */
    const jobOf = (yaml) =>
      yaml
        .slice(yaml.indexOf('open-alerts:'))
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n');

    assert.match(jobOf(security), /^\s*needs:\s*codeql\s*$/m, 'the gate can run before the analysis it reads');

    // The mutant: the same assertion has to fail with the line taken out.
    const withoutNeeds = security.replace(/^\s*needs:\s*codeql\s*$/m, '');
    assert.doesNotMatch(
      jobOf(withoutNeeds),
      /^\s*needs:\s*codeql\s*$/m,
      'the assertion passes without the dependency — it is matching prose again',
    );

    // Ordering is necessary and not sufficient: the alert index settles after
    // the upload returns. The job checks that every row it is about to report
    // belongs to the commit being built, rather than trusting the timing.
    const code = jobOf(security);
    assert.match(code, /most_recent_instance\.commit_sha/, 'the gate does not check freshness');
    assert.match(code, /GITHUB_SHA/);
  });

  it('the alert gate reports and never resolves', () => {
    // Read-only on purpose: a job that could dismiss an alert is a job that
    // could dismiss the alert it was written to surface.
    const security = readFileSync(join(repoRoot, '.github/workflows/security.yml'), 'utf8');
    const job = security.slice(security.indexOf('open-alerts:'));

    assert.match(job, /security-events: read/);
    assert.doesNotMatch(job, /security-events: write/, 'the alert gate can write to alerts');

    // Skipped on pull requests, where it would report the base branch's state
    // and fail somebody's unrelated work for a finding they cannot fix.
    assert.match(job, /if: github\.event_name != 'pull_request'/);
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

describe('every source file is reviewable as a diff', () => {
  /**
   * A NUL byte anywhere in the first 8,000 bytes makes git call the file
   * binary, and a binary file has no diff: `git show` prints `Bin 7652 ->
   * 7654 bytes` and a pull request renders it as "this file cannot be
   * displayed". Nothing warns you. The file still builds, still runs, still
   * passes every other test here.
   *
   * `scripts/measure-token-band.mjs` was that file for three commits, one of
   * which fixed a security finding in it, and none of which any reviewer could
   * read. It reached that state honestly: a raw NUL as a hash field separator,
   * typed into a template literal instead of written `\0`.
   *
   * The point of this repository's other invariants is that somebody can check
   * the code. This is the one that makes checking possible at all.
   */
  /**
   * Everything a reviewer reads, not just what ships.
   *
   * This walked each package's `src` and `scripts` only, and the defect it was written
   * to prevent came back one directory outside its reach:
   * `packages/core/test/reorder-properties.test.js` joined a token bag on a **raw
   * NUL** — the same mistake as `measure-token-band.mjs`, typed as a literal byte
   * instead of `\0`. git called that file binary, so any change to those property
   * tests would have rendered as `Bin 8385 -> 8386 bytes`, and this guard sat green
   * beside it for as long as it existed.
   *
   * A test directory is exactly where it matters most. Tests are the argument that
   * the code is right; a test nobody can read in a diff is an assertion taken on
   * trust, which is what this repository spends its time refusing to do.
   */
  const ROOTS = [
    'packages/core/src',
    'packages/core/test',
    'packages/cli/src',
    'packages/cli/test',
    'apps/web/app',
    'apps/web/components',
    'apps/web/lib',
    'apps/web/test',
    'action',
    'scripts',
    '.github',
  ];
  const EXTENSIONS = [
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.css',
  ];

  const sourceFiles = () => {
    const found = [];
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.next', 'fixtures'].includes(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}${entry.name}/`);
          continue;
        }
        if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
        found.push([`${prefix}${entry.name}`, path]);
      }
    };
    for (const root of ROOTS) walk(join(repoRoot, root), `${root}/`);
    return found;
  };

  it('holds no raw NUL byte, which is what turns a source file binary', () => {
    const files = sourceFiles();
    // The walk itself is the part that rots: a moved directory turns this into
    // a test of nothing, and it would still pass.
    assert.ok(files.length > 100, `only ${files.length} files found — the walk is wrong`);

    const binary = files
      .filter(([, path]) => readFileSync(path).includes(0))
      .map(([name]) => name);

    assert.deepEqual(
      binary,
      [],
      `git will treat these as binary and show no diff: ${binary.join(', ')}. ` +
        'Write the byte as \\0 in a string literal instead of embedding it.',
    );
  });
});

describe('SSRF: a caller selects an endpoint, it does not name one', () => {
  /**
   * The alert that would not close, at its actual source.
   *
   * `validateLlmEndpoint` guards the *shape* of a URL, and the web route was
   * treating that as sufficient: take `baseUrl` from the request body, check
   * it, fetch it. It never could have been sufficient. The host filter reads a
   * name, and a name the attacker registered resolves wherever they point it —
   * `https://fine.example.com` with an A record of 169.254.169.254 walks past
   * every pattern in this file. Closing that needs the resolved address pinned
   * at the socket, which `fetch` does not expose.
   *
   * So the body stopped naming hosts. It picks from a list the operator wrote,
   * and what gets fetched is the list's entry.
   */
  const LIST = { TRAZUM_ALLOWED_LLM_ENDPOINTS: 'https://api.openai.com/v1, https://api.deepseek.com' };

  it('offers nothing at all by default', () => {
    // The important one. A deployment that never heard of this variable cannot
    // be pointed anywhere by anybody.
    assert.deepEqual(allowedEndpoints({}), []);
    assert.deepEqual(allowedEndpoints({ TRAZUM_ALLOWED_LLM_ENDPOINTS: '' }), []);
    assert.equal(resolveEndpoint('https://api.openai.com/v1', []), null);
  });

  it('reads a comma-separated list and normalises it', () => {
    assert.deepEqual(allowedEndpoints(LIST), [
      'https://api.openai.com/v1',
      'https://api.deepseek.com',
    ]);
  });

  it('drops an entry the operator should not have written', () => {
    // Trusted to choose, not immune from pasting the metadata address into a
    // list that then serves every anonymous caller.
    assert.deepEqual(
      allowedEndpoints({
        TRAZUM_ALLOWED_LLM_ENDPOINTS:
          'https://169.254.169.254, http://llm.example.com, not-a-url, https://ok.example.com/v1',
      }),
      ['https://ok.example.com/v1'],
    );
  });

  it('returns the listed value, not the requested one', () => {
    // This is the entire point of the function and the reason the alert closes:
    // the string that arrived over HTTP is compared and then dropped on the
    // floor. Nothing derived from it reaches fetch.
    const allowed = allowedEndpoints(LIST);
    const requested = 'HTTPS://API.OPENAI.COM/v1/';
    const resolved = resolveEndpoint(requested, allowed);

    assert.equal(resolved, 'https://api.openai.com/v1');
    assert.ok(allowed.includes(resolved), 'the resolved value did not come off the list');
    assert.notEqual(resolved, requested);
  });

  it('refuses a host that is merely public', () => {
    // The old check would have passed every one of these: valid https, public
    // host, no credentials. "Public" is not "fine to fetch for a stranger".
    const allowed = allowedEndpoints(LIST);
    for (const url of [
      'https://attacker.example.com/v1',
      'https://api.openai.com.attacker.example.com/v1',
      'https://api.openai.com@attacker.example.com/v1',
    ]) {
      assert.equal(resolveEndpoint(url, allowed), null, `${url} was allowed through`);
    }
  });

  it('refuses a path on a host that is on the list', () => {
    // Being allowed to reach api.openai.com is not being allowed to reach any
    // path on it. The entry is an endpoint, not a domain.
    const allowed = allowedEndpoints(LIST);
    assert.equal(resolveEndpoint('https://api.openai.com/v1/../../internal', allowed), null);
    assert.equal(resolveEndpoint('https://api.openai.com/admin', allowed), null);
  });
});

describe('the one module that runs another program', () => {
  /**
   * `packages/cli/src/git.ts` exists so that shelling out happens in exactly
   * one place, under rules a reviewer can check in one sitting. These assert
   * the rules rather than trusting the comment that states them.
   *
   * The rest of this file is about what a *prompt* can do to Trazum. This is
   * about what a *filename* can: git has options that run programs, and a path
   * reaching git without a `--` in front of it is not a path.
   */
  const gitModule = join(repoRoot, 'packages/cli/src/git.ts');

  const codeOf = (file) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');

  it('is the only file in the repository that spawns a process', () => {
    // The invariant that makes the rest of this suite worth writing. A second
    // caller elsewhere would get none of these guarantees, and nothing would
    // say so.
    const offenders = [];
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
          continue;
        }
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}${entry.name}/`);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
        if (path === gitModule) continue;
        if (/\bfrom\s+['"]node:child_process['"]/.test(codeOf(path))) {
          offenders.push(`${prefix}${entry.name}`);
        }
      }
    };
    for (const root of ['packages/core/src', 'packages/cli/src', 'apps/web']) {
      walk(join(repoRoot, root), `${root}/`);
    }

    assert.deepEqual(
      offenders,
      [],
      `child_process appeared outside git.ts: ${offenders.join(', ')}`,
    );
  });

  it('never lets a shell interpret anything', () => {
    const code = codeOf(gitModule);
    assert.match(code, /shell:\s*false/, 'the spawn does not state shell: false');
    assert.doesNotMatch(code, /shell:\s*true/);
    assert.doesNotMatch(code, /\bexec(Sync)?\s*\(/, 'exec runs its argument through a shell');
  });

  it('puts every path after a `--` separator', () => {
    // Each `git(...)` call that takes a repoPath must have '--' before it. A
    // file called `--upload-pack=…` is otherwise an instruction.
    const code = codeOf(gitModule);
    const calls = code.match(/git\(\s*\[[\s\S]*?\]/g) ?? [];
    assert.ok(calls.length >= 3, `only found ${calls.length} git calls — has the shape changed?`);

    const withPath = calls.filter((call) => /repoPath/.test(call));
    assert.ok(withPath.length > 0, 'no call passes a path any more');

    for (const call of withPath) {
      // Two legitimate shapes, and this test exists because the difference is
      // easy to miss:
      //
      //   git log ... -- <path>        the path is its own argument, so it
      //                                needs the separator or git reads it as
      //                                an option.
      //   git show <sha>:<path>        one argument, and `--` does not apply.
      //                                Safe only because the sha is validated
      //                                as 40 hex first, which fixes what the
      //                                argument starts with. Without that
      //                                check this branch would be the hole.
      const separated =
        call.indexOf("'--'") !== -1 && call.indexOf("'--'") < call.indexOf('repoPath');
      const gluedToCheckedSha = /\$\{sha\}:\$\{repoPath\}/.test(call);

      assert.ok(
        separated || gluedToCheckedSha,
        `a path reaches git without a separator in front of it:\n${call}`,
      );
    }

    // And the second shape is only safe while the check is there, so it is
    // asserted here too rather than left to the test below.
    if (withPath.some((call) => /\$\{sha\}:\$\{repoPath\}/.test(call))) {
      assert.match(
        code,
        /if \(!SHA\.test\(sha\)\) return null;[\s\S]{0,200}\$\{sha\}:\$\{repoPath\}/,
        'the sha:path form is used without validating the sha immediately before it',
      );
    }
  });

  it('validates an object name before gluing it to a path', () => {
    // `git show <sha>:<path>` is one argument. Without the check, the "sha"
    // half decides what the argument starts with.
    const code = codeOf(gitModule);
    assert.match(code, /SHA\s*=\s*\/\^\[0-9a-f\]\{40\}\$\//);
    assert.match(code, /if \(!SHA\.test\(sha\)\) return null;/);
  });

  it('bounds time and memory, so a hostile repository cannot hang the CLI', () => {
    const code = codeOf(gitModule);
    assert.match(code, /timeout:\s*TIMEOUT_MS/);
    assert.match(code, /maxBuffer:\s*MAX_BUFFER/);
  });

  it('does not let git prompt for credentials', () => {
    // A `git show` that stops to ask for a password is a CLI that hangs with no
    // output, in CI, for ever.
    assert.match(codeOf(gitModule), /GIT_TERMINAL_PROMPT: '0'/);
  });
});

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
  it('only the modules that exist to read files mention fs', () => {
    // The web app exposes optimize() over HTTP with a prompt from the request
    // body. If any module on that path grew a file read, a path in a prompt
    // would become a file the server hands back — path traversal, reachable by
    // anyone who can reach the API. The config loader and the directory walk
    // are the two modules that legitimately read from disk; both are CLI-only.
    const allowed = new Set(['config.ts', 'walk.ts']);
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
        if (/\bnode:fs\b|require\(['"]fs['"]\)/.test(readFileSync(path, 'utf8'))) {
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

  it('the directory walk refuses to follow a symlink', () => {
    // Pinned in the source as well as behaviourally: dropping this check would
    // turn "check the prompts folder" into reading whatever a link points at,
    // and a link loop into a hang.
    const source = readFileSync(join(repoRoot, 'packages/core/src/walk.ts'), 'utf8');
    assert.match(source, /isSymbolicLink\(\)/);
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

  it('never interpolates an input into a shell script', () => {
    // `${{ inputs.file }}` spliced into `run:` is the classic Actions
    // template-injection shape. The substitution happens before bash sees it,
    // so quoting inside the template is not a fix — the value has to arrive
    // through the environment.
    const runBlocks = [...action.matchAll(/run:\s*(>-|\||>)?\s*\n([\s\S]*?)(?=\n {4}- |\n[a-z]|$)/g)];
    assert.ok(runBlocks.length > 0, 'no run blocks found — has the action changed shape?');

    for (const [, , body] of runBlocks) {
      const interpolated = body.match(/\$\{\{\s*inputs\.[^}]*\}\}/g);
      assert.equal(
        interpolated,
        null,
        `an input is interpolated straight into a shell script: ${interpolated?.join(', ')}`,
      );
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
      const envName = input.replace(/-/g, '_').toUpperCase();
      assert.ok(
        action.includes(`inputs.${input}`),
        `input "${input}" is declared but never used`,
      );
      assert.ok(
        new RegExp(`TRAZUM_[A-Z_]*${envName.split('_').pop()}`).test(action),
        `input "${input}" is declared but never reaches the CLI`,
      );
    }
  });
});

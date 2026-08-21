import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * Every module that can reach the network is named in SUPPORT.md.
 *
 * The "No telemetry" section said *"The only network calls any of them make are
 * the ones you asked for"* and then listed three: `connect`, `--pricing-live`,
 * and the model calls. **Three of the seven were missing**, and one of them was
 * `trazum gateway` — which forwards your entire prompt and your credential to
 * the provider, and has done since 1.50.3.
 *
 * The others were `--exact-tokens`, which calls Anthropic's `count_tokens`
 * endpoint, and `trazum watch --webhook`, which POSTs an alert to a URL you
 * gave it. Each is a call somebody asked for. That is not the point: the
 * sentence claimed to enumerate them, on the page a reader opens **to check
 * whether this tool phones home**, and an enumeration missing its largest
 * member is wrong however defensible each omission was.
 *
 * The file set is derived; the map from file to prose is deliberate. That
 * asymmetry is the design. A new module that can reach the network fails this
 * test by name, and the only way to make it pass is to decide what SUPPORT.md
 * should say about it — which is the review a new outbound surface deserves.
 */

/** How SUPPORT.md must refer to each module that can reach the network. */
const SURFACES = {
  'packages/cli/src/connect.ts': 'trazum connect',
  'packages/cli/src/index.ts': '--pricing-live',
  'packages/cli/src/watch-run.ts': 'trazum watch --webhook',
  'packages/cli/src/gateway-server.ts': 'trazum gateway',
  'packages/core/src/gcp-auth.ts': 'Vertex AI',
  'packages/core/src/llm.ts': 'TRAZUM_LLM_',
  'packages/core/src/tokenizer.ts': '--exact-tokens',
};

/**
 * Modules with a real call site, aliases included.
 *
 * `gateway-server.ts` assigns `const doFetch = context.fetchImpl ?? fetch` and
 * calls `doFetch(...)`. The first version of this scan matched only `fetch(`
 * and `fetchImpl(`, so **the gateway — the very surface that was missing from
 * the prose — was also missing from the check written to find it.** Aliases
 * assigned from `fetch` are resolved before counting.
 */
const networkCapable = () => {
  /**
   * Tracked **and** untracked-but-not-ignored.
   *
   * The first version listed only tracked files, and the planted probe — a new
   * module calling `fetch`, written but not yet `git add`ed — sailed past it.
   * CI would have caught it once committed, which is exactly the reassurance
   * that lets a guard be useless where it is actually used: at the desk, before
   * the commit.
   */
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => f.endsWith('.ts') && f.includes('/src/') && !f.startsWith('apps/'));

  const reaching = [];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const aliases = [...source.matchAll(/const (\w+)\s*=\s*[^;]*\bfetch\b/g)].map((m) => m[1]);
    const names = ['fetch', 'fetchImpl', ...aliases].join('|');
    if (new RegExp(`\\b(?:${names})\\s*\\(`).test(source)) reaching.push(file);
  }
  return reaching;
};

describe('SUPPORT.md lists every way this tool can reach the network', () => {
  const reaching = networkCapable();

  it('found the call sites at all', () => {
    assert.ok(reaching.length >= 5, `only ${reaching.length} network-capable modules found`);
  });

  it('has a decided entry for every module that can call out', () => {
    const undecided = reaching.filter((file) => !(file in SURFACES));
    assert.deepEqual(
      undecided,
      [],
      'these modules can reach the network and nothing here says what SUPPORT.md should ' +
        `say about them — decide, then add the entry: ${undecided.join(', ')}`,
    );
  });

  it('and SUPPORT.md actually says it', () => {
    const support = readFileSync(join(repoRoot, 'SUPPORT.md'), 'utf8');
    const missing = reaching
      .filter((file) => SURFACES[file] && !support.includes(SURFACES[file]))
      .map((file) => `${file} → "${SURFACES[file]}"`);
    assert.deepEqual(
      missing,
      [],
      `SUPPORT.md claims to list every outbound call and omits:\n  ${missing.join('\n  ')}`,
    );
  });

  it('does not put a count in front of the list', () => {
    // The first draft of the fix wrote "six" above a table of seven rows — the
    // same failure this session has now corrected in three other files. There
    // is no number to get wrong if there is no number.
    const support = readFileSync(join(repoRoot, 'SUPPORT.md'), 'utf8');
    const sentence = support
      .split(/(?<=:)\s*\n/)
      .find((s) => /here is the whole list/.test(s));
    assert.ok(sentence, 'the outbound-call list has lost its introduction');
    assert.doesNotMatch(
      sentence.replace(/\s+/g, ' '),
      /\b(two|three|four|five|six|seven|eight|nine|ten|\d+)\b/,
      'the sentence introducing the outbound list states a count, which will go stale',
    );
  });
});

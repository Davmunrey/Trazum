import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { UPSTREAMS } from '../dist/gateway-server.js';

const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * Every host this repository names, and what it was decided to be.
 *
 * `https://generativelanguage.googleapis.com` sat in `packages/core/src/llm.ts`
 * for releases, carrying a real API key, while the gateway's own page said
 * Google was one of the providers it could not front. Nothing was wrong with
 * either file. What was missing was any place that held **both** facts at once,
 * so nobody could see that one answered the other.
 *
 * It was found by hand, by dumping every `https://` string in the repository
 * and reading the list. That worked, and it is not a thing anybody will do
 * again on a schedule. This is that dump, kept.
 *
 * The design is the one `outbound-surfaces.test.js` proved: **the host set is
 * derived, the decision about each host is deliberate.** A host that appears in
 * a source file and is not in the map below fails this test by name, and the
 * only way to make it pass is to decide what that host is — which is the review
 * a new destination deserves, and the review Google's host never got.
 */

/** What a host was decided to be. A decision outside this vocabulary is a typo. */
const KINDS = new Set([
  /** The gateway forwards a user's credential here. Must be in `UPSTREAMS`. */
  'gateway upstream',
  /**
   * A model call carrying a credential that a transparent proxy **cannot**
   * front — not "has not yet". Each one here has a reason proven from this
   * repository's own code, recorded in `WHY_NOT_FRONTED`.
   */
  'model call, cannot be fronted',
  /**
   * A model call carrying a plain credential that the gateway could front and
   * does not. **Nothing is allowed to carry this kind.** It exists so that a
   * provider endpoint arriving in this repository has an honest label
   * available, and choosing it fails the build with the chapter to write.
   */
  'model call, not yet fronted',
  /** Trades a key for a short-lived token. Not where a prompt goes. */
  'credential exchange',
  /** Public data, fetched with no credential at all. */
  'public data, no credential',
  /** Reaches GitHub or npm. Never a model call, never a prompt. */
  'tooling, not a model call',
  /** Printed for a human to open. Nothing is sent here. */
  'documentation link',
  /**
   * A URI that exists to be compared, never resolved — the JSON Schema
   * dialect identifier is the case. Distinct from a documentation link
   * because no human is meant to open it either: it is data about data,
   * and a build that fetched it would be wrong, not slow.
   */
  'identifier, never fetched',
  /** Appears only as an example, a placeholder or a test fixture. */
  'example',
]);

const HOSTS = {
  'https://api.anthropic.com': 'gateway upstream',
  'https://api.openai.com': 'gateway upstream',
  'https://api.deepseek.com': 'gateway upstream',
  'https://generativelanguage.googleapis.com': 'gateway upstream',

  'https://aiplatform.googleapis.com': 'model call, cannot be fronted',
  'https://bedrock-runtime.': 'model call, cannot be fronted',

  'https://oauth2.googleapis.com': 'credential exchange',
  'https://www.googleapis.com': 'credential exchange',

  'https://openrouter.ai': 'public data, no credential',

  'https://api.github.com': 'tooling, not a model call',
  'https://registry.npmjs.org': 'tooling, not a model call',

  // The JSON Schema dialect identifier inside every schema `trazum schema`
  // prints. An identifier by the spec, never fetched: nothing in this
  // repository makes a request to it, and a validator that did would be
  // fetching a well-known constant.
  'https://json-schema.org': 'identifier, never fetched',

  'https://docs.anthropic.com': 'documentation link',
  'https://platform.openai.com': 'documentation link',
  'https://www.promptfoo.dev': 'documentation link',
  'https://github.com': 'documentation link',

  'https://api.example': 'example',
  'https://api.github.test': 'example',
  'https://ghe.internal': 'example',
  'https://example.com': 'example',
  'https://totally-fine.example.com': 'example',
  'https://llm.example.com': 'example',
  'https://host': 'example',
  'https://your-llm': 'example',
  'https://tu-llm': 'example',
};

/**
 * Why each unfrontable model call cannot be fronted — from this repository's
 * code, not from anybody's understanding of the vendor.
 *
 * Both reasons turn out to be the same one, which is why they are worth
 * writing down rather than assumed: **the origin is not a constant.** The
 * gateway compiles its upstream in precisely so that nothing a caller controls
 * can choose where their key goes, and a per-caller region is a caller-chosen
 * host wearing a different name.
 */
const WHY_NOT_FRONTED = {
  'https://bedrock-runtime.':
    'the default is `https://bedrock-runtime.${region}.amazonaws.com` — the harvest ' +
    'truncates at the interpolation, which is itself the evidence — and `signRequest` ' +
    'is given `host`, so SigV4 signs the origin: a proxy that rewrote it would invalidate ' +
    'the signature it forwarded',
  'https://aiplatform.googleapis.com':
    'the default is `https://${location}-aiplatform.googleapis.com` for every region but ' +
    'global, so fronting it would mean a caller-supplied origin — the one thing ' +
    'security.test.js exists to refuse',
};

/**
 * Tracked **and** untracked-but-not-ignored, the same correction
 * `outbound-surfaces.test.js` needed: a new module written and not yet added
 * would otherwise sail past the check at the desk, where it is actually used,
 * and only fail once committed.
 */
const harvest = () => {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .filter(
      (f) =>
        (/\/src\/.*\.ts$/.test(f) || /^scripts\/.*\.mjs$/.test(f) || /^action\/.*\.(ts|mjs|js)$/.test(f)) &&
        !f.startsWith('apps/'),
    );

  const found = new Map();
  for (const file of files) {
    for (const [origin] of readFileSync(join(repoRoot, file), 'utf8').matchAll(
      /https:\/\/[a-zA-Z0-9._-]+/g,
    )) {
      if (!found.has(origin)) found.set(origin, []);
      if (!found.get(origin).includes(file)) found.get(origin).push(file);
    }
  }
  return found;
};

describe('every host this repository names has been decided about', () => {
  const found = harvest();

  it('found the hosts at all', () => {
    assert.ok(found.size >= 20, `only ${found.size} hosts harvested — has the scan broken?`);
  });

  it('has a decision for every one', () => {
    const undecided = [...found]
      .filter(([origin]) => !(origin in HOSTS))
      .map(([origin, files]) => `${origin} (${files.join(', ')})`);
    assert.deepEqual(
      undecided,
      [],
      'these hosts appear in source and nothing says what they are — decide, then add ' +
        `the entry:\n  ${undecided.join('\n  ')}`,
    );
  });

  it('and no decision for a host that has since gone', () => {
    // The other direction. A stale entry is how this list stops describing the
    // repository and starts describing its own history.
    const gone = Object.keys(HOSTS).filter((origin) => !found.has(origin));
    assert.deepEqual(gone, [], `decided but no longer named anywhere: ${gone.join(', ')}`);
  });

  it('uses no decision outside the vocabulary', () => {
    const strange = Object.entries(HOSTS).filter(([, kind]) => !KINDS.has(kind));
    assert.deepEqual(strange, [], `unknown decision kinds: ${JSON.stringify(strange)}`);
  });
});

describe('the decisions agree with the gateway, in both directions', () => {
  const decided = Object.entries(HOSTS)
    .filter(([, kind]) => kind === 'gateway upstream')
    .map(([origin]) => origin)
    .sort();
  const compiled = [...new Set(Object.values(UPSTREAMS).map((u) => u.origin))].sort();

  it('every host called an upstream is one', () => {
    assert.deepEqual(decided, compiled);
  });

  it('every unfrontable model call says why, from the code', () => {
    const unexplained = Object.entries(HOSTS)
      .filter(([origin, kind]) => kind === 'model call, cannot be fronted' && !WHY_NOT_FRONTED[origin])
      .map(([origin]) => origin);
    assert.deepEqual(
      unexplained,
      [],
      `"cannot be fronted" with no reason recorded: ${unexplained.join(', ')}`,
    );

    // The reasons are claims about files in this repository. Check they still
    // say what the reason says they say, rather than trusting the prose.
    const llm = readFileSync(join(repoRoot, 'packages/core/src/llm.ts'), 'utf8');
    assert.match(llm, /https:\/\/bedrock-runtime\.\$\{region\}\.amazonaws\.com/);
    assert.match(llm, /signRequest\(\{[\s\S]{0,400}?\bhost,/);
    assert.match(llm, /https:\/\/\$\{location\}-aiplatform\.googleapis\.com/);
  });
});

describe('and a provider endpoint the gateway could front sets off the alarm', () => {
  /**
   * The point of the whole file.
   *
   * `mistral`, `xai` and `moonshot` are priced and unfronted because their
   * hosts are nowhere here. The day one arrives — in a script, a provider, a
   * test fixture — it fails the decision check above by name, and the only
   * honest label for a plain-credential model endpoint is the one that fails
   * here with the chapter to write.
   */
  const alarm = (hosts) =>
    Object.entries(hosts)
      .filter(([, kind]) => kind === 'model call, not yet fronted')
      .map(([origin]) => origin);

  it('nothing carries that label today', () => {
    assert.deepEqual(
      alarm(HOSTS),
      [],
      'a provider endpoint is committed here and the gateway does not front it — ' +
        '1.53 has a chapter to write for it',
    );
  });

  it('and the alarm is not a check that can never fire', () => {
    /**
     * Handed a planted map, because a filter run only over today's values
     * proves nothing about tomorrow's. The same lesson as the gateway's
     * anchored-pattern check: an assertion whose input can only be the correct
     * one is coverage in appearance only.
     */
    assert.deepEqual(alarm({ 'https://api.somewhere.example': 'model call, not yet fronted' }), [
      'https://api.somewhere.example',
    ]);
    assert.deepEqual(alarm({ 'https://api.somewhere.example': 'example' }), []);
  });
});

describe('the band harness only reaches hosts the gateway already fronts', () => {
  /**
   * `scripts/measure-token-band.mjs` sends a real API key to every provider it
   * measures — the same act the gateway performs, from a file nobody thinks of
   * as security-sensitive. It was in fact where DeepSeek's endpoint had been
   * sitting when the gateway was still refusing DeepSeek as unsupported, and
   * where Google's would have been sitting had `llm.ts` not held it first.
   *
   * So the harness is tied to the same allowlist. Its origins must be ones the
   * gateway forwards to, which means adding a family to the harness requires
   * the same deliberate edit to `security.test.js` that adding an upstream
   * does. A measuring script is not a side door.
   */
  const harness = readFileSync(join(repoRoot, 'scripts/measure-token-band.mjs'), 'utf8');

  const called = [
    ...new Set(
      [...harness.matchAll(/fetch\(\s*'(https:\/\/[a-zA-Z0-9._-]+)/g)].map((m) => m[1]),
    ),
  ].sort();

  const fronted = [...new Set(Object.values(UPSTREAMS).map((u) => u.origin))].sort();

  it('found the call sites at all', () => {
    assert.ok(called.length >= 2, `only ${called.length} hosts found in the harness`);
  });

  const strangersIn = (origins) => origins.filter((origin) => !fronted.includes(origin));

  it('reaches nothing the gateway does not front', () => {
    const strangers = strangersIn(called);
    assert.deepEqual(
      strangers,
      [],
      'the band harness sends a credential to hosts the gateway has never been ' +
        `reviewed for: ${strangers.join(', ')}`,
    );
  });

  it('and that check is not one that can never fire', () => {
    /**
     * A brand-new host in the harness fails the **decision** check above first,
     * so this assertion would never have run against anything it should reject
     * — the third time this session that a filter over today's correct values
     * turned out to prove nothing.
     *
     * The case it actually exists for is subtler and would have slipped past: a
     * host already decided about, and decided to be something other than an
     * upstream. `docs.anthropic.com` is in the map as a documentation link. A
     * harness that fetched it would satisfy every other check in this file.
     */
    assert.deepEqual(strangersIn(['https://docs.anthropic.com']), ['https://docs.anthropic.com']);
    assert.deepEqual(strangersIn(fronted), []);
  });

  it('and exactly one family governs the published band', () => {
    /**
     * The hazard the whole harness is built around: `±10%` is measured against
     * Claude's tokenizer, and a second `governsPublishedBand: true` would let a
     * different family's number be read as the published claim.
     *
     * Counted from the source rather than from the fixtures, because the
     * fixtures do not exist on a clean checkout — which is exactly how
     * `token-band.test.js` once reported "0 failures" for a directory that was
     * not there.
     */
    const governs = [...harness.matchAll(/governsPublishedBand:\s*(true|false)/g)].map((m) => m[1]);
    assert.ok(governs.length >= 4, `only ${governs.length} providers declare a band role`);
    assert.equal(
      governs.filter((value) => value === 'true').length,
      1,
      'the published band is Claude-calibrated; exactly one family may claim it',
    );
  });
});

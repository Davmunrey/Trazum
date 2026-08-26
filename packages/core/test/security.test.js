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

/**
 * Provider credentials, introduced by the usage connectors in 1.41.
 *
 * The connector reads an admin key from the environment to pull a bill. That
 * is the first credential this product handles that belongs to *somebody
 * else's* account, and the two ways to leak it are committing it and printing
 * it. Both are checked here rather than promised in a comment.
 */
describe('provider credentials are borrowed, never held', () => {
  /** Files a human writes: source, tests, docs, workflows, examples. */
  const textFiles = () => {
    const out = [];
    const skip = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|txt)$/.test(entry.name)) out.push(full);
      }
    };
    walk(repoRoot);
    return out;
  };

  it('no real provider key material is committed anywhere in this repository', () => {
    /**
     * Shaped against what a *real* key looks like — `sk-ant-api03-` and
     * `sk-proj-` carry bodies of forty characters and up — so an obviously
     * fake fixture in a test stays legal and a leaked key does not. A guard
     * that banned every `sk-` string would be turned off within a week.
     */
    const REAL_KEY = /\bsk-(?:ant-[a-z0-9]+-|proj-)?[A-Za-z0-9_-]{40,}\b/;
    const offenders = [];
    for (const file of textFiles()) {
      const source = readFileSync(file, 'utf8');
      if (REAL_KEY.test(source)) offenders.push(file.slice(repoRoot.length + 1));
    }
    assert.deepEqual(offenders, [], 'credential material is committed in these files');
  });

  it('the module that holds a key cannot print', () => {
    // Everything reachable from the connector's fetch path runs with the key
    // in scope. A `console` call there is one refactor away from being handed
    // the wrong variable, so the module is simply not allowed one.
    const source = readFileSync(join(repoRoot, 'packages/cli/src/connect.ts'), 'utf8');
    assert.doesNotMatch(source, /\bconsole\s*\./, 'connect.ts must not write to a terminal');
    assert.doesNotMatch(source, /writeFile|appendFile/, 'connect.ts must not write to disk');
  });

  it('every provider response body reaches an error through redaction', () => {
    // A provider that quotes a key back inside its own error body — the
    // mistyped one, one from a proxy's log line — leaks it through our output
    // unless the body is redacted on the way. Checked structurally: any line
    // interpolating the body must also call redact.
    const source = readFileSync(join(repoRoot, 'packages/cli/src/connect.ts'), 'utf8');
    const offenders = source
      .split('\n')
      .filter((line) => /\$\{[^}]*\bbody\b/.test(line) && !line.includes('redact('));
    assert.deepEqual(offenders, [], 'a provider response body reaches an error unredacted');
  });

  it('the connector endpoints are compiled in, not taken from a flag', () => {
    // Trazum's SSRF posture since 1.14: a caller selects an endpoint, never
    // names one. A usage connector that accepted a base URL would hand that
    // property back.
    const source = readFileSync(join(repoRoot, 'packages/cli/src/connect.ts'), 'utf8');
    assert.match(source, /const ENDPOINTS: Record<string, string> = \{/);
    assert.doesNotMatch(source, /stringFlag\(\s*args\s*,\s*['"]base-url['"]/);
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const connectFlags = /connect: \[([^\]]*)\]/.exec(cli);
    assert.ok(connectFlags, 'the connect command must declare its flags');
    assert.doesNotMatch(connectFlags[1], /base-url|endpoint|url/);
  });
});

/**
 * The webhook, introduced by `watch` in 1.43.
 *
 * A new outbound surface: this tool now sends something somewhere the
 * operator named. That is not the SSRF case `checkedEndpoint` guards — the
 * URL is in the operator's own config rather than an anonymous request body —
 * but two properties still have to hold, and holding them by test beats
 * holding them by intention.
 */
describe('the alert webhook', () => {
  const source = () => readFileSync(join(repoRoot, 'packages/cli/src/watch-run.ts'), 'utf8');

  it('refuses credentials in the URL and plain http off loopback', async () => {
    const { checkWebhook } = await import(
      join(repoRoot, 'packages/cli/dist/watch-run.js')
    );
    assert.equal(checkWebhook('https://alerts.example.com/hook').ok, true);
    // Pointing a watcher at your own daemon is the ordinary case, not an attack.
    assert.equal(checkWebhook('http://localhost:9000/hook').ok, true);
    assert.equal(checkWebhook('http://127.0.0.1:9000/hook').ok, true);

    // A URL ends up in logs, shell history and error messages.
    assert.equal(checkWebhook('https://user:secret@alerts.example.com/h').reason, 'credentials-in-url');
    // An alert carries spend figures; in the clear across a network is a leak.
    assert.equal(checkWebhook('http://alerts.example.com/hook').reason, 'insecure-scheme');
    assert.equal(checkWebhook('not a url').reason, 'invalid-url');
  });

  it('sends figures and gate names, and never anything a prompt touched', () => {
    // The alert body is built from the crossing type alone. If this file ever
    // starts reaching for a report's slices or a record's group, the payload
    // stops being figures — so the shape it may serialise is pinned here.
    // Comments are stripped first: this is a claim about the code, and the
    // prose above it is allowed to say the word "prompt" while explaining why
    // the code may not touch one.
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /crossings: WatchCrossing\[\]/);
    assert.doesNotMatch(code, /prompt|completion|inputTokens|\bgroup\b/i);
  });

  it('cannot take the alert down with it when a receiver is off', () => {
    // The exit code and the stdout event already carried the crossing. A
    // throw here would make a receiver being down the loudest failure and the
    // crossing the quietest.
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /catch \(error\)/);
    assert.doesNotMatch(code, /throw new Error/);
  });
});

/**
 * The local endpoint, introduced by `serve` in 1.44.
 *
 * This is the first time Trazum *listens*. What it holds is a company's
 * spend, its model mix and its budgets, and it answers whoever asks — so the
 * surface stays small enough not to need an auth story, and small is enforced
 * here rather than intended in a comment.
 */
describe('the local endpoint', () => {
  const source = () => readFileSync(join(repoRoot, 'packages/cli/src/serve.ts'), 'utf8');
  const code = () =>
    source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('binds loopback, compiled in, with no way to say otherwise', () => {
    assert.match(code(), /BIND_HOST = '127\.0\.0\.1'/);
    // A host taken from a flag or the environment is how a local oracle ends
    // up on 0.0.0.0 in somebody's container.
    assert.doesNotMatch(code(), /0\.0\.0\.0|::\s*'|process\.env/);
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const serveFlags = /serve: \[([^\]]*)\]/.exec(cli);
    assert.ok(serveFlags, 'the serve command must declare its flags');
    assert.doesNotMatch(serveFlags[1], /host|bind|address|remote/);
  });

  it('refuses a body it would have to buffer without limit', () => {
    // A prompt is text and text is unbounded; an oracle that buffers whatever
    // it is handed is one request away from taking down the caller that was
    // asking how to spend less.
    assert.match(code(), /MAX_BODY_BYTES/);
    assert.match(code(), /body too large/);
  });

  it('answers only the two shapes it documents', () => {
    // Every path that is not /health or /cost is a 404 rather than something
    // that grew by accident.
    const text = code();
    assert.match(text, /'\/health'/);
    assert.match(text, /'\/cost'/);
    assert.match(text, /404/);
  });
});

/**
 * The agent-facing tool surface, widened by `spend_guard` in 1.45.
 *
 * An agent can now ask this server questions in a loop. The rule that keeps
 * that safe is not about what it may read — it is about what it may *cause*.
 */
describe('the MCP tool surface', () => {
  const source = () => readFileSync(join(repoRoot, 'packages/mcp/src/tools.ts'), 'utf8');
  const code = () =>
    source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('cannot make Trazum spend somebody else\'s money or rate limit', () => {
    // An agent that can trigger a provider pull by asking a question is a
    // denial-of-service with good manners — and the bill lands on the person
    // who installed the cost tool.
    const text = code();
    assert.doesNotMatch(text, /fetchProviderUsage|fetch\s*\(|node:https?|connect\b/);
    assert.doesNotMatch(text, /@trazum\/core\/node/);
  });

  it('reads no files, as the server has promised since it shipped', () => {
    const text = code();
    assert.doesNotMatch(text, /readFile|createReadStream|node:fs/);
  });
});

describe('the semantic pass never becomes a prerequisite', () => {
  /**
   * The rule from 0.1.0, and the one this chapter could most easily erode.
   * The deterministic core works with no key, no network and no model, and the
   * way that stays true is structural: the verification lives in the package
   * that has no network, and the call lives in the CLI.
   */
  const semantic = () =>
    readFileSync(join(repoRoot, 'packages/core/src/semantic.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('the verification module makes no call of any kind', () => {
    const text = semantic();
    for (const reach of ['fetch(', 'https://', 'process.env', 'provider', 'await ']) {
      assert.ok(!text.includes(reach), `semantic.ts reaches for "${reach}"`);
    }
  });

  it('nothing the model returns is trusted about size', () => {
    // Every token figure is counted here, from the spans, with the counter
    // everything else uses. A model's own arithmetic never reaches a reader.
    const text = semantic();
    assert.match(text, /ceilingTokens:\s*\n?\s*proposal\.kind === 'contradiction'/);
    assert.doesNotMatch(text, /proposal\.(tokens|saving|usd)/);
  });

  it('a span must be found in the prompt before anything else is considered', () => {
    /**
     * Order matters: the verbatim check runs first, so a proposal whose
     * evidence is invented is rejected before any of its other claims are
     * examined. A version that checked similarity first would spend effort
     * reasoning about text that is not in the prompt.
     *
     * **Bounded to the function body**, because the first version was not and
     * therefore guarded nothing: `'span-not-found'` appears in the type union
     * near the top of the file, so it always came before any `jaccard(` call
     * and the assertion passed whatever the loop actually did. It was proven
     * useless by planting the reordering and watching it stay green — which is
     * why every guard in this file gets a planted probe.
     */
    const text = semantic();
    const start = text.indexOf('export function verifySemanticProposals');
    assert.ok(start > 0, 'verifySemanticProposals could not be located — has it moved?');
    const body = text.slice(start);
    const found = body.indexOf("reason: 'span-not-found'");
    const similarity = body.indexOf('jaccard(');
    assert.ok(found > 0, 'the verbatim rejection could not be found in the loop');
    assert.ok(similarity > found, 'the verbatim check must come before any similarity work');
  });

  it('the price is computed without a network, so it works offline', () => {
    const text = semantic();
    const cost = text.slice(text.indexOf('export function semanticPassCost'));
    assert.doesNotMatch(cost, /fetch|await|https/);
  });
});

describe('an outcome is recorded and never inferred', () => {
  /**
   * The guard for the claim the whole outcome feature rests on.
   *
   * Every signal in a usage log invites a heuristic: a conversation that ended
   * quickly "resolved"; a `max_tokens` stop "failed"; a retry means the first
   * answer was wrong; no complaint means it worked. Each is plausible, each is
   * wrong often enough to matter, and each would become a metric somebody
   * optimises against — which is how a tool ends up rewarding conversations
   * that ended early because the user gave up.
   */
  const outcome = () =>
    readFileSync(join(repoRoot, 'packages/core/src/outcome.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('the outcome module reads no other signal', () => {
    const text = outcome();
    for (const signal of ['session', 'stop_reason', 'stopReason', 'truncated', 'ts', 'timestamp', 'retry', 'repeat']) {
      assert.doesNotMatch(
        text,
        new RegExp(`\\b${signal}\\b`),
        `outcome.ts mentions "${signal}" — an outcome inferred from anything is a guess wearing a metric's clothes`,
      );
    }
  });

  it('the parser takes it from the recorded field and nowhere else', () => {
    const usage = readFileSync(join(repoRoot, 'packages/core/src/usage.ts'), 'utf8');
    const assignment = usage.match(/^\s*outcome: (.+),$/m);
    assert.ok(assignment, 'the outcome assignment could not be found — has it moved?');
    assert.equal(assignment[1], 'nameOf(record.outcome) ?? nameOf(record.trazum_outcome)');
  });

  it('a success rate is null and never zero when nothing was recorded', () => {
    /**
     * Asserted here as well as in the unit tests because it is a security
     * property as much as a correctness one: a tool that reports 0% success
     * for an uninstrumented product will get somebody fired for a number that
     * measured nothing.
     */
    const text = outcome();
    assert.match(text, /successShareOfRecordedUsd: number \| null;/);
    assert.match(text, /noRate: 'nothing-recorded' \| 'no-success-values-declared' \| null;/);
  });

  it('keeps aggregates and never calls, like everything else since 1.42', () => {
    const text = outcome();
    assert.match(text, /byValue: Array<\{ value: string; calls: number; usd: number \}>;/);
    assert.doesNotMatch(text, /records: |prompt|completion|content/i);
  });
});

describe('the gateway, which stands between somebody and their provider', () => {
  /**
   * The most dangerous component in this product, and the one whose promises
   * are least checkable from the outside. A caller pointing their SDK at it
   * hands over every prompt they send and the credential that pays for them,
   * and has no way to see what happens next.
   */
  const server = () => {
    const source = readFileSync(join(repoRoot, 'packages/cli/src/gateway-server.ts'), 'utf8');
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };
  const decision = () => {
    const source = readFileSync(join(repoRoot, 'packages/core/src/gateway.ts'), 'utf8');
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };

  it('binds to loopback, and the address is not a flag', () => {
    // Same posture as `serve` since 1.44 and far more load-bearing here: this
    // one has somebody's provider credential passing through it.
    const text = server();
    assert.match(text, /export const BIND_HOST = '127\.0\.0\.1';/);
    assert.match(text, /server\.listen\(where\.port, BIND_HOST/);
    // One definition, and it is the literal. Anything else assigning to it
    // would mean the address became configurable.
    assert.equal([...text.matchAll(/BIND_HOST\s*=/g)].length, 1);
  });

  it('compiles the upstream in, so no caller can choose where the key goes', () => {
    /**
     * A flag naming the host would make this a credential-forwarding open
     * proxy: anything that could rewrite a config on disk could point a
     * company's API key at a machine it chose. `checkedEndpoint` has guarded
     * Trazum's outbound calls on that principle since 1.14; here there is no
     * caller-supplied endpoint at all.
     */
    /**
     * The **exact** origins, extracted and compared, not searched for.
     *
     * CodeQL flagged the first version of this — two unanchored host patterns
     * — and was right about more than the lint. `assert.match(text,
     * /https:\/\/api\.anthropic\.com/)` passes on a source that had been
     * edited to say `https://api.anthropic.com.evil.com`, which is the single
     * substitution somebody attacking this file would make. A guard against a
     * redirected credential that a lookalike host satisfies is worse than no
     * guard, because it reads as coverage.
     */
    const text = server();
    const origins = [...text.matchAll(/origin: '([^']*)'/g)].map((m) => m[1]).sort();
    /**
     * Updating this list is the point, not the friction.
     *
     * Adding an upstream means editing an allowlist in a security test, which
     * is exactly the review a new destination for somebody's credential
     * deserves. DeepSeek joined at 1.53 with the host this repository already
     * trusts in `scripts/measure-token-band.mjs`, and its path genuinely has no
     * `/v1` — a detail that would have been got wrong from memory.
     */
    assert.deepEqual(origins, [
      'https://api.anthropic.com',
      'https://api.deepseek.com',
      'https://api.openai.com',
      'https://generativelanguage.googleapis.com',
    ]);

    const paths = [...text.matchAll(/path: '([^']*)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(paths, ['/chat/completions', '/v1/chat/completions', '/v1/messages']);

    /**
     * Pattern paths are extracted too, and compared just as exactly.
     *
     * Google's model is in the URL, so its path cannot be a literal — and a
     * check that harvested only `path: '...'` would have let a *pattern* reach
     * somebody's credential without appearing in this allowlist at all. The
     * hole would have opened in the same commit that added the first pattern:
     * the guard would still have passed, still read as coverage, and no longer
     * covered the new kind of thing.
     */
    const patterns = [...text.matchAll(/path: (\/\^[^\n]*?\$\/),/g)].map((m) => m[1]).sort();
    assert.deepEqual(patterns, ['/^\\/v1beta\\/models\\/([A-Za-z0-9._-]+):generateContent$/']);

    /**
     * And every pattern is anchored at both ends and accepts no arbitrary run
     * of text, whatever it is.
     *
     * The list above pins today's pattern; this pins the property, so a future
     * one that forgot an anchor fails on the reason rather than on the diff.
     * An unanchored pattern matches anywhere in the URL, which is how
     * `/v1beta/models/x:generateContent/../../anything` becomes forwardable.
     *
     * **Proved against known-bad inputs, not only against today's good one.**
     * Written as a loop over `patterns` alone, this assertion could never fail
     * — the exact-list comparison above it catches any change first, so the
     * property check would sit here reading as coverage while never once
     * running against something it should reject. The three shapes it exists
     * to refuse are handed to it directly.
     */
    const anchored = (pattern) =>
      pattern.startsWith('/^') && pattern.endsWith('$/') && !/\.\*|\.\+/.test(pattern);

    assert.equal(anchored('/\\/v1beta\\/models\\/([A-Za-z0-9._-]+):generateContent$/'), false, 'missing start anchor accepted');
    assert.equal(anchored('/^\\/v1beta\\/models\\/([A-Za-z0-9._-]+):generateContent/'), false, 'missing end anchor accepted');
    assert.equal(anchored('/^\\/v1beta\\/models\\/(.*):generateContent$/'), false, 'a wildcard model segment accepted');

    for (const pattern of patterns) {
      assert.ok(anchored(pattern), `an upstream path pattern is unanchored or accepts arbitrary text: ${pattern}`);
    }

    /**
     * The only interpolation into the fetch target is the compiled-in origin
     * and a path this module **built**. Not `request.url`: a pattern that
     * matched is evidence the request was well formed, and echoing the string
     * that satisfied it back into the outgoing URL would forward whatever else
     * the pattern happened to tolerate.
     */
    const targets = [...text.matchAll(/doFetch\(([^,]+),/g)].map((m) => m[1].trim());
    assert.deepEqual(targets, ['`${upstream.origin}${routed.path}`']);
    assert.doesNotMatch(text, /doFetch\([^,]*request\.url/);
    assert.doesNotMatch(text, /stringFlag|process\.env|config\?\.[a-z]*[Uu]pstream/);
  });

  it('never reads the credential it forwards', () => {
    /**
     * Stronger than the connector's *borrowed, never held*: the key is the
     * caller's own header, copied into the outgoing request without ever being
     * looked at. Checked as the absence of any read, because a version that
     * reads it and happens not to log it today is one refactor from logging it.
     */
    const text = server();
    assert.doesNotMatch(text, /headers\[['"](authorization|x-api-key)['"]\]/i);
    assert.doesNotMatch(text, /ANTHROPIC_API_KEY|OPENAI_API_KEY|process\.env/);
  });

  it('never writes the payload down, and has nowhere to put it', () => {
    /**
     * The store has held aggregates since 1.42 and standing in the path
     * changes nothing about that. Two halves: the proxy does not write, and
     * the interfaces downstream of it cannot carry text — `record` takes
     * counts, and `gatewayDecision` is never handed a body at all.
     */
    const text = server();
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream/);
    // `note` is the operator's terminal line, and the body is never given to it.
    assert.doesNotMatch(text, /note\([^)]*body/);
    assert.doesNotMatch(text, /console\.log\([^)]*body|console\.error\([^)]*body/);
  });

  it('cannot return a modified request, because the type has no room for one', () => {
    /**
     * The rule that matters most, enforced where an edit cannot miss it. A
     * `forward` decision carries a price and a flag; a `refuse` carries no
     * body. There is no shape in which the core hands back a rewritten
     * request, so substitution cannot arrive as a quiet field addition.
     */
    const text = decision();
    const forward = text.slice(text.indexOf("kind: 'forward';"), text.indexOf("kind: 'refuse';"));
    assert.doesNotMatch(forward, /body|prompt|messages|headers|rewritten/i);
  });

  it('answers a refusal with 402, never a code an SDK retries', () => {
    // 429 would turn one refusal into a retry storm against a gateway that
    // refuses every time — the caller's own SDK doing it, automatically.
    const text = server();
    assert.match(text, /response\.writeHead\(402/);
    assert.doesNotMatch(text, /writeHead\(429/);
  });

  it('forwards exactly one path', () => {
    /**
     * One path per provider, decided in one place.
     *
     * This used to assert the literal comparison `request.url !==
     * upstream.path`, which stopped being writable when Google's model moved
     * into the URL. What matters was never the `!==`: it is that **one**
     * function decides whether a request is the call this gateway speaks for,
     * that a POST is the only method that gets there, and that nothing else
     * in the module reaches a decision about `request.url`.
     */
    const text = server();
    assert.match(text, /const routed = request\.method === 'POST' \? route\(upstream, request\.url\) : null;/);
    assert.match(text, /if \(routed === null\) \{/);
    // `route` is the only reader of the caller's URL. A second one would be a
    // second opinion about what this gateway forwards.
    assert.equal([...text.matchAll(/request\.url/g)].length, 1);
  });
});

describe('there is no telemetry, and the feedback command is not an exception', () => {
  /**
   * `trazum feedback` prints where to write and a prefilled link. That is
   * exactly the shape of a command that phones home, which is why it is the
   * one that needs guarding hardest: a reader has no way to tell the two apart
   * from the output, and the sentence the command prints — *this sends
   * nothing* — is worth precisely as much as the check behind it.
   */
  const cli = () => readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
  /**
   * Bounded to the **next function**, whatever it turns out to be.
   *
   * The first version sliced to `commandModels` by name, and a command
   * inserted between the two silently widened the harvest to include it —
   * so a guard about `feedback` started reporting on its neighbour. The same
   * failure the `docs/json-output.md` parity tests have had five times: a
   * harvest bounded by what happens to come next is not bounded.
   */
  const feedback = () => {
    const source = cli();
    const start = source.indexOf('function commandFeedback(');
    const rest = source.slice(start + 1);
    const offset = rest.search(/\n(?:async )?function /);
    const end = offset === -1 ? source.length : start + 1 + offset;
    assert.ok(start > 0 && end > start, 'commandFeedback could not be located — has it moved?');
    return source
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  };

  it('sends nothing', () => {
    const text = feedback();
    assert.doesNotMatch(text, /fetch\s*\(|node:https?|XMLHttpRequest|request\s*\(/);
    // Nor by proxy: opening a browser is a way to make a request happen, and
    // a command that launched one would be transmitting on somebody's behalf
    // without them reading what goes.
    assert.doesNotMatch(text, /exec|spawn|open\s*\(\s*url|child_process/);
  });

  it('carries nothing about the person into the prefilled link', () => {
    /**
     * The environment lines are facts about a machine. A config value, a
     * label, a path or a figure would be a leak dressed as helpfulness — and
     * the worst kind, because the person would have pressed the button
     * themselves.
     */
    // Property *reads*, so `bug_report.yml` — a filename in a template URL —
    // is not mistaken for a report object being spread into the body. The
    // first version of this matched it and was right about the string and
    // wrong about what it meant.
    const text = feedback();
    assert.doesNotMatch(text, /\bconfig[?.]|\breport\.|process\.cwd|process\.env|homedir/);
    assert.match(text, /process\.platform/);
    assert.match(text, /process\.version/);
  });

  it('compiles the destination in rather than reading it from anywhere', () => {
    // A flag or a config key naming the host would let anything that had
    // rewritten a config on disk point somebody's report, and its prefilled
    // body, at a machine they did not choose.
    const source = cli();
    assert.match(source, /const FEEDBACK_REPO = 'https:\/\/github\.com\/Davmunrey\/Trazum';/);
    assert.doesNotMatch(feedback(), /stringFlag|config\?\./);
  });

  it('holds for the whole CLI: no install hook, and no ping anywhere', () => {
    /**
     * The claim the command makes is about the product, not about itself, so
     * the check has to be too. An npm lifecycle script is the classic way a
     * CLI acquires telemetry without a line of its own code changing.
     */
    for (const pkg of ['packages/cli', 'packages/core', 'packages/mcp']) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, pkg, 'package.json'), 'utf8'));
      for (const hook of ['preinstall', 'install', 'postinstall', 'prepublish']) {
        assert.equal(
          manifest.scripts?.[hook],
          undefined,
          `${pkg} declares a ${hook} script — that is where telemetry arrives without anybody reviewing a diff`,
        );
      }
    }
  });
});

describe('the first run', () => {
  /**
   * `init` is the command with the widest reach in this product and the
   * smallest amount of trust behind it.
   *
   * It runs before anybody has read a page of documentation, in a directory it
   * has never seen, and it *walks it*: prompts, source files, log candidates,
   * the environment. Two things follow, and both are checked here rather than
   * left to a reviewer noticing.
   */
  const source = () => {
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const start = cli.indexOf('async function commandInit(');
    const rest = cli.slice(start + 1);
    const offset = rest.search(/\n(?:async )?function /);
    const end = offset === -1 ? cli.length : start + 1 + offset;
    assert.ok(start > 0 && end > start, 'commandInit could not be located — has it moved?');
    return cli.slice(start, end);
  };
  const code = () =>
    source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('never spends to answer', () => {
    // The deterministic core has been the entry point since 0.1.0, and the
    // first command somebody runs is the worst possible place to break that.
    // A tool whose introduction costs money is one nobody introduces.
    const text = code();
    assert.doesNotMatch(text, /fetchProviderUsage|fetch\s*\(|node:https?/);
    assert.doesNotMatch(text, /suggestPhrases|callModel|llm/i);
  });

  it('names a credential by its variable and never carries the value', () => {
    /**
     * `findCredential` returns `{ key, source }` because the connector needs
     * the key. `init` needs only the name, and the rule since 1.41 is that the
     * value never reaches a terminal — a first-run summary is the single most
     * likely output in this product to be pasted into a chat window.
     *
     * Checked as *what is destructured*, not as what is printed: a version
     * that pulled `key` out and happened not to log it today is one refactor
     * away from logging it tomorrow.
     */
    const text = code();
    assert.match(text, /found\.source\.variable/, 'the variable name is what is used');
    assert.doesNotMatch(text, /found\.key|\{\s*key\s*[,}]/, 'the key must never be read out of findCredential here');
  });

  it('writes one file, in the directory it was pointed at', () => {
    /**
     * The only write in the command, and it goes to `configPath`, which is
     * `join(root, CONFIG_FILENAME)`. An `init` that writes anywhere else — a
     * home directory, a cache, a parent — is a first impression nobody
     * recovers from.
     */
    const text = code();
    const writes = [...text.matchAll(/writeFile\(([^,]+),/g)].map((m) => m[1].trim());
    assert.deepEqual(writes, ['configPath'], 'init writes exactly one file, and it is the config');
    assert.match(text, /const configPath = join\(root, CONFIG_FILENAME\)/);
  });

  it('bounds what it reads, so a large repository cannot stall the first run', () => {
    const text = code();
    assert.match(text, /INIT_MAX_SOURCE_FILES/);
    assert.match(text, /INIT_MAX_SOURCE_BYTES/);
  });

  it('enforces that bound through one open handle rather than a path twice', () => {
    /**
     * CodeQL found this one, in code written the same day, and it was right.
     *
     * `stat(path)` followed by `readFile(path)` is two lookups of the same
     * name, and what arrives the second time need not be what was measured
     * the first — so the size bound would be enforced against a file that is
     * no longer there. One handle, stat'ed and read, is the same inode by
     * construction. The guard exists because the fix is invisible in the
     * output: both versions print the same thing, and only one of them is
     * checking the file it reads.
     */
    const text = code();
    assert.match(text, /await open\(path, 'r'\)/);
    assert.match(text, /handle\.stat\(\)/);
    assert.match(text, /handle\.readFile\(/);
    assert.doesNotMatch(text, /await stat\(path\)/, 'the size bound must not be taken by path');
  });
});

describe('no runtime dependencies', () => {
  // Every published package here processes untrusted text. A runtime dependency
  // is code that would run on that text with no review from this project, so
  // the dependency count is a security property, not a packaging preference.
  //
  // Derived from the root `workspaces` globs rather than listed, because the
  // list was `['packages/core', 'packages/cli']` for the whole day
  // `packages/mcp` existed — the MCP server hand-rolls its JSON-RPC layer to
  // hold this exact invariant, and the test that was supposed to hold it had
  // never heard of the package. A workspace added later is covered on the
  // commit that adds it, or it declares itself private and is not published at
  // all.
  const published = readFileSync(join(repoRoot, 'package.json'), 'utf8');
  const packages = JSON.parse(published)
    .workspaces.flatMap((pattern) => {
      const parent = pattern.replace(/\/\*$/, '');
      return readdirSync(join(repoRoot, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${parent}/${entry.name}`);
    })
    .filter((pkg) => {
      const manifest = JSON.parse(readFileSync(join(repoRoot, pkg, 'package.json'), 'utf8'));
      return manifest.private !== true;
    })
    .sort();

  it('finds every publishable workspace, so this suite cannot go blind', () => {
    // Without this the derivation could quietly resolve to nothing and every
    // assertion below would pass by never running.
    assert.ok(packages.length >= 3, `only found ${packages.join(', ') || 'nothing'}`);
    assert.ok(packages.includes('packages/mcp'), 'the MCP server is not covered');
  });

  for (const pkg of packages) {
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

  it('sub-actions of the same action agree on their commit', () => {
    // `github/codeql-action/init` and `github/codeql-action/analyze` are two
    // entry points of one action, and analyze refuses a configuration file init
    // wrote at a different version:
    //
    //   Loaded a configuration file for version '4.37.6', but running '3.37.6'
    //
    // Dependabot raises one pull request per sub-path, so a version bump always
    // arrives split in two and each half is red on its own. That is how it is
    // *supposed* to fail. The dangerous ordering is the other one: merge both
    // halves and the mismatch is gone, merge one and forget, and the security
    // job stays broken while everything else is green.
    //
    // Grouped by `owner/repo` rather than by a list naming codeql-action,
    // because the next action to be split this way will not be that one.
    const shaFor = new Map();
    const disagreements = [];

    for (const name of readdirSync(join(repoRoot, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = readFileSync(join(repoRoot, '.github/workflows', name), 'utf8');

      for (const [, ref] of source.matchAll(/^\s*(?:- )?uses:\s*(\S+@[0-9a-f]{40})/gm)) {
        const [path, sha] = ref.split('@');
        const segments = path.split('/');
        // Only paths deeper than `owner/repo` can disagree with a sibling.
        if (segments.length < 3) continue;
        const action = segments.slice(0, 2).join('/');

        const seen = shaFor.get(action);
        if (!seen) shaFor.set(action, { sha, where: `${name}: ${path}` });
        else if (seen.sha !== sha) {
          disagreements.push(`${action}\n      ${seen.where} @${seen.sha}\n      ${name}: ${path} @${sha}`);
        }
      }
    }

    // An empty `disagreements` proves nothing on its own: it is also what a
    // matcher that stopped matching produces. Verified by breaking the segment
    // filter, which left the assertion below green while inspecting nothing.
    assert.ok(
      shaFor.size > 0,
      'no sub-path action reference was found — this guard is inspecting nothing',
    );

    assert.deepEqual(
      disagreements,
      [],
      `sub-actions of one action are pinned to different commits:\n  ${disagreements.join('\n  ')}`,
    );
  });

  it('the docs recommend a SHA pin too, not a tag', (t) => {
    // The rule above governs what this repository runs. This one governs what it
    // *tells other people to run*, which had drifted: the README recommended
    // `Davmunrey/Trazum@v1.0.0` for a whole release — a tag that did not exist,
    // so the copy-pasteable example 404'd, and a tag at all, which is the exact
    // movable ref SECURITY.md warns against. Nothing was checking.
    const SHA_PIN = /^Davmunrey\/Trazum@[0-9a-f]{40}$/;
    const bad = [];

    /**
     * Every released version, from the tags rather than from a document.
     *
     * The four assertions below this were each written for a pin that was
     * *wrong*, and between them they never asked the one question that catches
     * a pin nobody touched: **how old is it**. A pin at 1.20.0 names a real
     * commit, on `main`, whose manifest really says 1.20.0. It stays green
     * forever while the release it points at recedes, which is exactly how the
     * README came to be recommending a two-release-old Action.
     *
     * `docs/releasing.md` step 4 explains why one release of lag is structural:
     * the pin can only advance to the release commit once that commit exists,
     * which is after the merge rather than in it. So the convention is at most
     * one, and this derives the count from `git tag` instead of trusting
     * anybody to have remembered.
     */
    const releasedVersions = (() => {
      const tags = spawnSync('git', ['tag', '--list', 'v*.*.*'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      if (tags.status !== 0) return null;
      const parsed = tags.stdout
        .split('\n')
        .filter(Boolean)
        .map((tag) => tag.slice(1))
        .filter((version) => /^\d+\.\d+\.\d+$/.test(version));
      return parsed.length === 0 ? null : parsed;
    })();
    /** Numeric, because "1.10.0" sorts before "1.9.0" as a string. */
    const isNewer = (a, b) => {
      const left = a.split('.').map(Number);
      const right = b.split('.').map(Number);
      for (let i = 0; i < 3; i += 1) {
        if (left[i] !== right[i]) return left[i] > right[i];
      }
      return false;
    };
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

        /**
         * And the commit has to be **on the default branch**.
         *
         * Everything above is satisfied by a commit that exists and says the
         * right version in its own manifest — including the pre-squash head of
         * a feature branch, which says exactly that and is deleted the moment
         * the pull request merges. GitHub can garbage-collect it, and a
         * workflow pinned there stops resolving with no warning to anybody.
         *
         * This was nearly shipped: preparing a release, the sha to hand was the
         * branch commit rather than the squash-merge on `main`, and every
         * assertion above passed on it. The difference is invisible to a reader
         * and total to a consumer.
         */
        const merged = spawnSync(
          'git',
          ['merge-base', '--is-ancestor', sha, 'origin/main'],
          { cwd: repoRoot, encoding: 'utf8' },
        );
        if (merged.status === 1) {
          bad.push(
            `${name}: ${sha.slice(0, 7)} is not on origin/main — a pre-squash branch commit ` +
              'says the right version and can be garbage-collected',
          );
        } else if (merged.status !== 0) {
          // No `origin/main` in this clone. Named, never passed over silently.
          unchecked.push(`${name}: ${sha.slice(0, 7)} ancestry unknown (no origin/main here)`);
        }

        if (releasedVersions === null) {
          unchecked.push(`${name}: no release tags in this clone, pin age not checked`);
          continue;
        }

        /**
         * The commit has to be **the release commit**, not a commit that
         * happens to declare the same version.
         *
         * Everything above passes on the squash of any pull request merged
         * after a release, because those carry the released manifest until the
         * next bump. `d959be1` would satisfy the label, the ancestry and the
         * manifest while being a documentation merge. The tag is the only thing
         * that separates the two, and consumers pin what the tag points at.
         */
        const pointsAt = spawnSync('git', ['tag', '--points-at', sha], {
          cwd: repoRoot,
          encoding: 'utf8',
        });
        if (pointsAt.status !== 0) {
          unchecked.push(`${name}: ${sha.slice(0, 7)} tags unreadable`);
        } else if (!pointsAt.stdout.split('\n').filter(Boolean).includes(`v${pinned}`)) {
          bad.push(
            `${name}: ${sha.slice(0, 7)} declares ${pinned} and is not the v${pinned} release ` +
              'commit, so it is some other merge that inherited the version',
          );
        }

        /**
         * And at most one release may stand between the pin and today. This is
         * the assertion that kills the class rather than an instance: it fails
         * on a pin nobody touched, which is the only way this ever went wrong.
         */
        const since = releasedVersions
          .filter((version) => isNewer(version, pinned))
          .sort((a, b) => (isNewer(a, b) ? 1 : -1));
        if (since.length > 1) {
          bad.push(
            `${name}: pinned at ${pinned} with ${since.length} releases since ` +
              `(${since.join(', ')}). docs/releasing.md allows one, because the pin can only ` +
              'advance after the release commit exists',
          );
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

  it('the publish credential lives in one workflow, one way, and never inline', () => {
    /**
     * The original rule was "publishing needs no stored credential", and it
     * was the right rule until npm made it impossible to follow: trusted
     * publishing rejected this workflow's OIDC token on six real publish
     * attempts across three versions, with every GitHub-side claim verified
     * correct, and 1.8.0, 1.9.0, 1.10.0 and 1.25.0 all went out from a
     * laptop because of it. A rule that forces the release onto somebody's
     * machine protects the secret by moving the publish to the least
     * auditable place available.
     *
     * So the rule narrows instead of vanishing. `release.yml` — and only it —
     * may read `secrets.NPM_TOKEN`, only as `NODE_AUTH_TOKEN`, and only from
     * the secret: an environment-scoped credential behind the `release`
     * gate, absent by default (OIDC remains the auth when it is unset, and
     * removing the secret reverts the workflow to pure trusted publishing).
     * What stays absolute everywhere: no other workflow touches a publish
     * token, and no token *material* — the `npm_...` string itself — is ever
     * committed.
     */
    const offenders = [];

    for (const name of readdirSync(join(repoRoot, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = readFileSync(join(repoRoot, '.github/workflows', name), 'utf8')
        .replace(/^\s*#.*$/gm, '')
        .replace(/\s#.*$/gm, '');

      // Token material is banned everywhere, release.yml included: a real npm
      // token is `npm_` plus a long body, and one committed is one leaked.
      if (/npm_[A-Za-z0-9]{20,}/.test(source)) {
        offenders.push(`${name}: npm token material committed`);
      }

      if (name === 'release.yml') {
        // The one permitted reference, in exactly one shape. Anything else —
        // an inline value, a differently-named secret, an env var smuggled in
        // at the job level — is an offender.
        for (const line of source.split('\n')) {
          if (!/NPM_TOKEN|NODE_AUTH_TOKEN/.test(line)) continue;
          if (!/^\s*NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}\s*$/.test(line)) {
            offenders.push(`${name}: ${line.trim()}`);
          }
        }
        continue;
      }

      if (/NPM_TOKEN|NODE_AUTH_TOKEN/.test(source)) {
        offenders.push(`${name}: reaches for a publish token`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `a workflow holds a publish credential it must not:\n  ${offenders.join('\n  ')}`,
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

    // Every publish step gated on a push event *and* the registry preflight.
    // `github.event_name == 'push'` covers exactly the two triggers that
    // carry a version decision — a tag, or a merged release PR on main — and
    // excludes workflow_dispatch, which stays dry-run only. The preflight
    // half means nothing uploads until every version is confirmed free.
    const steps = release.split(/^      - /m).filter((s) => /run:\s*npm publish/.test(s));
    assert.ok(steps.length >= 2, 'both packages should have a publish step');
    for (const step of steps) {
      assert.match(
        step,
        /if:\s*github\.event_name == 'push' && steps\.versions\.outputs\.publish == 'true'/,
        `a publish step is not gated on push + preflight:\n${step.slice(0, 200)}`,
      );
    }

    // The push trigger itself is the closed set: tags and main, nothing else.
    // A push to any other branch must not be able to reach those steps.
    assert.match(release, /tags:\s*\['v\*\.\*\.\*'\]/, 'the tag trigger is gone');
    assert.match(release, /branches:\s*\[main\]/, 'the main trigger is gone — merges no longer release');

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

  it('pull_request_target is banned everywhere but the CLA gate, which checks out nothing', () => {
    // The event a reviewer reaches for when a fork PR cannot post a comment. It
    // runs with a writable token against the BASE repository while checking out
    // code the contributor controls, which is how "we just wanted to comment on
    // the PR" becomes arbitrary code execution with the repository's secrets.
    // This guard used to ban it outright and said any need for it "needs
    // arguing in a pull request, not a quiet addition" — cla.yml is that
    // argument, made and merged. The CLA bot must comment and set a status on
    // exactly the fork pull requests whose plain-event token is read-only, so
    // it needs the event; the event is only dangerous BESIDE a checkout of the
    // contributor's code, and the assertions below pin that cla.yml never
    // checks anything out. Widening the exception, or adding a checkout to
    // cla.yml, is the argument reopened — this test failing is how it reopens.
    const workflows = readdirSync(join(repoRoot, '.github/workflows'))
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .map((name) => [name, readFileSync(join(repoRoot, '.github/workflows', name), 'utf8')]);

    assert.ok(workflows.length > 0, 'no workflows found — has the layout changed?');
    let claSeen = false;
    for (const [name, source] of [...workflows, ['action.yml', action]]) {
      if (name === 'cla.yml') {
        claSeen = true;
        assert.match(
          source,
          /pull_request_target/,
          'cla.yml stopped using pull_request_target — its exception here should go too',
        );
        assert.doesNotMatch(
          source,
          /actions\/checkout|uses:\s*\.\//,
          'cla.yml checks out code beside a writable token — the exact attack the ban exists for',
        );
        continue;
      }
      assert.doesNotMatch(source, /pull_request_target/, `${name} uses pull_request_target`);
    }
    assert.ok(claSeen, 'cla.yml is gone — remove its exception from this guard');
  });

  it('the DCO gate reads the whole range and hands back the command that fixes it', () => {
    /**
     * Provenance, and the two ways a check like this quietly stops working.
     *
     * The first is a shallow checkout. `base..head` over a depth-1 clone walks
     * nothing, the loop finds no commits, and the job goes green while
     * examining zero of them: the failure mode where a guard reports clean
     * because it was never given anything to read. `fetch-depth: 0` is pinned
     * below for that reason and no other.
     *
     * The second is a remedy nobody can act on. A contributor whose pull
     * request is red for a reason they cannot fix in one command does not
     * learn the rule; they ask for the check to be turned off, and on a
     * single-maintainer repository that request usually wins. So both
     * remedies are pinned as literal text: `git commit -s` for work that
     * does not exist yet, `git rebase --signoff` for work that does.
     *
     * The event is pinned too. `pull_request_target` is banned everywhere but
     * cla.yml by the guard above, and a check that only reads commits has no
     * business becoming the second exception.
     */
    const dco = readFileSync(join(repoRoot, '.github/workflows/dco.yml'), 'utf8');

    assert.match(dco, /^on:\n\s+pull_request:/m, 'dco.yml does not run on pull_request');
    assert.doesNotMatch(
      dco,
      /pull_request_target/,
      'dco.yml uses pull_request_target: a read-only check does not need a writable token',
    );
    // Anchored to column zero. A loose `\\s+` also matched the job-level block
    // six spaces in, so planting `contents: write` at the top of the file left
    // this green: the guard was reading the wrong one of two identical lines.
    assert.match(
      dco,
      /^permissions:\n {2}contents: read$/m,
      'dco.yml does not declare read-only permissions at the top level',
    );
    assert.match(
      dco,
      /fetch-depth: 0/,
      'dco.yml checks out shallow: base..head would walk nothing and the job would pass',
    );
    // The grep pattern itself, not the bare words. Planting a typo in the
    // header comment left the old assertion green, which means it was pinning
    // prose rather than behaviour. A sign-off with no address is not one, so
    // the address is part of what is pinned.
    assert.match(
      dco,
      /grep -qiE '\^Signed-off-by: \.\+ <\[\^@\]\+@\[\^>\]\+>/,
      'dco.yml no longer greps for a Signed-off-by line carrying an address',
    );
    assert.match(
      dco,
      /git commit -s/,
      'dco.yml fails without naming the command for new work',
    );
    assert.match(
      dco,
      /git rebase --signoff/,
      'dco.yml fails without naming the command for commits that already exist',
    );
    assert.match(
      dco,
      /--no-merges/,
      'dco.yml judges merge commits GitHub wrote itself',
    );
  });

  it('CONTRIBUTING.md tells a contributor how to satisfy the DCO gate', () => {
    // The workflow prints the remedy at the moment of failure; this is the
    // copy somebody reads *before* pushing. Both commands are pinned in both
    // places on purpose: a document that names a gate and not its remedy sends
    // the reader to the pull request to find out, which is the trip the gate
    // exists to save.
    const contributing = readFileSync(join(repoRoot, 'CONTRIBUTING.md'), 'utf8');
    assert.match(contributing, /git commit -s/, 'CONTRIBUTING.md does not name `git commit -s`');
    assert.match(
      contributing,
      /git rebase --signoff/,
      'CONTRIBUTING.md does not name `git rebase --signoff`',
    );
    /**
     * Not a regular expression, and that is the fix rather than a way around
     * the alarm. CodeQL flagged this assertion twice, first as
     * `/developercertificate\\.org/` and then as the same thing with a scheme
     * bolted on, and its complaint was the same both times: a pattern shaped
     * like a URL with nothing anchoring it matches inside a longer URL, so
     * `https://example.com/?to=https://developercertificate.org/` satisfies it.
     *
     * The real subject here was never a URL. It is a markdown document, and
     * the question is whether it *links* the text a contributor is asked to
     * certify against. So the guard asks that literally: the exact link
     * target, delimited by the markdown syntax around it. The closing paren
     * is what a longer URL cannot survive, no host can precede `](`, and a
     * mere mention of the domain in prose no longer counts.
     *
     * Expressing a containment check as a regex is what made it look like URL
     * validation, and it was weaker than a containment check the whole time.
     */
    assert.ok(
      contributing.includes('](https://developercertificate.org/)'),
      'CONTRIBUTING.md describes a sign-off without linking what is being certified',
    );
    // A sign-off is a certification of origin. Saying so is the difference
    // between a contributor signing and a contributor asking their employer.
    assert.match(
      contributing,
      // Wrap-tolerant: the sentence sits across a line break in the file.
      /not a copyright\s+assignment/i,
      'CONTRIBUTING.md does not say what the sign-off is not',
    );
  });

  it('the CLA gate allowlists the identities that commit here, and chooses its own locking', () => {
    /**
     * The gate's first live run failed on two pull requests before anybody
     * had read a line of the action's source, and both defects were of the
     * same kind: something true about *this* repository that the workflow
     * did not say.
     *
     * The action resolves a committer as
     * `commit.author.user || commit.committer.user || commit.author || …`
     * and compares the allowlist against `login || name` — **exactly**,
     * case included. Reading that source suggested the capitalised commit
     * name; the API said otherwise, because the agent's commit email
     * belongs to the GitHub account `claude` and the lowercase login is
     * what actually arrives. Three red pull requests taught that, so both
     * spellings are listed and both are pinned here: the login for today,
     * the commit name for the day that email is unlinked. Drop either and
     * *every* pull request here blocks on a signature from somebody who
     * cannot give one — loudly, but only after the fact. This is the
     * promise kept next to the inventory instead.
     */
    const cla = readFileSync(join(repoRoot, '.github/workflows/cla.yml'), 'utf8');
    const allowlist = /allowlist:\s*'([^']*)'/.exec(cla);
    assert.ok(allowlist, 'cla.yml declares no allowlist — every PR would demand a signature');
    const listed = allowlist[1].split(',').map((entry) => entry.trim());
    for (const identity of ['Davmunrey', 'claude', 'Claude']) {
      assert.ok(
        listed.includes(identity),
        `"${identity}" commits in this repository and is not allowlisted — the gate would block every pull request it authors`,
      );
    }

    /**
     * `lock-pullrequest-aftermerge` defaults to **true**, which locks the
     * conversation on every merged pull request. That default was inherited
     * silently for exactly one release. A locked thread is where somebody
     * would have asked why a change was made, so the value is stated here
     * whichever way it is chosen — the point is that it is chosen.
     */
    assert.match(
      cla,
      /lock-pullrequest-aftermerge:\s*(true|false)/,
      'cla.yml inherits the action\'s locking default instead of choosing one',
    );
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

/**
 * The generators the property suites draw from, and why they are written here
 * rather than installed.
 *
 * ## Seeded, always
 *
 * A property test that fails once and cannot be made to fail again is a rumour.
 * Every run draws from a seeded generator, every suite prints the seed, and
 * `TRAZUM_QA_SEED=<n> npm test` replays the exact run. The default is fixed so
 * CI is deterministic: a suite that fails on Tuesdays and passes on Wednesdays
 * gets disabled by whoever is on call, and then it guards nothing at all.
 *
 * ## Written rather than installed
 *
 * This package has **zero runtime dependencies** and says so on its front page,
 * and the guard that holds it reads the installed source of every exception. A
 * property-testing library would be a development dependency rather than a
 * runtime one, so it would not break that promise — but the part of one needed
 * here is a pseudo-random number generator and a dozen shapes, which is a
 * hundred readable lines against a supply-chain surface. In a repository that
 * spends this much effort on what it depends on, writing them is the cheaper
 * side of the trade.
 *
 * ## What the shapes are for
 *
 * They are hostile on purpose. A generator that only produced tidy English
 * prompts would exercise the paths the 140 example suites already cover. These
 * produce empty strings, a hundred kilobytes of one character, unbalanced code
 * fences, right-to-left overrides, NULs, lone surrogates, credentials, absolute
 * paths and prompts made entirely of protected content — because a prompt is
 * whatever somebody pastes, and this package's first promise is about what it
 * does with text it did not write.
 *
 * The awkward characters are written as escapes rather than typed in. Two
 * modules in the sibling repository once held raw NUL bytes and git called them
 * binary; a fixture doing the same would be that defect wearing a test's name.
 */

/**
 * mulberry32: small, fast, and good enough for shapes.
 *
 * Not for anything that must be unguessable, and this package has real
 * cryptography in it — `aws-sigv4.ts`, `sso` verification, webhook signing all
 * use `node:crypto`. This must never be mistaken for those, which is why it
 * lives under `test/` and is named for what it is.
 */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed this run used, printed by every suite so a failure can be replayed. */
export const SEED = Number(process.env.TRAZUM_QA_SEED ?? 20260830);

/** How many cases each property draws. Raised on demand, never lowered in CI. */
export const CASES = Number(process.env.TRAZUM_QA_CASES ?? 250);

/** Printed with every failure, so a red CI log carries its own reproduction. */
export const replayWith = (suite) =>
  `${suite}: TRAZUM_QA_SEED=${SEED} TRAZUM_QA_CASES=${CASES} npm test -w @trazum/core`;

/** Strings that are a credential, a path or a name and must never travel. */
export const SECRETS = Object.freeze([
  'sk-live-0123456789abcdefghijklmn',
  'ghp_0123456789abcdefghijklmnopqrstuvwxyz',
  'AKIAIOSFODNN7EXAMPLE',
  '/Users/dana/work/secret-project/prompt.txt',
  'C:\\Users\\dana\\Desktop\\client.txt',
  'feature/acquisition-of-northwind',
  'dana@northwind.example',
]);

export class Draw {
  constructor(seed = SEED) {
    this.random = seeded(seed);
    this.seed = seed;
  }

  int(low, high) {
    return low + Math.floor(this.random() * (high - low + 1));
  }

  pick(values) {
    return values[this.int(0, values.length - 1)];
  }

  chance(p) {
    return this.random() < p;
  }

  list(low, high, make) {
    const out = [];
    const count = this.int(low, high);
    for (let n = 0; n < count; n += 1) out.push(make(n));
    return out;
  }

  hostileNumber() {
    return this.pick([
      0,
      -0,
      1,
      -1,
      0.1 + 0.2,
      this.int(0, 1000000),
      -this.int(1, 1000000),
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 2,
      Number.MIN_SAFE_INTEGER,
      Number.EPSILON,
      1e308,
      NaN,
      Infinity,
      -Infinity,
    ]);
  }

  /** A fragment of a prompt: prose, or something a prompt protects. */
  fragment() {
    return this.pick([
      'Please summarise the following text in three bullet points.',
      'You are a helpful assistant. You are a helpful assistant.',
      'Do not, under any circumstances whatsoever, ever use the word "delve".',
      'It is very very important that you always be extremely careful.',
      'In order to be able to do this, you should first of all begin by starting.',
      'Return JSON. Return the answer as JSON. The output must be JSON.',
      'Por favor, resume el texto siguiente en tres puntos.',
      '`inline_code_here`',
      '```js\nconst x = 1;\n```',
      '```\nunterminated fence',
      '{"role":"system","content":"be terse"}',
      'https://api.example.com/v1/messages?token=abc',
      '/etc/passwd',
      '<placeholder>',
      '{{ variable }}',
      '${SHELL_EXPANSION}',
      '- a list item\n- another list item',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      '',
      ' ',
      '\n\n\n',
      '\t\t',
      'a'.repeat(2000),
      '\u0000',
      '\u202eoverride',
      '\u00a0',
      '\ud83e\uddfe emoji and \u00e9 accents',
      '\ud800',
      'Step 1. Step 2. Step 3. Step 4. Step 5. Step 6. Step 7. Step 8.',
      'The quick brown fox jumps over the lazy dog. '.repeat(20),
    ]);
  }

  /** A whole prompt, assembled from fragments. */
  prompt() {
    if (this.chance(0.04)) return '';
    return this.list(1, 8, () => this.fragment()).join(this.pick(['\n', '\n\n', ' ', '']));
  }

  /** A prompt with a credential, a path or a branch name planted in it. */
  promptWithSecrets() {
    const parts = this.list(1, 4, () => this.fragment());
    for (const secret of this.list(1, 3, () => this.pick(SECRETS))) {
      parts.splice(this.int(0, parts.length), 0, secret);
    }
    return parts.join('\n');
  }

  /** One usage record, as a line of a log. */
  usageRecord(over = {}) {
    return {
      model: this.pick([
        'claude-opus-5',
        'claude-haiku-4-5',
        'gpt-5',
        'gpt-5-mini',
        'a-model-nobody-prices',
      ]),
      label: this.pick(['checkout', 'search', 'support', '', 'billing']),
      usage: {
        input_tokens: this.int(0, 400000),
        output_tokens: this.int(0, 50000),
        ...(this.chance(0.4)
          ? { cache_read_input_tokens: this.int(0, 200000) }
          : {}),
        ...(this.chance(0.3)
          ? { cache_creation_input_tokens: this.int(0, 100000) }
          : {}),
      },
      ...over,
    };
  }

  /** A whole log, as text, the way one actually arrives. */
  usageLog(lines = this.int(0, 12)) {
    const out = [];
    for (let n = 0; n < lines; n += 1) {
      out.push(this.chance(0.9) ? JSON.stringify(this.usageRecord()) : this.fragment());
    }
    return out.join('\n');
  }

  /** A value of any JSON type at all, for the totality properties. */
  anything(depth = 0) {
    const leaves = [null, true, false, this.hostileNumber(), this.fragment()];
    if (depth > 2 || this.chance(0.6)) return this.pick(leaves);
    if (this.chance(0.5)) return this.list(0, 3, () => this.anything(depth + 1));
    const out = {};
    for (const key of this.list(0, 3, () => this.pick(['a', '__proto__', 'usage', 'model', '']))) {
      out[key] = this.anything(depth + 1);
    }
    return out;
  }
}

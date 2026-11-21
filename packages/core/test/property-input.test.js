import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  ConfigError,
  analyzeTask,
  claudeCodeRecords,
  codexRecords,
  geminiCliRecords,
  optimize,
  parseConfig,
  parsePlanDocument,
  parseTaskReport,
  parseUsageLine,
} from '../dist/index.js';

/**
 * Property-based tests over every entry point that reads text Trazum did not
 * write (#906).
 *
 * `hostile-input.test.js` already fuzzes `optimize` and the usage profile from
 * a corpus of hand-picked atoms. These come at the parsers from the other
 * side: fast-check generates the input, from any string at all to JSON built
 * from the very field names each reader looks for, and when a property fails
 * it shrinks the input to the smallest one that still fails. Every run uses
 * one seed, so a failure in CI is the same failure on any machine; change
 * SEED to explore further, and keep any case it finds as a named test.
 *
 * Each property states a promise the code already makes: a reader counts and
 * never throws, a count is never negative, a parser refuses with its own error
 * and never with a TypeError, and what a person wrote in a message never comes
 * out the other end.
 */

const SEED = 906;
const RUNS = 300;
const check = (property) => fc.assert(property, { seed: SEED, numRuns: RUNS });

/** Planted where only message text, tool arguments and paths go. */
const MARKER = 'TRAZUM_PRIVATE_MARKER';

/** Any string, including lone surrogates, NUL and control characters. */
const anyText = fc.string({ unit: 'binary', maxLength: 400 });

/**
 * A token count as a log might carry one. Mostly right, so the readers get
 * past their first check and read records; sometimes negative, fractional,
 * huge, a string or missing, so the refusals are exercised too.
 */
const count = fc.oneof(
  { arbitrary: fc.nat({ max: 2_000_000 }), weight: 40 },
  { arbitrary: fc.integer({ min: -1_000_000_000, max: -1 }), weight: 1 },
  { arbitrary: fc.double({ noNaN: false }), weight: 1 },
  { arbitrary: fc.constant(Number.MAX_SAFE_INTEGER), weight: 1 },
  { arbitrary: fc.string({ maxLength: 8 }), weight: 1 },
  { arbitrary: fc.constant(null), weight: 1 },
);
const sometimes = (arbitrary) => fc.option(arbitrary, { freq: 6, nil: undefined });
const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-7', 'gpt-4o', 'gemini-2.5-pro', ''];
const model = fc.oneof({ arbitrary: fc.constantFrom(...MODELS), weight: 8 }, { arbitrary: anyText, weight: 1 });
const timestamp = fc.oneof({ arbitrary: fc.constantFrom('2026-11-21T09:00:00Z', '2026-11-21T09:00:05.120Z'), weight: 8 }, { arbitrary: anyText, weight: 1 });
const id = (prefix) => fc.integer({ min: 1, max: 4 }).map((n) => `${prefix}${n}`);
const said = fc.constant(`${MARKER} said this`);
const drop = (object) => JSON.stringify(object, (_key, value) => (value === undefined ? undefined : value));

/** A Claude Code line: an assistant call with usage, a person's turn, or something else. */
const claudeLine = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      type: fc.constant('assistant'), sessionId: sometimes(id('s')), requestId: sometimes(id('r')),
      timestamp: sometimes(timestamp), cwd: said, gitBranch: said, isSidechain: sometimes(fc.boolean()), agentId: sometimes(id('a')),
      message: fc.record({
        id: sometimes(id('m')), model,
        usage: fc.record({
          input_tokens: count, output_tokens: count, cache_read_input_tokens: sometimes(count),
          cache_creation_input_tokens: sometimes(count),
          cache_creation: sometimes(fc.record({ ephemeral_5m_input_tokens: count, ephemeral_1h_input_tokens: count })),
        }),
        content: fc.constant([{ type: 'text', text: `${MARKER} said this` }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: `/${MARKER}` } }]),
      }),
    }).map(drop),
  },
  { weight: 1, arbitrary: fc.record({ type: fc.constant('user'), sessionId: id('s'), cwd: said, message: fc.record({ content: said }) }).map(drop) },
  { weight: 1, arbitrary: anyText },
);

/** A Codex session: meta, model, then usage snapshots whose totals mostly add up. */
const codexUsage = fc.record({
  input_tokens: fc.nat({ max: 100_000 }), cached_input_tokens: fc.nat({ max: 100_000 }), output_tokens: fc.nat({ max: 20_000 }),
  reasoning_output_tokens: fc.nat({ max: 20_000 }),
}).map((u) => ({ ...u, cached_input_tokens: Math.min(u.cached_input_tokens, u.input_tokens), total_tokens: u.input_tokens + u.output_tokens }));
const codexText = fc.record({
  session: id('c'), model, turns: fc.array(fc.tuple(codexUsage, timestamp, fc.boolean()), { maxLength: 6 }),
  noise: fc.array(fc.oneof(anyText, fc.jsonValue().map((v) => JSON.stringify(v))), { maxLength: 3 }),
}).map(({ session, model: name, turns, noise }) => {
  const lines = [drop({ type: 'session_meta', payload: { id: session, cwd: `/${MARKER}` } }), drop({ type: 'turn_context', payload: { model: name } })];
  const total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
  for (const [last, ts, corrupt] of turns) {
    for (const key of Object.keys(total)) total[key] += last[key];
    const info = corrupt ? { total_token_usage: { ...total, input_tokens: -1 }, last_token_usage: last } : { total_token_usage: { ...total }, last_token_usage: last };
    lines.push(drop({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info } }));
    lines.push(drop({ type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: `${MARKER} said this`, call_id: 'x' } }));
  }
  return [...lines, ...noise].join('\n');
});

/** A Gemini CLI session, as one document or as lines. */
const geminiMessage = fc.record({
  id: id('g'), type: fc.oneof({ arbitrary: fc.constant('gemini'), weight: 6 }, { arbitrary: fc.constant('user'), weight: 1 }),
  timestamp, model, content: said,
  // Counts that agree with each other (cached within input, a total that is
  // the sum of its parts), then, one time in four, one field replaced by any
  // count at all: the reader has to refuse that, not read it.
  tokens: fc.tuple(
    fc.record({ input: fc.nat({ max: 200_000 }), output: fc.nat({ max: 50_000 }), thoughts: sometimes(fc.nat({ max: 50_000 })), tool: sometimes(fc.nat({ max: 5_000 })) }),
    fc.nat({ max: 100 }), fc.boolean(), fc.option(fc.tuple(fc.constantFrom('input', 'output', 'cached', 'thoughts', 'tool', 'total'), count), { freq: 3 }),
  ).map(([parts, cachedPct, withTotal, corrupt]) => {
    const tokens = { ...parts, cached: Math.floor(parts.input * cachedPct / 100) };
    if (withTotal) tokens.total = parts.input + parts.output + (parts.thoughts ?? 0) + (parts.tool ?? 0);
    if (corrupt) tokens[corrupt[0]] = corrupt[1];
    return tokens;
  }),
});
const geminiText = fc.oneof(
  fc.record({ sessionId: id('session-'), messages: fc.array(geminiMessage, { maxLength: 6 }) }).map(drop),
  fc.tuple(id('session-'), fc.array(geminiMessage, { maxLength: 6 }), fc.array(anyText, { maxLength: 2 }))
    .map(([session, messages, noise]) => [drop({ sessionId: session }), ...messages.map(drop), ...noise].join('\n')),
);

const lines = (line) => fc.array(line, { maxLength: 10 }).map((all) => all.join('\n'));

/** One usage line in Trazum's own shape, mostly well formed. */
const usageLine = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      model, ts: sometimes(timestamp), label: sometimes(fc.string({ maxLength: 12 })),
      usage: fc.record({ input_tokens: count, output_tokens: count, cache_read_input_tokens: sometimes(count), cache_creation_input_tokens: sometimes(count) }),
    }).map(drop),
  },
  { weight: 1, arbitrary: fc.jsonValue().map((v) => JSON.stringify(v)) },
  { weight: 1, arbitrary: anyText },
);

/** Every number anywhere inside `value`. */
const numbersIn = (value) => {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
};

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

/**
 * The shaped log most of the time, and sometimes any text or any JSON at all,
 * so a reader also meets a whole input that is nothing like its format.
 */
const orAnything = (logText) => fc.oneof(
  { arbitrary: logText, weight: 8 },
  { arbitrary: anyText, weight: 1 },
  { arbitrary: fc.jsonValue().map((v) => JSON.stringify(v)), weight: 1 },
);

/** A line no JSON parser accepts, whatever follows its first character. */
const brokenLine = anyText.map((tail) => `\u0001{${tail.replaceAll('\n', ' ')}`);

describe('the transcript readers, given any log', () => {
  const readers = [
    ['Claude Code', claudeCodeRecords, lines(claudeLine), ['collapsed', 'noRequestId', 'otherLines', 'unparseable']],
    ['Codex', codexRecords, codexText, ['duplicates', 'unparseable', 'missingModel', 'unsupported', 'otherLines']],
    ['Gemini CLI', geminiCliRecords, geminiText, ['repeats', 'unparseable', 'unsupported', 'missingModel', 'remainderAsOutput']],
  ];
  for (const [name, read, logText, counters] of readers) {
    it(`${name}: the generated logs reach records, so the properties below test something`, () => {
      const reached = fc.sample(logText, { seed: SEED, numRuns: RUNS }).filter((text) => read(text).records.length > 0).length;
      assert.ok(reached >= RUNS / 10, `only ${reached} of ${RUNS} generated logs produced a record`);
    });

    it(`${name} counts what it could not read, never throws, and every number it returns is finite and not negative`, () => {
      check(fc.property(orAnything(logText), (text) => {
        const result = read(text);
        for (const key of counters) assert.ok(isCount(result[key]), `${key} is ${result[key]}`);
        for (const record of result.records) {
          for (const n of numbersIn(record)) assert.ok(Number.isFinite(n) && n >= 0, `a record carries ${n}`);
        }
      }));
    });

    it(`${name} never copies message text, tool arguments or a path into what it returns`, () => {
      check(fc.property(orAnything(logText), (text) => {
        assert.ok(!JSON.stringify(read(text)).includes(MARKER));
      }));
    });
  }
});

describe('a line the reader cannot parse is counted, not skipped', () => {
  // Gemini CLI's log is read as lines here: a session written as one JSON
  // document is no longer one once a line is added to it.
  const geminiLines = fc.tuple(id('session-'), fc.array(geminiMessage, { maxLength: 6 }))
    .map(([session, messages]) => [drop({ sessionId: session }), ...messages.map(drop)].join('\n'));
  for (const [name, read, logText] of [
    ['Claude Code', claudeCodeRecords, lines(claudeLine)],
    ['Codex', codexRecords, codexText],
    ['Gemini CLI', geminiCliRecords, geminiLines],
  ]) {
    it(`${name} counts one more unparseable line for each broken line added, and reads the rest as before`, () => {
      check(fc.property(logText, brokenLine, (text, broken) => {
        const before = read(text);
        const after = read(`${text}\n${broken}`);
        assert.equal(after.unparseable, before.unparseable + 1);
        assert.deepEqual(after.records, before.records);
      }));
    });
  }
});

describe('one usage line, given anything', () => {
  it('is read or skipped, and a record it reads has no negative or infinite count', () => {
    const read = fc.sample(usageLine, { seed: SEED, numRuns: RUNS }).filter((line) => parseUsageLine(line) !== null).length;
    assert.ok(read >= RUNS / 10, `only ${read} of ${RUNS} generated lines were read`);
    check(fc.property(usageLine, (line) => {
      const record = parseUsageLine(line);
      if (record === null) return;
      assert.equal(typeof record.model, 'string');
      for (const key of ['inputTokens', 'cacheReadTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'outputTokens']) {
        assert.ok(Number.isFinite(record[key]) && record[key] >= 0, `${key} is ${record[key]}`);
      }
    }));
  });
});

describe('the documents a person hands in', () => {
  const documents = fc.oneof(anyText, fc.jsonValue().map((v) => JSON.stringify(v)), fc.object().map((v) => JSON.stringify(v)));

  it('a config is accepted or refused with a ConfigError, never with a TypeError', () => {
    check(fc.property(documents, (text) => {
      try {
        parseConfig(text, 'property.json');
      } catch (error) {
        assert.ok(error instanceof ConfigError, `${error?.constructor?.name}: ${error?.message}`);
      }
    }));
  });

  it('a plan is answered with a result, never with an exception', () => {
    check(fc.property(documents, (text) => {
      const result = parsePlanDocument(text);
      assert.equal(typeof result, 'object');
      assert.ok(result !== null);
    }));
  });

  // A report the analyzer wrote, from a generated session, with a declared
  // outcome or none.
  const report = fc.tuple(lines(claudeLine), fc.constantFrom('accepted', 'rejected', 'unknown'), fc.constantFrom('baseline', 'repeat-review-v1'))
    .map(([text, outcome, policyId]) => {
      try {
        return analyzeTask({
          taskId: 'property-task', taskType: 'fix-test', criterion: 'The generated checks pass.', policyId, outcome,
          ...(outcome === 'unknown' ? {} : { assessor: 'property-test' }),
          sources: [{ format: 'claude-code', text }],
        });
      } catch {
        return null;
      }
    })
    .filter((value) => value !== null);

  it('a task report the analyzer wrote reads back as the same report', () => {
    check(fc.property(report, (written) => {
      assert.deepEqual(parseTaskReport(JSON.stringify(written)), written);
    }));
  });

  /** Every path to a value inside `value`, as a list of keys. */
  const paths = (value, prefix = []) => {
    if (value === null || typeof value !== 'object') return [prefix];
    return [prefix, ...Object.entries(value).flatMap(([key, inner]) => paths(inner, [...prefix, key]))];
  };

  it('a report with one field replaced is read as it now stands or refused as invalid task data', () => {
    check(fc.property(report, fc.nat(), fc.jsonValue(), (written, pick, replacement) => {
      const all = paths(written).filter((path) => path.length > 0);
      const path = all[pick % all.length];
      const changed = structuredClone(written);
      let target = changed;
      for (const key of path.slice(0, -1)) target = target[key];
      target[path.at(-1)] = replacement;
      let parsed;
      try {
        parsed = parseTaskReport(JSON.stringify(changed));
      } catch (error) {
        assert.match(String(error?.message), /^Invalid task data/u, `${error?.constructor?.name}: ${error?.message}`);
        return;
      }
      assert.deepEqual(parsed, JSON.parse(JSON.stringify(changed)));
    }));
  });

  it('a task report is read or refused as invalid task data, never with a TypeError', () => {
    check(fc.property(documents, (text) => {
      try {
        parseTaskReport(text);
      } catch (error) {
        assert.match(String(error?.message), /^Invalid task data/u, `${error?.constructor?.name}: ${error?.message}`);
      }
    }));
  });
});

describe('optimize, given any prompt', () => {
  it('never throws, never grows the count, and keeps a fenced block byte for byte', () => {
    const block = fc.string({ unit: 'grapheme', maxLength: 60 }).map((body) => `\`\`\`\n${body.replaceAll('`', "'")}\n\`\`\``);
    check(fc.property(anyText, block, anyText, (before, code, after) => {
      const prompt = `${before}\n\n${code}\n\n${after}`;
      const result = optimize(prompt);
      assert.ok(result.tokensAfter <= result.tokensBefore, `${result.tokensBefore} became ${result.tokensAfter}`);
      assert.ok(result.optimized.includes(code), 'the fenced block changed');
    }));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  claudeCodeRecords,
  looksLikeClaudeCodeTranscript,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * The transcript converter, held to the two promises the 1.69 plan makes:
 * the counts survive exactly once per API call, and nothing else survives
 * at all. Both are proven the three-doors way — by inspecting the output,
 * not by trusting the code.
 */

const SECRET_TEXT = 'the-user-said-something-private-9f1c';
const SECRET_PATH = '/home/somebody/very-private-project';
const SECRET_BRANCH = 'feature/secret-launch';

const assistant = (over = {}) => ({
  type: 'assistant',
  timestamp: '2026-08-10T10:00:00.000Z',
  sessionId: 'session-1',
  requestId: 'req-1',
  cwd: SECRET_PATH,
  gitBranch: SECRET_BRANCH,
  message: {
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text: SECRET_TEXT }],
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 40,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 40 },
      service_tier: 'standard',
    },
  },
  ...over,
});

const lines = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');

describe('the transcript converter prices each call once', () => {
  it('collapses the one-line-per-content-block repetition', () => {
    // The measured norm: one call, three lines, identical usage. One record.
    const text = lines(assistant(), assistant(), assistant());
    const out = claudeCodeRecords(text);
    assert.equal(out.records.length, 1);
    assert.equal(out.collapsed, 2);
    assert.equal(out.streamed, 0);
    assert.equal(out.disagreements, 0);
  });

  it('keeps the final counts of a call written while streaming, without alarm', () => {
    const early = assistant();
    early.message = { ...early.message, usage: { ...early.message.usage, output_tokens: 1 } };
    const out = claudeCodeRecords(lines(early, assistant()));
    assert.equal(out.records.length, 1);
    assert.equal(out.records[0].usage.output_tokens, 20, 'the final line did not stand');
    assert.equal(out.streamed, 1);
    assert.equal(out.disagreements, 0);
  });

  it('counts a shrinking count as a disagreement, not as streaming', () => {
    const late = assistant();
    late.message = { ...late.message, usage: { ...late.message.usage, output_tokens: 5 } };
    const out = claudeCodeRecords(lines(assistant(), late));
    assert.equal(out.streamed, 0);
    assert.equal(out.disagreements, 1);
    // The last line still stands — resolved loudly, not silently reordered.
    assert.equal(out.records[0].usage.output_tokens, 5);
  });

  it('keeps calls with no requestId, counted', () => {
    const bare = assistant({ requestId: undefined });
    delete bare.requestId;
    const out = claudeCodeRecords(lines(bare, bare));
    // Nothing to collapse against: both are kept, and the count says so.
    assert.equal(out.records.length, 2);
    assert.equal(out.noRequestId, 2);
  });

  it('counts the transcript’s other business without converting it', () => {
    const out = claudeCodeRecords(
      lines({ type: 'user', message: { content: SECRET_TEXT } }, { type: 'system' }, assistant()) +
        '\nnot json at all\n',
    );
    assert.equal(out.records.length, 1);
    assert.equal(out.otherLines, 2);
    assert.equal(out.unparseable, 1);
  });

  it('every record it emits parses as a usage-log line, TTL split intact', () => {
    // The whole point: the output feeds parseUsageLine — the same door every
    // other log walks through. A record the parser rejects is a conversion
    // that lied about its own format.
    const out = claudeCodeRecords(lines(assistant()), { label: 'agent' });
    const parsed = parseUsageLine(JSON.stringify(out.records[0]));
    assert.ok(parsed !== null, 'parseUsageLine rejected a converted record');
    assert.equal(parsed.model, 'claude-sonnet-5');
    assert.equal(parsed.label, 'agent');
    assert.equal(parsed.session, 'session-1');
    assert.ok(parsed.ts !== null, 'the timestamp did not survive');
    assert.equal(parsed.writeTtlKnown, true, 'the cache TTL split did not survive');
  });
});

describe('nothing but the numbers crosses the conversion', () => {
  it('no message text, no path, no branch, no requestId in the output', () => {
    // Grep the entire serialised output — the three-doors method. The
    // fixture plants a secret in each field a transcript actually carries;
    // if any appears, the converter reached past the usage object.
    const out = claudeCodeRecords(lines(assistant(), { type: 'user', message: { content: SECRET_TEXT } }));
    const serialised = JSON.stringify(out);
    for (const planted of [SECRET_TEXT, SECRET_PATH, SECRET_BRANCH, 'req-1', 'service_tier']) {
      assert.ok(!serialised.includes(planted), `${planted} crossed the conversion`);
    }
    // And the session id is the one thing of the envelope that does survive
    // — grouped by downstream, never printed, the standing rule.
    assert.ok(serialised.includes('session-1'));
  });
});

describe('the tab tells a transcript from a usage log', () => {
  const transcript = lines(assistant(), { type: 'user', message: { content: 'hi' } });
  const usageLog = [
    JSON.stringify({ model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 2 } }),
    JSON.stringify({ model: 'claude-opus-5', label: 'assistant-work', usage: { input_tokens: 5, output_tokens: 1 } }),
  ].join('\n');

  it('recognises a transcript', () => {
    assert.equal(looksLikeClaudeCodeTranscript(transcript), true);
  });

  it('does not mistake a usage log for one — even one labelled "assistant"', () => {
    // The trap: a usage log line can carry `label: "assistant-work"`. The
    // detector keys on `type: 'assistant'` at the envelope, not the word.
    assert.equal(looksLikeClaudeCodeTranscript(usageLog), false);
  });

  it('says no to the near-misses', () => {
    assert.equal(looksLikeClaudeCodeTranscript(''), false);
    assert.equal(looksLikeClaudeCodeTranscript('not json at all\nstill not\n'), false);
    // An assistant line with no usage is a transcript line, but not one this
    // converts — and the detector is defined as "convertible", so: false.
    assert.equal(
      looksLikeClaudeCodeTranscript(JSON.stringify({ type: 'assistant', message: { model: 'm' } })),
      false,
    );
  });
});

/**
 * The 1.77 arc: four things a real forty-day profile had to say, and should
 * not have had to. Each was the converter handing the profiler less than
 * the transcript already knew.
 */
describe('the agent\'s bill, told honestly', () => {
  const assistant = (extra) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-10T10:00:00.000Z',
      sessionId: 's1',
      requestId: `req-${extra.requestId ?? '1'}`,
      message: {
        model: extra.model ?? 'claude-sonnet-5',
        ...(extra.stopReason !== undefined ? { stop_reason: extra.stopReason } : {}),
        content: [{ type: 'text', text: 'words' }],
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    });

  it('carries stop_reason when the transcript has it, and invents none when it does not', () => {
    const withReason = claudeCodeRecords(assistant({ stopReason: 'max_tokens' }));
    assert.equal(withReason.records[0].stop_reason, 'max_tokens');
    // Absent stays absent. A truncation verdict guessed from a round output
    // length would be this tool inventing the one field it exists to read.
    const without = claudeCodeRecords(assistant({}));
    assert.equal('stop_reason' in without.records[0], false);
  });

  it('excludes <synthetic> by name, counts it, and prices everything else', () => {
    const text = [
      assistant({ requestId: 'a' }),
      assistant({ requestId: 'b', model: '<synthetic>' }),
    ].join('\n');
    const conversion = claudeCodeRecords(text);
    assert.equal(conversion.synthetic, 1);
    assert.equal(conversion.records.length, 1);
    assert.equal(conversion.records[0].model, 'claude-sonnet-5');
    // And only that exact string: a real model whose id merely looks odd is
    // spend, and a pattern that swallowed it would delete money silently.
    const odd = claudeCodeRecords(assistant({ model: '<not-synthetic>' }));
    assert.equal(odd.synthetic, 0);
    assert.equal(odd.records.length, 1);
  });

  it('a dated id prices as the model it is, and an undeclared one still refuses', () => {
    // 164 calls sat outside a real report's totals over exactly this.
    const dated = BUNDLED_CATALOGUE.byId.get('claude-haiku-4-5-20251001');
    assert.ok(dated, 'the canonical dated id resolves to no model');
    assert.equal(dated.id, 'claude-haiku-4-5');
    assert.equal(dated.inputPerMTok, BUNDLED_CATALOGUE.byId.get('claude-haiku-4-5').inputPerMTok);
    // The mechanism is a declaration, not a fuzzy matcher: an id that merely
    // resembles a known one is still unknown, because guessing that two ids
    // bill alike is guessing a price.
    assert.equal(BUNDLED_CATALOGUE.byId.get('claude-haiku-4-5-20260101'), undefined);
    assert.equal(BUNDLED_CATALOGUE.byId.get('claude-sonnet-5-20260101'), undefined);
  });

  it('the four sentences the real run could not produce', () => {
    // End to end: a transcript with a dated model, a synthetic turn and a
    // stop reason converts, and the profile of its output prices every call,
    // leaves nothing unpriced, and can answer the truncation question.
    const text = [
      assistant({ requestId: 'a', model: 'claude-haiku-4-5-20251001', stopReason: 'max_tokens' }),
      assistant({ requestId: 'b', model: '<synthetic>' }),
      assistant({ requestId: 'c', model: 'claude-sonnet-5', stopReason: 'end_turn' }),
    ].join('\n');
    const conversion = claudeCodeRecords(text, { label: 'trazum' });
    const log = conversion.records.map((r) => JSON.stringify(r)).join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });

    assert.equal(report.total.calls, 2, 'the synthetic turn was priced as a call');
    assert.equal(report.unpriced.calls, 0, 'a dated id fell out of the totals');
    assert.ok(report.total.totalUsd > 0);
    // Labelled, so the levers describe a decision rather than a mixture.
    assert.deepEqual(report.byLabel.map((e) => e.label), ['trazum']);
    // And the truncation question is answerable now: both calls recorded one.
    assert.equal(report.total.stopReasonCalls, 2);
  });
});

/**
 * 1.77.2, found by running 1.77.1 on a real bill.
 *
 * `--pricing-live` dropped eight calls out of the totals. The aliases were
 * indexed in one catalogue builder and not the other, so a dated id priced
 * fine until an overlay was applied and then quietly stopped. Two builders
 * means one of them is always the one nobody updated; there is one now, and
 * this holds every path that produces a catalogue to it.
 */
describe('an alias survives every catalogue, not just the bundled one', () => {
  const DATED = 'claude-haiku-4-5-20251001';
  const log = JSON.stringify({
    ts: '2026-08-01T10:00:00Z',
    model: DATED,
    usage: { input_tokens: 1000, output_tokens: 100 },
  });

  it('prices the same under bundled, an overlay, and a live-shaped feed', async () => {
    const { applyPricingOverlay, openrouterOverlay, catalogueFromOverlay } = await import('../dist/index.js');
    assert.equal(profileUsage(log, { catalogue: BUNDLED_CATALOGUE }).total.calls, 1);

    // The shape `--pricing-live` builds: hundreds of models added, none of
    // the bundled ones replaced.
    const known = new Set(BUNDLED_CATALOGUE.models.map((m) => m.id));
    const { overlay } = openrouterOverlay(
      { data: [{ id: 'qwen/q3', context_length: 1000, pricing: { prompt: '0.000001', completion: '0.000002' } }] },
      { knownIds: known, lastReviewed: '2026-08-25' },
    );
    const live = applyPricingOverlay(BUNDLED_CATALOGUE, overlay, 'live');
    assert.equal(live.byId.has(DATED), true, 'the live catalogue lost the alias index');
    assert.equal(profileUsage(log, { catalogue: live }).total.calls, 1, 'calls left the totals under --pricing-live');

    // And the hand-written overlay path, which is a different door.
    const local = catalogueFromOverlay(
      JSON.stringify({ lastReviewed: '2026-08-25', models: { 'claude-opus-5': { inputPerMTok: 6 } } }),
      'test overlay',
    );
    assert.equal(profileUsage(log, { catalogue: local }).total.calls, 1, 'a local overlay lost the alias');
  });

  it('a real id still beats an alias that collides with it', async () => {
    const { applyPricingOverlay, parsePricingOverlay } = await import('../dist/index.js');
    // Somebody declares a model whose id is another model's alias. The id
    // wins: an alias is a convenience, never a way to shadow a real entry.
    const overlay = parsePricingOverlay(
      JSON.stringify({
        lastReviewed: '2026-08-25',
        models: {
          [DATED]: {
            displayName: 'Something else entirely',
            inputPerMTok: 99,
            outputPerMTok: 99,
            contextWindow: 1000,
            cacheMinTokens: null,
            tier: 'unknown',
            capability: 'unknown',
          },
        },
      }),
      'collision overlay',
    );
    const catalogue = applyPricingOverlay(BUNDLED_CATALOGUE, overlay, 'collision overlay');
    assert.equal(catalogue.byId.get(DATED).displayName, 'Something else entirely');
  });
});

describe('two projects in one session, told apart at the source', () => {
  /**
   * The question one session could not answer: **which project was this call
   * for**, when a person moved between two repositories without starting a new
   * Claude Code session. The transcript has no field that says so. It has a
   * `cwd`, and this module has never emitted one, on purpose.
   *
   * Reading it to *choose* a label the operator wrote is a different act from
   * emitting it, and the difference is the whole of this feature. The last
   * test here is the one that matters.
   */

  const inDirectory = (cwd, over = {}) => assistant({ cwd, requestId: `req-${cwd}`, ...over });

  it('labels each line by the directory it was working in', () => {
    const text = lines(
      inDirectory('/work/trazum/packages/core'),
      inDirectory('/work/trazum-pro/src'),
    );
    const out = claudeCodeRecords(text, {
      labelByCwd: [
        { prefix: '/work/trazum', label: 'trazum' },
        { prefix: '/work/trazum-pro', label: 'trazum-pro' },
      ],
    });
    assert.deepEqual(
      out.records.map((record) => record.label),
      ['trazum', 'trazum-pro'],
    );
  });

  it('and the longest prefix wins, so a nested project is not swallowed', () => {
    /*
      `/work/trazum-pro` starts with `/work/trazum`. Order in the list must not
      decide the answer, because nobody writing these rules is thinking about
      the order they wrote them in.
    */
    const text = lines(inDirectory('/work/trazum-pro/worker'));
    const out = claudeCodeRecords(text, {
      labelByCwd: [
        { prefix: '/work/trazum-pro', label: 'trazum-pro' },
        { prefix: '/work/trazum', label: 'trazum' },
      ],
    });
    assert.equal(out.records[0].label, 'trazum-pro');
  });

  it('falls back to the flat label for work outside every rule', () => {
    /* What somebody splitting two projects out of one session means by giving
       both: these two are named, everything else is whatever they called it. */
    const text = lines(inDirectory('/somewhere/else'));
    const out = claudeCodeRecords(text, {
      label: 'other',
      labelByCwd: [{ prefix: '/work/trazum', label: 'trazum' }],
    });
    assert.equal(out.records[0].label, 'other');
  });

  it('and leaves it unattributed when there is no fallback either', () => {
    /* Unattributed rather than attributed to a neighbour. A guessed label is
       worse than none: it puts somebody else's money on a project's bill. */
    const text = lines(inDirectory('/somewhere/else'));
    const out = claudeCodeRecords(text, {
      labelByCwd: [{ prefix: '/work/trazum', label: 'trazum' }],
    });
    assert.equal('label' in out.records[0], false);
  });

  it('and a line with no cwd at all takes the fallback rather than throwing', () => {
    const text = lines(assistant({ cwd: undefined }));
    const out = claudeCodeRecords(text, {
      label: 'other',
      labelByCwd: [{ prefix: '/work/trazum', label: 'trazum' }],
    });
    assert.equal(out.records[0].label, 'other');
  });

  it('reads the path and never emits it, which is the whole contract', () => {
    /**
     * The test this feature exists under. `cwd` is a file path, and a file
     * path says something about somebody's machine that a bill does not need.
     * The rule reads it; the output carries the operator's own word for it
     * and nothing else.
     *
     * Same shape as the redaction suite above, pointed at the one field this
     * change made the converter read for the first time.
     */
    const text = lines(inDirectory(SECRET_PATH));
    const out = claudeCodeRecords(text, {
      labelByCwd: [{ prefix: SECRET_PATH, label: 'billing' }],
    });
    assert.equal(out.records[0].label, 'billing');

    const whole = JSON.stringify(out);
    assert.equal(whole.includes(SECRET_PATH), false, 'the working directory reached the output');
    assert.equal(whole.includes('somebody'), false, 'part of the path reached the output');
    assert.equal(whole.includes(SECRET_TEXT), false);
    assert.equal(whole.includes(SECRET_BRANCH), false);
  });
});

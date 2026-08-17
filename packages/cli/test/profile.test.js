import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum profile` — the only command that reads what was charged rather than
 * what a file would cost.
 *
 * It exists because the rest of the CLI can only see the smallest line item: on
 * an ordinary support prompt the rules recover about 1% of the monthly figure
 * while output alone was 87% of it.
 */

const logOf = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-profile-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(
    path,
    records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n',
  );
  return path;
};

const run = (path, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', ...(path ? [path] : []), ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

/**
 * Output with its line wrapping flattened.
 *
 * Every prose message here is wrapped to the terminal width, so a phrase that
 * reads as one sentence on screen contains a newline and two spaces in the middle
 * of it. Asserting on the raw string means a test that passes or fails depending
 * on where a word happened to land — which is what happened to the first version
 * of the no-argument case.
 */
const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const call = (over = {}) => ({
  model: 'claude-opus-5',
  usage: { input_tokens: 1000, output_tokens: 200 },
  ...over,
});

describe('profiling a usage log', () => {
  it('reports the bill and how it splits', async () => {
    const result = run(await logOf([call(), call(), call()]));
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;

    assert.match(out, /3 calls/, 'the call count is missing');
    assert.match(out, /\$/, 'no money in a report about money');
    for (const part of ['Input', 'Output', 'Cache reads', 'Cache writes']) {
      assert.match(out, new RegExp(part), `${part} is not broken out`);
    }
  });

  it('prints every part, including the zero ones', async () => {
    /**
     * A row missing because it was zero reads as a row somebody forgot — and
     * "your cache writes are zero" is a finding, not an absence. It is how you
     * see at a glance that caching is off.
     */
    const result = run(await logOf([call()]));
    assert.match(result.stdout, /Cache writes\s+\$0/, 'a zero row was hidden');
  });

  it('says which part of the bill to argue with, once', async () => {
    /**
     * The line the command exists for. It printed twice in the first version when
     * output was both the largest part and over half — the same fact in adjacent
     * lines, which reads as a bug because it was one.
     */
    const result = run(
      await logOf(
        Array.from({ length: 5 }, () =>
          call({ usage: { input_tokens: 500, output_tokens: 4000 } }),
        ),
      ),
    );
    const matches = result.stdout.match(/is [\d.]+% of this bill/g) ?? [];
    assert.equal(matches.length, 1, `the headline claim printed ${matches.length} times`);
    assert.match(flat(result), /low ceiling/, 'it does not say what to do about output');
  });

  it('keeps an unpriced model out of the totals and says so', async () => {
    /**
     * The fault this repository keeps finding in itself: a total that silently
     * omits calls is wrong in the flattering direction. A production log will
     * contain models the catalogue does not know.
     */
    const result = run(
      await logOf([
        call(),
        { model: 'somebodys-finetune', usage: { input_tokens: 900_000, output_tokens: 90_000 } },
      ]),
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /not in these totals/, 'the omission is silent');
    assert.match(result.stdout, /somebodys-finetune/, 'the unknown model is not named');
    assert.match(flat(result), /--pricing/, 'it does not say how to include it');
    assert.match(result.stdout, /1 call is/, 'the singular is wrong or the count is missing');
  });

  it('reads a log with torn lines instead of dying on them', async () => {
    // Real logs have torn lines. Throwing makes the tool unusable on real data.
    const result = run(await logOf([call(), '{ torn', call()]));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 calls/);
    assert.match(result.stdout, /1 line could not be read/);
  });

  it('says what to do when pointed at nothing', async () => {
    // The first thing somebody types is the command with no argument, and the
    // format is the whole barrier to using it.
    const result = run(null);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /usage\.jsonl/, 'it does not show the shape of the argument');
    assert.match(flat(result), /never contains prompt text/, 'it does not say what it will not read');
  });

  it('reports an empty log as empty rather than as zero dollars', async () => {
    const result = run(await logOf([]));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No usage records/);
  });

  it('--json prints the report and nothing else', async () => {
    // Machine-readable means machine-readable. A stray heading makes it unparseable.
    const result = run(await logOf([call()]), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.total.calls, 1);
    assert.ok(Array.isArray(parsed.byLabel));
    assert.ok(Array.isArray(parsed.unpricedModels));
  });

  it('prices the bill whatever host Trazum happens to run on', async () => {
    /**
     * Every other report suppresses money on a subscription host, because a saving
     * quoted to somebody on a flat plan is money that does not exist. This log is a
     * record of metered API calls somebody was already billed for — the bill exists
     * wherever Trazum is running, so the host has no bearing on it.
     */
    const path = await logOf([call()]);
    const inClaudeCode = spawnSync(process.execPath, [CLI, 'profile', path], {
      encoding: 'utf8',
      env: { ...SPAWN_ENV, CLAUDECODE: '1' },
      timeout: 30000,
    });

    assert.equal(inClaudeCode.status, 0, inClaudeCode.stderr);
    assert.match(inClaudeCode.stdout, /\$/, 'a real bill was hidden because of where Trazum runs');
  });
});

describe('the three faults an adversarial review found', () => {
  /**
   * All three were the same shape and the shape is the point: a figure that came
   * out LOWER than the truth, or a claim stated flatly that was false, with
   * nothing on screen admitting either. Twenty-four agents across four lenses, and
   * every confirmed finding was in the flattering direction.
   */
  const at = (path) => run(path);

  it('prices a 1-hour cache write at the 1-hour rate', async () => {
    // 10M tokens of 1-hour writes on Opus 5: Anthropic bills $100. It reported
    // $62.50 — 37.5% under, on the largest line of the bill.
    const result = at(
      await logOf([
        {
          model: 'claude-opus-5',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 10_000_000,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10_000_000 },
          },
        },
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /\$100\.00/, 'the 1-hour rate is not being applied');
    assert.doesNotMatch(flat(result), /\$62\.50/, 'the 5-minute rate is still being used for both');
  });

  it('says so when it had to assume a cache-write rate', async () => {
    // A log with only the flat count cannot say which TTL applies, so the cheaper
    // rate is used — and a cheaper rate chosen in silence is the flattering
    // direction. The total is a floor and the report says the word.
    const result = at(
      await logOf([call({ usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 9_000 } })]),
    );
    assert.match(flat(result), /assumed/, 'it assumed a rate without saying so');
    assert.match(flat(result), /floor/, 'it does not say the total is a floor');
  });

  it('rejects a corrupt count instead of turning it into a silent zero', async () => {
    /**
     * A stringified `input_tokens` — what comes out of jq, a CSV round-trip, a
     * Postgres JSON column — became a clean zero. The bill read $0.0150 against a
     * true $2.015, and the headline said "output is 100% of this bill, so
     * shortening prompts has a low ceiling" on a workload that was almost entirely
     * prompt. The advice was exactly inverted.
     */
    const result = at(
      await logOf([
        { model: 'claude-opus-5', label: 'rag', usage: { input_tokens: '200000', output_tokens: 300 } },
        { model: 'claude-opus-5', label: 'rag', usage: { input_tokens: 200_000, output_tokens: 300 } },
      ]),
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /1 call/, 'the corrupt line was counted as a call');
    assert.match(flat(result), /could not be read/, 'the corrupt line was dropped silently');
    assert.match(flat(result), /Input is 99\.\d% of this bill/, 'the headline is still inverted');
  });

  it('reports a wholly unpriced log as having no bill, not a bill of zero', async () => {
    /**
     * The empty guard required BOTH the priced and unpriced counts to be zero, so
     * a log of unknown models printed a full report off a zeroed total: `0 calls ·
     * $0`, four zero rows, a meaningless "Input is 0.0% of this bill", and — on a
     * log holding 100,000 cache-read tokens — "Caching was never used on these
     * calls." Two affirmatively false claims, and the one correct line was the
     * quietest on screen.
     */
    const result = at(
      await logOf([
        { model: 'somebodys-finetune', usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50_000 } },
        { model: 'somebodys-finetune', usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50_000 } },
      ]),
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /no bill to report/, 'it still reports a bill of zero');
    assert.doesNotMatch(flat(result), /Caching was never used/, 'it still claims caching was unused');
    assert.doesNotMatch(flat(result), /0 calls/, 'it still prints a call count of zero');
    assert.match(flat(result), /somebodys-finetune/, 'it no longer names what it could not price');
  });
});

describe('whether the caching was worth doing', () => {
  /**
   * The one finding here that can contradict Trazum's own advice.
   *
   * The rest of the package tells people to cache. On Anthropic a cache write is
   * billed at 1.25x plain input, or 2x at the one-hour TTL, so a prefix rebuilt
   * faster than it is reused pays a premium and gets nothing back — and the cache
   * hit rate printed directly above this reads 97.8% on a log where one workload
   * is bleeding.
   */

  const write5m = (tokens, over = {}) =>
    call({ usage: { input_tokens: 100, output_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: tokens, ephemeral_1h_input_tokens: 0 } }, ...over });
  const read = (tokens, over = {}) =>
    call({ usage: { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: tokens }, ...over });

  it('names the loss, in money, when the cache never gets read back', async () => {
    const result = run(await logOf(Array.from({ length: 10 }, () => write5m(10_000))));
    assert.equal(result.status, 0, result.stderr);

    // $0.625 of writes against $0.500 as plain input. The figure, not just a warning.
    assert.match(flat(result), /Caching added \$0\.1250 to this bill/, 'the loss was not priced on screen');
    assert.doesNotMatch(flat(result), /Caching took .* off this bill/, 'a loss reported as a saving');
  });

  it('never claims caching went unused on a bill made of cache writes', async () => {
    /**
     * The hit rate is undefined when there are no reads and no plain input — zero
     * over zero — and the message was keyed off that null rather than off whether
     * caching had been used. So a log of pure cache writes printed "Caching was
     * never used on these calls" above a bill that was 96% cache writes.
     */
    const result = run(await logOf([write5m(10_000, { usage: { input_tokens: 0, output_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 10_000, ephemeral_1h_input_tokens: 0 } } })]));
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(flat(result), /never used/i, 'claimed caching was unused on a bill of cache writes');
    assert.match(flat(result), /Caching added/, 'the write premium went unreported');
  });

  it('surfaces the label bleeding under a healthy total', async () => {
    /**
     * `chat` saves $0.3925 and `rag` burns $0.125. The total is a comfortable
     * $0.2675 saved, so every headline on screen looks fine — and one of the two
     * workloads would be cheaper with caching switched off. The aggregate is
     * exactly where that hides, which is why it prints as a warning under the
     * good news rather than instead of it.
     */
    const result = run(
      await logOf([
        write5m(10_000, { label: 'chat' }),
        ...Array.from({ length: 9 }, () => read(10_000, { label: 'chat' })),
        ...Array.from({ length: 10 }, () => write5m(10_000, { label: 'rag' })),
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /Caching took \$0\.2675 off this bill/, 'the healthy total went unreported');
    assert.match(out, /hides a loss: caching costs \$0\.1250 across rag/, 'the bleeding label was not named');
  });

  it('stays quiet about caching nobody turned on', async () => {
    const result = run(await logOf([call(), call()]));
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Caching was never used/);
    assert.doesNotMatch(out, /Caching added|Caching took|came out level/, 'a verdict on caching that never happened');
  });

  it('carries the verdict into --json rather than leaving it to be re-derived', async () => {
    /**
     * Positive means worse here, which is backwards from every other figure Trazum
     * emits. A consumer left to re-derive that from the raw fields is a second
     * implementation of the sign convention, and one of the two will get it round
     * the wrong way.
     */
    const result = run(await logOf([write5m(10_000, { label: 'rag' })]), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);

    assert.equal(json.cache.verdict, 'lost-money');
    assert.ok(json.cache.deltaUsd > 0, 'a loss did not come out positive');
    assert.deepEqual(
      json.cacheByLabel.map((r) => [r.label, r.cache.verdict]),
      [['rag', 'lost-money']],
    );
  });
});

describe('what the report says when the log leaves the TTL out', () => {
  /**
   * From an adversarial review of the verdict, confirmed by four verifiers, and
   * the second time this command has made the same mistake: a rate assumed in the
   * cheap direction and then reported as measured.
   */

  const flatWrite = (tokens) =>
    call({ usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: tokens } });
  const read = (tokens) =>
    call({ usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: tokens } });

  it('reports neither answer, and does not assert one above the warning', async () => {
    /**
     * A million written, 300,000 read back: a $0.10 saving at the assumed 1.25x
     * and a $3.65 loss at 2x.
     *
     * The `doesNotMatch` is the half that was missed first time round. Adding the
     * warning while leaving `Caching took $0.1000 off this bill` printed above it
     * means the reader meets the affirmative claim first — and a finding a later
     * line retracts is still a finding somebody acted on.
     */
    const result = run(await logOf([flatWrite(1_000_000), read(300_000)]));
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /cannot say whether caching paid for itself/, 'the ambiguity went unreported');
    assert.match(out, /took \$0\.1000 off this bill/, 'the recorded figure is missing');
    assert.match(out, /added \$3\.65 to it/, 'the long-TTL figure is missing');
    assert.doesNotMatch(
      out,
      /off this bill, against the same tokens uncached/,
      'still asserted the flattering half above the warning',
    );
  });

  it('drops the hedge on a log that recorded every TTL', async () => {
    // Otherwise it is noise on every report, and noise is what gets a warning
    // ignored on the run where it mattered.
    const result = run(
      await logOf([
        call({ usage: { input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 } } }),
        read(300_000),
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(flat(result), /cannot say whether|is a bound/, 'hedged a log with nothing to hedge');
  });
});

describe('naming the labels that are losing money', () => {
  const write5m = (tokens, label, input = 0) =>
    call({ label, usage: { input_tokens: input, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: tokens, ephemeral_1h_input_tokens: 0 } } });

  it('ranks by what caching cost, not by the size of the bill', async () => {
    /**
     * `byLabel` arrives sorted by spend and the first version took the first three
     * off that list, so the worst cache in the estate went unnamed whenever it sat
     * on a small workload — which is where a bad cache usually is.
     *
     * `huge` loses more than the other four together and has the smallest bill, so
     * a spend-ordered list puts it last.
     */
    const result = run(
      await logOf([
        write5m(4_000_000, 'huge'),
        write5m(200_000, 'a', 9_000_000),
        write5m(190_000, 'b', 8_000_000),
        write5m(180_000, 'c', 7_000_000),
        write5m(170_000, 'd', 6_000_000),
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /The loss is in: huge,/, 'the biggest loser was not named first');
    assert.match(out, /and 2 more/, 'two losing labels were dropped in silence');
  });

  it('never claims the total pays off while saying it came out level', async () => {
    /**
     * The hidden-loss line ran under both `paid-off` and `no-difference` while
     * opening "Caching pays off overall" — printed directly beneath a line saying
     * caching had come out level. `rag` writes 3,600,000 at 1.25x and `chat` reads
     * 1,000,000 at 0.1x, which cancel to zero exactly.
     */
    const result = run(
      await logOf([
        write5m(3_600_000, 'rag'),
        call({ label: 'chat', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 } }),
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /came out level/, 'the level total was not reported');
    assert.match(out, /hides a loss: caching costs \$4\.50 across rag/, 'the hidden loss was not named');
    assert.doesNotMatch(out, /pays off overall/, 'claimed a payoff on a bill it had just called level');
  });
});

describe('what would actually move this bill', () => {
  /**
   * The answer to the fairest complaint this product has had: on a bill of twenty
   * thousand, the rules recover two hundred.
   *
   * That figure is right — three tokens out of three hundred and six, measured. The
   * conclusion is not that the tool is worthless but that it had been reading the
   * smallest line item. Which model a call goes to moves 40% to 80%; the Batch API
   * moves 50% flat. Both are priced here from the reader's own tokens.
   */

  const estate = (label, count, input, output, model = 'claude-opus-5') =>
    Array.from({ length: count }, () => ({ model, label, usage: { input_tokens: input, output_tokens: output } }));

  it('leads with the lever, priced, above the breakdowns', async () => {
    /**
     * 400 calls of 9,000 input and 300 output on Opus 5 is $21.00. The same tokens
     * on Sonnet 5 are $8.40, and batching that is $4.20 — so the slice is worth
     * $16.80, which is 52.2% of a bill whose prompt text could never be worth more
     * than 70.9% even deleted entirely.
     */
    // Two labels, so the breakdown table prints at all: it is suppressed on a
    // single row, where it would only be the total said twice.
    const result = run(
      await logOf([...estate('support-rag', 400, 9000, 300), ...estate('chat', 100, 2400, 700)]),
    );
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /What would actually move this bill/);
    assert.match(out, /support-rag on Claude Opus 5 — up to \$16\.80/, 'the combined figure is wrong or missing');
    assert.match(out, /route it to Claude Sonnet 5, \$12\.60/);
    assert.match(out, /send it through the Batch API, \$10\.50/);

    // Above the breakdowns, because a lever nobody scrolls to is a lever nobody pulls.
    assert.ok(
      result.stdout.indexOf('What would actually move') < result.stdout.indexOf('By label'),
      'the levers printed below the breakdown tables',
    );
  });

  it('never lets the options be added into a saving larger than the bill', async () => {
    /**
     * The fault the slice grouping exists for. Route and batch printed as separate
     * rows came to $23.10 against a slice that had spent $21.00 — impossible, and
     * in the flattering direction.
     */
    const result = run(await logOf(estate('support-rag', 400, 9000, 300)));
    const out = flat(result);
    assert.match(out, /400 calls, \$21\.00 spent/);
    assert.doesNotMatch(out, /up to \$2[1-9]\./, 'offered a saving larger than the slice ever cost');
  });

  it('says how much the prompt could ever be worth, and calls it a ceiling', async () => {
    /**
     * The comparison that makes the rest of the report honest. A 1% win reported
     * without saying 1% of what is not information, and this repository would
     * rather print the uncomfortable number itself than let somebody else find it.
     */
    const result = run(await logOf(estate('support-rag', 400, 9000, 300)));
    const out = flat(result);
    assert.match(out, /shortening the prompt text can touch \$18\.00 at the very most/);
    assert.match(out, /only if you deleted every input token/, 'presented a ceiling as an estimate');
  });

  it('says so plainly when there is no lever, rather than printing an empty heading', async () => {
    // Kimi K2 is the bottom of its family and its provider sells no batch API.
    // That reader is exactly the one who most needs the ceiling line.
    const result = run(await logOf(estate('chat', 200, 4000, 400, 'kimi-k2')));
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Nothing here clears 1% of the bill/);
    assert.match(out, /shortening the prompt text can touch/, 'the ceiling went unreported');
  });

  it('names the command that decides whether a route is safe', async () => {
    /**
     * The arithmetic is exact and says nothing about quality. Nothing here has seen
     * the prompt or a single answer, so a route is worth testing rather than worth
     * doing — and the difference between a saving and a gamble is naming the
     * command.
     */
    const out = flat(run(await logOf(estate('support-rag', 400, 9000, 300))));
    assert.match(out, /evaluation question, not an arithmetic one/);
    assert.match(out, /trazum route <log> --prompt-file <prompt> --cases <cases> --yes/);
    /**
     * The command it used to name. `trazum eval --model <id>` does not test a
     * route: `eval` runs against whatever `TRAZUM_LLM_MODEL` says and `--model`
     * only prices the report, so the instruction sent the reader to a measurement
     * that never touched the candidate model. This assertion is the one that
     * matters — the wrong command was worse than none.
     */
    assert.doesNotMatch(out, /trazum eval .*--model/, 'named a command that cannot test a route');
  });
});

describe('what re-sending the conversation costs', () => {
  /**
   * The line nothing in this tool could see. A chat or agent workload sends the
   * whole conversation back on every turn, so the input grows with the turn count
   * — and on an agent bill that growth is routinely the largest single item.
   */

  const agent = (sessions, turns) =>
    Array.from({ length: sessions }, (_, s) =>
      Array.from({ length: turns }, (_, t) => ({
        model: 'claude-opus-5',
        label: 'agent',
        session: `conversation-${s}`,
        usage: { input_tokens: 600 + t * 400, output_tokens: 200 },
      })),
    ).flat();

  it('prices the growth, and calls it a ceiling rather than a saving', async () => {
    /**
     * 200 conversations of 12 turns: $33.60 of input against $7.20 if every turn
     * had cost what its own first turn did. So at most $26.40 of that bill is
     * conversation growth — 57.9% of it, and a figure no other part of this tool
     * could produce.
     */
    const result = run(await logOf(agent(200, 12)));
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    // "smallest"/"largest", never "opening"/"closing": the measurement is
    // order-independent now and the wording must not claim an order it cannot know.
    assert.match(out, /input ranges from 600 tokens on the smallest turn to 5,000 on the largest/);
    assert.match(out, /at most \$26\.40 of this bill is conversation growth/);
    assert.match(out, /ceiling and not a saving/, 'presented a bound as an opportunity');
  });

  it('never prints the session key', async () => {
    /**
     * The guarantee the whole feature rests on. A session key is somebody's
     * conversation and in a real log is often an account id or an email. Trazum
     * groups by it and counts turns; nothing it prints carries it.
     */
    const secret = 'user-4471-billing-dispute@example.com';
    const records = Array.from({ length: 8 }, (_, t) => ({
      model: 'claude-opus-5',
      label: 'agent',
      session: secret,
      usage: { input_tokens: 600 + t * 400, output_tokens: 200 },
    }));
    const path = await logOf(records);

    for (const extra of [[], ['--json']]) {
      const out = `${run(path, extra).stdout}${run(path, extra).stderr}`;
      assert.ok(!out.includes(secret), `the session key was printed${extra.length ? ' by --json' : ''}`);
      assert.ok(!out.includes('4471'), 'part of the session key was printed');
    }
  });

  it('says the field is missing rather than implying there is no growth', async () => {
    /**
     * Two different answers. A log with no session cannot be asked the question at
     * all, and silence there would read as a clean bill of health on the line most
     * likely to be the biggest.
     */
    const result = run(await logOf([call(), call(), call()]));
    const out = flat(result);
    assert.match(out, /No call in this log carried a session/);
    assert.match(out, /never prints it/, 'asked for a session without saying what happens to it');
  });

  it('stays quiet on a log whose conversations do not grow', async () => {
    // A stateless workload that happens to carry a session has no growth, and a
    // row for it would be noise on the report.
    const flatRecords = Array.from({ length: 50 }, (_, s) =>
      Array.from({ length: 10 }, () => ({
        model: 'claude-opus-5',
        label: 'batch',
        session: `c-${s}`,
        usage: { input_tokens: 600, output_tokens: 200 },
      })),
    ).flat();
    const out = flat(run(await logOf(flatRecords)));
    assert.doesNotMatch(out, /conversation growth/, 'invented growth on a flat workload');
    assert.doesNotMatch(out, /No call in this log carried a session/, 'claimed the field was missing');
  });
});

describe('a log with no labels at all', () => {
  it('says every lever describes a mixture', async () => {
    /**
     * Two workloads with no label between them merge into one row, and the section
     * then offers a single route for both. The session case already tells the
     * reader to add its field; this one named the row `unlabelled` and said
     * nothing, as though that were a workload.
     */
    const result = run(
      await logOf([
        ...Array.from({ length: 2000 }, () => call({ usage: { input_tokens: 180, output_tokens: 40 } })),
        ...Array.from({ length: 400 }, () => call({ usage: { input_tokens: 9000, output_tokens: 300 } })),
      ]),
    );
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /None of these calls carried a label/);
    assert.match(out, /Add "label" to the record/);
  });

  it('stays quiet when the log is labelled', async () => {
    const result = run(
      await logOf([
        ...Array.from({ length: 400 }, () => call({ label: 'rag', usage: { input_tokens: 9000, output_tokens: 300 } })),
        ...Array.from({ length: 400 }, () => call({ label: 'chat', usage: { input_tokens: 2400, output_tokens: 700 } })),
      ]),
    );
    assert.doesNotMatch(flat(result), /None of these calls carried a label/);
  });
});

describe('the recipe this tool tells you to record', () => {
  /**
   * The onboarding message and the README both hand the reader a snippet. If
   * following it produces a report that immediately asks for two more fields, the
   * snippet was wrong — and it was: the headline recipe carried `label` as
   * "optional" and no `session` at all, so a reader who copied it was told, on
   * their first run, that the two largest findings could not be made.
   *
   * This is the docs pinned against the tool. It fails if either drifts.
   */

  /** Exactly what the documented snippet produces, for a cached RAG workload. */
  const asDocumented = () =>
    Array.from({ length: 50 }, (_, s) =>
      Array.from({ length: 8 }, (_, t) => ({
        model: 'claude-opus-5',
        label: 'support-rag',
        session: `conversation-${s}`,
        usage: {
          input_tokens: 300 + t * 400,
          output_tokens: 250,
          ...(t === 0
            ? { cache_creation: { ephemeral_5m_input_tokens: 4000, ephemeral_1h_input_tokens: 0 } }
            : { cache_read_input_tokens: 4000 }),
        },
      })),
    ).flat();

  it('produces a report that asks for nothing more', async () => {
    const out = flat(run(await logOf(asDocumented())));

    for (const complaint of [
      /No call in this log carried a session/,
      /None of these calls carried a label/,
      /did not say which cache-write TTL was used/,
      /could not be read/,
    ]) {
      assert.doesNotMatch(out, complaint, `the documented recipe still triggers: ${complaint}`);
    }
  });

  it('names both fields when there is no log to read yet', async () => {
    /**
     * The no-argument message is the first thing a reader sees. It used to
     * describe a log with neither field — the exact log the report then complains
     * about twice.
     */
    const out = flat(run(null));
    assert.match(out, /"label"/, 'the onboarding message does not mention label');
    assert.match(out, /"session"/, 'the onboarding message does not mention session');
    assert.match(out, /never printed/, 'asked for a session key without saying what happens to it');
  });
});

describe('where the output spend concentrates', () => {
  /**
   * The actionable half of "output dominates". Two bills with identical output
   * spend want opposite responses — a tail has a cause worth a morning, a flat
   * distribution means the answer length is the task — and the total cannot tell
   * them apart.
   */

  it('names a tail as a tail, with the threshold and the shares', async () => {
    const records = [
      ...Array.from({ length: 1880 }, () => call({ usage: { input_tokens: 1200, output_tokens: 200 } })),
      ...Array.from({ length: 120 }, () => call({ usage: { input_tokens: 1200, output_tokens: 8000 } })),
    ];
    const out = flat(run(await logOf(records)));

    assert.match(out, /6\.0% of calls hold 71\.9% of the output spend/);
    assert.match(out, /answering with more than 8,000 tokens/);
    assert.match(out, /a tail has a cause/, 'a tail was not called a tail');
    assert.doesNotMatch(out, /no tail to hunt/);
  });

  it('says plainly when there is no tail to hunt', async () => {
    const records = Array.from({ length: 2000 }, () =>
      call({ label: 'summaries', usage: { input_tokens: 1200, output_tokens: 900 } }),
    );
    const out = flat(run(await logOf(records)));

    assert.match(out, /There is no tail to hunt/);
    assert.match(out, /cap max_tokens/);
    assert.doesNotMatch(out, /a tail has a cause/, 'a flat workload was sent tail-hunting');
  });
});

describe('--json carries everything the terminal says', () => {
  it('includes the levers, the cache verdict, the conversations and the shapes', async () => {
    /**
     * The levers were missing, and that made the flagship section terminal-only:
     * "What would actually move this bill" — the reason the command exists — was
     * invisible to any pipeline, dashboard or CI step reading the JSON. A finding
     * the machine-readable output omits is a finding the reader's tooling will
     * never surface.
     *
     * Asserted as presence-and-shape for each section the terminal renders, so
     * the next section added fails here until it is exported too.
     */
    const records = Array.from({ length: 400 }, (_, i) =>
      call({
        label: 'rag',
        session: `c${Math.floor(i / 8)}`,
        usage: { input_tokens: 600 + (i % 8) * 400, output_tokens: 300 },
      }),
    );
    const result = run(await logOf(records), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);

    assert.ok(Array.isArray(json.levers?.slices), 'the levers are not in the JSON');
    assert.ok(json.levers.slices.length > 0, 'the levers are empty on a log that has one');
    assert.equal(typeof json.levers.promptCeilingUsd, 'number');
    assert.equal(typeof json.cache?.verdict, 'string');
    assert.ok(Array.isArray(json.conversations));
    assert.ok(Array.isArray(json.outputShapes));
  });
});

#!/usr/bin/env node
/**
 * Measures whether a `safe` rule is safe, against a real model.
 *
 * ## The claim this exists to stop taking on trust
 *
 * `docs/authoring-rules.md` says it plainly: **"`safe` means 'this cannot
 * change what the prompt asks for'. Not 'unlikely to', not 'I could not think
 * of a case'. It is the level people run unattended in CI, so a false positive
 * there is a silently altered prompt in production."**
 *
 * That is the strongest promise this product makes and it was held by the
 * judgement of whoever wrote each rule. Nothing measured it. The token band was
 * in exactly that position for eight releases and turned out to be false, which
 * is the entry in `CHANGELOG.md` this repository quotes at itself; a promise
 * about *meaning* is harder to check than one about arithmetic, which is an
 * argument for measuring it, not for leaving it.
 *
 * ## How, without pretending a model is deterministic
 *
 * A model asked the same question twice does not answer the same way twice, so
 * "the answers differ" proves nothing on its own. The control is the model's
 * own variance, and the machinery already exists because `trazum evaluate`
 * settled this question for a user's own prompts:
 *
 * - the original prompt is answered `SAMPLES` times, and the mean pairwise
 *   `agreement` between those answers is the **noise floor** for this prompt;
 * - the rule is applied alone, the optimised prompt is answered `SAMPLES`
 *   times, and the mean agreement across the two sets is the **cross**;
 * - `verdictFor(self, cross)` returns `indistinguishable`, `within-noise`,
 *   `diverges`, or `inconclusive` when the model disagrees with itself so much
 *   that nothing can be concluded — which is a real answer and is recorded as
 *   one rather than rounded to a pass.
 *
 * Every rule is measured alone. A batch run answers "does the whole pipeline
 * change the meaning", which is a different and weaker question: it cannot say
 * *which* rule did it, and one rule's damage can hide inside another's.
 *
 * ## What it does not do
 *
 * It does not decide anything. `rule-safety.test.js` reads what this writes and
 * fails a `safe` rule recorded as `diverges`; the fixture is the evidence and
 * the test is the judgement, the same split as the token band. And a rule with
 * no measurement is named as unmeasured rather than counted as passing: a
 * corpus that grows without this being re-run must not look like a clean bill.
 *
 * It also proves nothing about a prompt unlike the corpus. Twelve samples, one
 * per rule, written to make that rule fire. That is a floor on the evidence and
 * it is stated in the fixture rather than left for a reader to assume away.
 *
 * ## Running it
 *
 *     ANTHROPIC_API_KEY=sk-... node scripts/measure-rule-safety.mjs
 *
 * This one costs money: it is real completions, not a counting endpoint. The
 * run is `RULES.length * SAMPLES * 2` calls with a small output cap, which is
 * cents at Haiku prices, and the model is chosen for that reason and recorded
 * in the fixture — a safety verdict measured on one model is a fact about that
 * model.
 */
import { writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RULES, agreement, fillPrompt, optimize, pooled, verdictFor } from '../packages/core/dist/index.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = join(repoRoot, 'packages/core/test/rules-corpus');
const RECORD = join(repoRoot, 'packages/core/test/fixtures/rule-safety.json');
const CASES = join(repoRoot, 'packages/core/test/fixtures/rule-safety-cases.json');

/**
 * Five per side, and the number is derived rather than picked.
 *
 * `verdictFor` calls a difference real when the cross figure falls more than
 * **0.05** below the noise floor. The cross figure is a share of `n * n` judged
 * pairs, so one flipped judgement moves it by `1 / n²`, and a measurement whose
 * smallest possible step is larger than its own margin has no resolution at
 * all: at three samples the step is 0.111, and a single dissenting vote out of
 * nine reads as *diverges*. The first run said exactly that about two rules.
 *
 * So `n² > 1 / 0.05`, which is `n >= 5`. Raise it with `TRAZUM_SAFETY_SAMPLES`
 * for a marginal rule; the fixture records what was used, because a verdict
 * from five samples and one from twenty are not the same evidence and must not
 * read as if they were.
 */
const SAMPLES = Number(process.env.TRAZUM_SAFETY_SAMPLES ?? 5);

/**
 * The cheapest capable model, and it is named in the fixture.
 *
 * A safety verdict is a fact about a model, not about the English language. The
 * one that matters most is the cheap one: a `safe` rule is what runs unattended
 * in CI, and the prompts people put through CI unattended are not usually
 * pointed at the frontier.
 */
const MODEL = process.env.TRAZUM_SAFETY_MODEL ?? 'claude-haiku-4-5';

const CHECKED_ON = process.env.TRAZUM_CHECKED_ON ?? new Date().toISOString().slice(0, 10);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set. Nothing measured, nothing written.');
  process.exit(1);
}

console.log(
  `\nThis costs money: ${RULES.length} rules x ${SAMPLES} samples x 2 sides = `
    + `${RULES.length * SAMPLES * 2} answers on ${MODEL}, plus `
    + `${RULES.length * (SAMPLES * (SAMPLES - 1) + SAMPLES * SAMPLES)} one-word judgements.\n`
    + 'Cents at this model\'s prices, and still yours. Said out loud because every\n'
    + 'other measuring script in this repository is free or nearly so.\n',
);

/**
 * One answer, retried on the provider's weather and on nothing else.
 *
 * Same rule as `measure-token-band.mjs`: 429 and 5xx are retried, a 400 or a
 * 401 is an answer. A run that dies forty calls in has spent the money and
 * bought nothing.
 */
const ask = async (prompt, maxTokens = 400) => {
  let wait = 2000;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        // One, and the first draft of this file said zero.
        //
        // Zero was written to "remove the variance nobody is interested in",
        // which sounds careful and destroys the measurement: at zero the model
        // answers the same prompt identically, so the noise floor comes out at
        // 1.000 and every rule on earth "diverges" against it. The first run
        // said so — `whitespace`, a rule that collapses blank lines, was
        // reported as changing the answer, and a rule that cannot be a true
        // positive failing is the guard telling you the guard is wrong.
        //
        // The floor has to be the model's own spread on the *same* question,
        // so the temperature has to be the one a reader would actually use.
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (response.ok) {
      const body = await response.json();
      return (body.content ?? []).map((part) => part.text ?? '').join('');
    }
    const text = await response.text();
    if (attempt >= 4 || !(response.status === 429 || response.status >= 500)) {
      throw new Error(`messages returned ${response.status}: ${text.slice(0, 200)}`);
    }
    console.error(`  retrying in ${wait / 1000}s: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait *= 2;
  }
};

/**
 * Whether two answers would satisfy the same reader, judged rather than counted.
 *
 * The second thing the first run got wrong. `agreement` is Jaccard over
 * normalised words, which `trazum evaluate` uses and which is right there: an
 * evaluation runs a *template* over cases, so the answers are short and
 * comparable. These corpus samples are bare instructions that produce four
 * hundred tokens of free prose, and two independent prose answers to one open
 * question share about 40% of their words whatever they say. The run showed it:
 * 9 of the 12 rules came back `inconclusive` because the model's own
 * self-agreement sat under the 0.5 floor, so the method could not judge the
 * thing it was built to judge.
 *
 * So the comparison is a judgement, and the model makes it. The judge sees two
 * answers as A and B with nothing saying which is which, because "is the
 * optimised one worse" is a leading question and this one must not be.
 *
 * Jaccard is still recorded beside it. Two numbers that usually agree and
 * sometimes do not is more informative than one, and dropping the cheap measure
 * because a better one arrived would throw away the evidence that the better
 * one is behaving.
 */
const judge = async (a, b) => {
  const answer = await ask(
    'Two answers were given to the same request. Decide whether they would '
      + 'satisfy the same reader: the same substantive content, the same '
      + 'conclusions, the same things done or refused. Ignore wording, order, '
      + 'length and formatting.\n\n'
      + `A:\n${a.slice(0, 4000)}\n\nB:\n${b.slice(0, 4000)}\n\n`
      + 'Reply with exactly one word: SAME or DIFFERENT.',
    16,
  );
  const word = answer.trim().toUpperCase();
  // Neither word is not a vote for either. A judge that answered something
  // else is a judgement that did not happen, and counting it as agreement
  // would be the flattering direction.
  return word.startsWith('SAME') ? 1 : word.startsWith('DIFFERENT') ? 0 : null;
};

/** The share of judged pairs called the same, or `null` when none was judged. */
const judgedShare = async (pairs) => {
  const votes = (await pooled(pairs.map(([a, b]) => () => judge(a, b)), 4)).filter(
    (vote) => vote !== null,
  );
  return votes.length === 0 ? null : votes.reduce((sum, v) => sum + v, 0) / votes.length;
};

/** Mean pairwise agreement inside one set of answers: the model against itself. */
const selfAgreement = (answers) => {
  const pairs = [];
  for (let i = 0; i < answers.length; i += 1) {
    for (let j = i + 1; j < answers.length; j += 1) pairs.push(agreement(answers[i], answers[j]));
  }
  return pairs.length === 0 ? 1 : pairs.reduce((sum, v) => sum + v, 0) / pairs.length;
};

/** Mean agreement across the two sets: the original against the optimised. */
const crossAgreement = (left, right) => {
  const pairs = [];
  for (const a of left) for (const b of right) pairs.push(agreement(a, b));
  return pairs.reduce((sum, v) => sum + v, 0) / pairs.length;
};

/** Every rule disabled except one, so the measurement names a single rule. */
const onlyRule = (id) => RULES.filter((rule) => rule.id !== id).map((rule) => rule.id);

const samples = new Map(
  readdirSync(corpusDir)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => [name.replace(/\.txt$/, ''), readFileSync(join(corpusDir, name), 'utf8')]),
);

/**
 * The case each sample is answered against, through the product's own
 * `fillPrompt`.
 *
 * Without one the corpus prompts ask the model to invent the thing it is being
 * asked about, and the first run showed the cost: the `whitespace` sample is a
 * scheduling assistant with no request to schedule, so the model proposed
 * different slots every time and agreed with itself on 1 pair in 6. Nothing can
 * be concluded from that about a rule that collapses blank lines.
 *
 * The corpus files are not edited to add one, because four other suites digest
 * them and a corpus rewritten to suit a new measurement is a corpus that
 * measures the measurement.
 */
const cases = JSON.parse(readFileSync(CASES, 'utf8')).cases;

const measured = [];
const unmeasured = [];

for (const rule of RULES) {
  const prompt = samples.get(rule.id);
  if (prompt === undefined) {
    // Named, not skipped. A rule with no sample is a rule nobody has evidence
    // about, and a report that omitted it would read as a clean bill.
    unmeasured.push({ id: rule.id, level: rule.level, because: `no ${rule.id}.txt in rules-corpus` });
    continue;
  }

  const input = cases[rule.id];
  if (input === undefined) {
    unmeasured.push({
      id: rule.id,
      level: rule.level,
      because: `no case for ${rule.id} in rule-safety-cases.json`,
    });
    continue;
  }

  const result = optimize(prompt, { level: 'aggressive', disableRules: onlyRule(rule.id) });
  const hits = result.rules.find((entry) => entry.id === rule.id)?.hits ?? 0;
  if (hits === 0 || result.optimized === prompt) {
    // The sample does not exercise the rule, so answering it twice would
    // measure the model's noise and call it a safety verdict.
    unmeasured.push({
      id: rule.id,
      level: rule.level,
      because: `the ${rule.id} sample does not make the rule fire`,
    });
    continue;
  }

  process.stdout.write(`  ${rule.id.padEnd(22)} ${rule.level.padEnd(11)} `);

  const originalPrompt = fillPrompt(prompt, input);
  const optimisedPrompt = fillPrompt(result.optimized, input);

  const [before, after] = await Promise.all([
    pooled(Array.from({ length: SAMPLES }, () => () => ask(originalPrompt)), 4),
    pooled(Array.from({ length: SAMPLES }, () => () => ask(optimisedPrompt)), 4),
  ]);

  const jaccardSelf = (selfAgreement(before) + selfAgreement(after)) / 2;
  const jaccardCross = crossAgreement(before, after);

  const within = (answers) => {
    const pairs = [];
    for (let i = 0; i < answers.length; i += 1) {
      for (let j = i + 1; j < answers.length; j += 1) pairs.push([answers[i], answers[j]]);
    }
    return pairs;
  };
  const across = [];
  for (const a of before) for (const b of after) across.push([a, b]);

  const [judgedSelf, judgedCross] = await Promise.all([
    judgedShare([...within(before), ...within(after)]),
    judgedShare(across),
  ]);

  // A judge that answered nothing usable cannot produce a verdict, and saying
  // so is the third outcome this product refuses to collapse into the other
  // two.
  const verdict =
    judgedSelf === null || judgedCross === null
      ? 'inconclusive'
      : verdictFor(judgedSelf, judgedCross);

  console.log(
    `self ${judgedSelf === null ? '  n/a' : judgedSelf.toFixed(3)}  `
      + `cross ${judgedCross === null ? '  n/a' : judgedCross.toFixed(3)}  ${verdict}`
      + `   (jaccard ${jaccardSelf.toFixed(2)}/${jaccardCross.toFixed(2)})`,
  );

  measured.push({
    id: rule.id,
    level: rule.level,
    hits,
    charsBefore: prompt.length,
    charsAfter: result.optimized.length,
    judgedSelfAgreement: judgedSelf === null ? null : Number(judgedSelf.toFixed(4)),
    judgedCrossAgreement: judgedCross === null ? null : Number(judgedCross.toFixed(4)),
    jaccardSelfAgreement: Number(jaccardSelf.toFixed(4)),
    jaccardCrossAgreement: Number(jaccardCross.toFixed(4)),
    verdict,
  });
}

await writeFile(
  RECORD,
  `${JSON.stringify(
    {
      checkedOn: CHECKED_ON,
      model: MODEL,
      samples: SAMPLES,
      note:
        'Written by scripts/measure-rule-safety.mjs. Each rule is applied alone to the '
        + 'rules-corpus sample written for it, and the verdict is relative to the model\'s '
        + 'own variance on the same prompt. A verdict is a fact about this model and this '
        + 'corpus, not about English.',
      measured,
      unmeasured,
    },
    null,
    2,
  )}\n`,
);

const diverged = measured.filter((entry) => entry.level === 'safe' && entry.verdict === 'diverges');
console.log(`\n${measured.length} rules measured, ${unmeasured.length} not.`);
console.log('Written to packages/core/test/fixtures/rule-safety.json');
if (unmeasured.length > 0) {
  console.log('\nNot measured, and that is not a pass:');
  for (const entry of unmeasured) console.log(`  ${entry.id.padEnd(22)} ${entry.because}`);
}
if (diverged.length > 0) {
  console.log(`\n${diverged.length} rule(s) marked safe changed the answer:`);
  for (const entry of diverged) {
    console.log(
      `  ${entry.id}: self ${entry.judgedSelfAgreement}, cross ${entry.judgedCrossAgreement}`,
    );
  }
  process.exit(1);
}

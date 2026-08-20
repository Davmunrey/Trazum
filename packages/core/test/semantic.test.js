import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  ALREADY_DETECTED_SIMILARITY,
  BUNDLED_CATALOGUE,
  SEMANTIC_SYSTEM_PROMPT,
  semanticPassCost,
  verifySemanticProposals,
} from '../dist/index.js';

/**
 * The layer that throws most of the model's findings away.
 *
 * A hallucinated finding is worse than a missed one: a missed finding costs
 * somebody nothing, and an invented one costs them an afternoon and the next
 * finding's credibility. Every test here is a way a fluent, wrong answer gets
 * caught before a reader sees it.
 */

const PROMPT = `You are a support assistant.

Always escalate a billing dispute to a human.

If the customer mentions a refund, hand the conversation to a person.

Never use more than three sentences.`;

const proposal = (over = {}) => ({
  kind: 'paraphrase-pair',
  spans: [
    'Always escalate a billing dispute to a human.',
    'If the customer mentions a refund, hand the conversation to a person.',
  ],
  because: 'Both say to hand billing questions to a human.',
  ...over,
});

const verify = (proposals, prompt = PROMPT) => verifySemanticProposals(prompt, proposals);

describe('the evidence is checked, ruthlessly', () => {
  it('accepts a pair whose spans are both in the prompt', () => {
    const result = verify([proposal()]);
    assert.equal(result.findings.length, 1);
    assert.equal(result.rejected.length, 0);
    // The offsets let a reader go and look, which is the point of quoting.
    assert.ok(result.findings[0].offsets[0] < result.findings[0].offsets[1]);
  });

  it('rejects a span the model paraphrased instead of copying', () => {
    /**
     * The strongest check available. A model reporting on a prompt while
     * paraphrasing what it quotes has stopped reading and started writing,
     * and everything else in that response is suspect.
     */
    const result = verify([
      proposal({ spans: ['Always escalate billing disputes to a human.', 'Never use more than three sentences.'] }),
    ]);
    assert.equal(result.findings.length, 0);
    assert.equal(result.rejected[0].reason, 'span-not-found');
  });

  it('rejects one span quoted twice', () => {
    // A "pair" that is one passage twice is not a finding about redundancy;
    // it is a finding about nothing.
    const span = 'Never use more than three sentences.';
    assert.equal(verify([proposal({ spans: [span, span] })]).rejected[0].reason, 'spans-identical');
  });

  it('rejects two spans that overlap in the prompt', () => {
    const result = verify([
      proposal({ spans: ['Always escalate a billing dispute', 'a billing dispute to a human.'] }),
    ]);
    assert.equal(result.rejected[0].reason, 'spans-overlap');
  });

  it('believes nothing the model says about size', () => {
    // The ceiling is counted here, from the spans, with the counter
    // everything else uses.
    const [finding] = verify([proposal({ tokensSaved: 9999 })]).findings;
    assert.ok(finding.ceilingTokens > 0 && finding.ceilingTokens < 30);
    assert.equal(finding.tokensSaved, undefined);
  });

  it('calls the figure a ceiling, and gives a contradiction none', () => {
    /**
     * Resolving a paraphrase pair means rewriting both into one, and how much
     * that recovers depends on what the merged version says. The ceiling — it
     * cannot save more than deleting the smaller half — is the honest figure.
     *
     * A contradiction saves nothing by being resolved. The point of finding
     * one is that the prompt is *wrong*, not that it is long, and attaching a
     * dollar figure would sell the wrong reason to fix it.
     */
    const contradiction = verify([
      proposal({
        kind: 'contradiction',
        spans: ['Always escalate a billing dispute to a human.', 'Never use more than three sentences.'],
      }),
    ]);
    assert.equal(contradiction.findings[0].ceilingTokens, 0);
  });
});

describe('it refuses to be paid for what is already free', () => {
  it('rejects a pair the near-copy detector already reports', () => {
    /**
     * A model paid to re-report a deterministic finding is a model being paid
     * for nothing — and the reader sees the same thing twice with two
     * different confidences attached to it.
     */
    const prompt = 'Be concise and clear and brief.\n\nBe concise and clear and brief!';
    const result = verifySemanticProposals(prompt, [
      proposal({ spans: ['Be concise and clear and brief.', 'Be concise and clear and brief!'] }),
    ]);
    assert.equal(result.findings.length, 0);
    assert.equal(result.rejected[0].reason, 'already-detected');
  });

  it('rejects a near-copy mislabelled as a contradiction', () => {
    /**
     * Two spans that say the same thing cannot contradict each other. A model
     * that labels a near-copy a contradiction has mislabelled it, which makes
     * every other label in the same response worth less.
     */
    const prompt = 'Answer in Spanish always please.\n\nAnswer in Spanish always, please.';
    const result = verifySemanticProposals(prompt, [
      proposal({
        kind: 'contradiction',
        spans: ['Answer in Spanish always please.', 'Answer in Spanish always, please.'],
      }),
    ]);
    assert.equal(result.rejected[0].reason, 'contradiction-of-a-copy');
  });

  it('uses the threshold the rules engine actually uses, read off its source', () => {
    /**
     * This started at 0.8 with a comment claiming it matched the
     * deterministic pass. It did not — `rules.ts` drops a duplicate example at
     * 0.92 — and the error ran the dangerous way: every pair between 0.8 and
     * 0.92 is one the rules engine does **not** catch, and this layer was
     * throwing them away while asserting the opposite.
     */
    assert.equal(ALREADY_DETECTED_SIMILARITY, 0.92);
    const rules = readFileSync(new URL('../src/rules.ts', import.meta.url), 'utf8');
    const used = rules.match(/jaccard\(prev, normalized\) >= ([0-9.]+)/);
    assert.ok(used, 'the duplicate-example threshold could not be found in rules.ts');
    assert.equal(
      Number(used[1]),
      ALREADY_DETECTED_SIMILARITY,
      'the semantic pass and the rules engine disagree about what counts as a near-copy',
    );
  });
});

describe('one finding per piece of the prompt', () => {
  it('rejects a second finding covering ground an accepted one covers', () => {
    const first = proposal();
    const second = proposal({
      spans: ['Always escalate a billing dispute to a human.', 'Never use more than three sentences.'],
      because: 'Something else.',
    });
    const result = verify([first, second]);
    assert.equal(result.findings.length, 1);
    assert.equal(result.rejected[0].reason, 'duplicate');
  });

  it('does not let a rejected finding block a good one on the same paragraph', () => {
    // Overlap is checked against what was accepted, not against everything
    // proposed.
    const bad = proposal({ spans: ['Not in the prompt at all.', 'Never use more than three sentences.'] });
    const good = proposal();
    const result = verify([bad, good]);
    assert.equal(result.findings.length, 1);
    assert.equal(result.rejected[0].reason, 'span-not-found');
  });

  it('ranks by ceiling and caps the list', () => {
    const result = verifySemanticProposals(PROMPT, [proposal()], { max: 0 });
    assert.equal(result.findings.length, 0);
  });
});

describe('what the pass costs, before it runs', () => {
  it('prices the call it is about to make, and says it is an estimate', () => {
    // A tool that spends somebody's money to tell them how to spend less must
    // be the first thing audited by its own arithmetic.
    const opus = BUNDLED_CATALOGUE.byId.get('claude-opus-5');
    const cost = semanticPassCost(PROMPT, {
      inputPerMTok: opus.inputPerMTok,
      outputPerMTok: opus.outputPerMTok,
    });
    assert.equal(cost.provenance, 'estimated');
    assert.ok(cost.usd > 0);
    // The system prompt is part of what gets sent, so it is part of the price.
    assert.ok(cost.inputTokens > 100);
  });

  it('counts the system prompt, because the caller pays for it', () => {
    const rates = { inputPerMTok: 1, outputPerMTok: 1 };
    const withPrompt = semanticPassCost(PROMPT, rates).inputTokens;
    const empty = semanticPassCost('', rates).inputTokens;
    assert.ok(empty > 0, 'an empty prompt still sends the instructions');
    assert.ok(withPrompt > empty);
  });
});

describe('the instructions tell the model what will get it rejected', () => {
  it('demands character-for-character quotes', () => {
    assert.match(SEMANTIC_SYSTEM_PROMPT, /character for character/);
  });

  it('tells it not to report what the deterministic pass already finds', () => {
    assert.match(SEMANTIC_SYSTEM_PROMPT, /already found without you/);
  });

  it('asks for certainty over coverage', () => {
    assert.match(SEMANTIC_SYSTEM_PROMPT, /a few certain findings to many possible ones/);
  });
});

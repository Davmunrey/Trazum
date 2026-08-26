import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { CONFIG_KEYS, COST_MULTIPLIERS, ESTIMATE_ERROR_BAND_PCT } from '../dist/index.js';
// The sub-key lists are internal to the schema and stay that way: exporting
// them so a test could import them would widen the public surface to suit the
// test, which is the tail wagging the dog. An in-package test may reach in.
import {
  CONFIG_LADDER_KEYS,
  CONFIG_OUTCOME_KEYS,
  CONFIG_SPEND_KEYS,
} from '../dist/config-schema.js';

/**
 * The agent-facing skill, against the code it describes to an agent.
 *
 * `.claude/skills/trazum/SKILL.md` is what an agent reads before answering a
 * question about this tool, so a gap in it is not a documentation gap — it is a
 * wrong answer given to somebody who asked. Its config section listed **nine**
 * keys. The schema knows **seventeen**.
 *
 * The eight missing were `labels`, `spend`, `sources`, `store`, `waive`,
 * `outcomes`, `ladders` and `owners` — which is to say the entire budget
 * surface, the fleet, the waiver record, and the vocabulary the whole 1.51 arc
 * rests on. An agent asked *"can Trazum tell me whether the cheaper model made
 * things worse?"* would have read this list, not found `outcomes`, and said no.
 *
 * The section's command coverage is deliberately narrower than the CLI's — the
 * skill is scoped to optimising and budgeting a prompt — so an absent *command*
 * is not drift and is not asserted here. A key list that claims to be the key
 * list is a different thing.
 */

const skill = readFileSync(
  new URL('../../../.claude/skills/trazum/SKILL.md', import.meta.url),
  'utf8',
);

/** Named as inline code, which is how the file writes every key. */
const names = (key) => new RegExp('`' + key + '`').test(skill);

describe('the trazum skill describes the configuration it tells agents about', () => {
  it('names every top-level config key', () => {
    const missing = CONFIG_KEYS.filter((key) => !names(key));
    assert.deepEqual(
      missing,
      [],
      `the schema accepts these and SKILL.md does not name them: ${missing.join(', ')}`,
    );
  });

  it('names the sub-keys of the ones an agent has to fill in', () => {
    /**
     * Bounded to three: `spend`, `outcomes` and `ladders` are the keys whose
     * *shape* an agent must produce rather than merely mention. The rest are a
     * scalar or a path, and listing their internals here would make this test
     * a copy of the schema rather than a check on the prose.
     */
    const missing = [
      ...CONFIG_SPEND_KEYS.map((k) => ['spend', k]),
      ...CONFIG_OUTCOME_KEYS.map((k) => ['outcomes', k]),
      ...CONFIG_LADDER_KEYS.map((k) => ['ladders', k]),
    ].filter(([, key]) => !names(key));

    assert.deepEqual(
      missing.map(([parent, key]) => `${parent}.${key}`),
      [],
      'SKILL.md names these keys nowhere, so an agent cannot write the object',
    );
  });

  it('quotes the cache multipliers the pricing module actually uses', () => {
    // The skill tells an agent to report a cache loss "plainly rather than
    // softening it", and quotes the premium as its evidence. A stale multiplier
    // there is a wrong number in an agent's answer about money.
    assert.match(
      skill,
      new RegExp(`${COST_MULTIPLIERS.cacheWrite5m}x plain input`),
      `SKILL.md no longer quotes the 5-minute cache write premium as ${COST_MULTIPLIERS.cacheWrite5m}x`,
    );
    // Matched without markup: the first draft required `**2x**` because that is
    // how packages/cli/README.md writes it, and failed a sentence in this file
    // that says `2x` plainly and is entirely correct. The number is the claim;
    // the bold is a house style that differs per file.
    assert.match(
      skill,
      new RegExp(`${COST_MULTIPLIERS.cacheWrite1h}x at the one-hour TTL`),
      `SKILL.md no longer quotes the one-hour cache write premium as ${COST_MULTIPLIERS.cacheWrite1h}x`,
    );
  });

  it('quotes the published error band', () => {
    assert.match(
      skill,
      new RegExp(`±${ESTIMATE_ERROR_BAND_PCT}%`),
      `SKILL.md no longer quotes the published band as ±${ESTIMATE_ERROR_BAND_PCT}%`,
    );
  });
});

describe('the description an agent selects on', () => {
  /**
   * The front matter `description` is the most-read string in this project and
   * the least examined. A client shows it when deciding whether to load the
   * skill at all, so it is selection copy, not documentation, and it was
   * written as documentation.
   *
   * The old one opened on "Optimise a prompt to cost fewer tokens", and every
   * trigger after it was a sentence somebody types. An agent mid-task never
   * types that sentence to itself, so nothing here was reachable except on
   * request. The rewrite leads with the one moment that arrives inside the
   * agent's own loop, and names where the ceiling comes from, because a
   * trigger an agent cannot satisfy is not a trigger.
   *
   * Both halves are pinned. Losing the second is the quieter failure: the
   * string still reads well, still invites the call, and still leaves the
   * agent with no way to produce the number it needs.
   */
  const description = (() => {
    const match = /^description:\s*(.+)$/m.exec(skill);
    assert.ok(match, 'the skill has no description in its front matter');
    return match[1].trim();
  })();

  it('names the moment an agent reaches for this without being asked', () => {
    assert.match(
      description,
      /before spending|before making/i,
      'every trigger in the description is now a sentence somebody types, so nothing here '
        + 'fires inside an agent\'s own loop',
    );
  });

  it('says where the ceiling comes from, so the trigger can be acted on', () => {
    assert.match(
      description,
      /trazum\.config\.json/,
      'the description invites a budget check without naming the file the budget lives in, '
        + 'which leaves an agent inventing a number or skipping the call',
    );
  });
});


import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { sectionOf } from '../../../test-utils/section.mjs';

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


/**
 * The skill is read by agents that cannot check it.
 *
 * Every other document in this repository is read by somebody who can run the
 * command and find out. This one is loaded into a model's context and acted on
 * — often by an agent with no way to verify a claim before repeating it to a
 * user — so a command that does not exist, or an MCP tool that was renamed,
 * becomes a confident wrong answer rather than a 404.
 *
 * It had one already: three converters were described as *named as next but
 * not built* for the whole of the arc after they shipped, so an agent asked
 * about a LiteLLM export offered to add a converter that had been there for
 * releases.
 *
 * Both lists below are derived. A skill naming a command or a tool is naming
 * something the code has to have.
 */
describe('everything the skill tells an agent to call', () => {
  const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const cli = source('packages/cli/src/index.ts');
  const mcpTools = source('packages/mcp/src/tools.ts');

  /** The commands the CLI dispatches, from the same list the roadmap guard reads. */
  const dispatched = (() => {
    const start = cli.indexOf('const COMMAND_FLAGS');
    const block = cli.slice(start, cli.indexOf('\n};', start));
    return new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1]));
  })();

  /** The tools the MCP server actually registers. */
  const tools = new Set([...mcpTools.matchAll(/^ {2}name: '(\w+)',$/gm)].map((m) => m[1]));

  it('parsed both lists out of the source at all', () => {
    /* The guard on the guard: a renamed constant turns both checks below into
       checks of nothing, and they pass. */
    assert.ok(dispatched.size >= 40, `only ${dispatched.size} commands parsed`);
    assert.ok(tools.size >= 5, `only ${tools.size} MCP tools parsed`);
  });

  it('names only commands the CLI dispatches', () => {
    /*
      Every `trazum <word>`, wherever it appears: a fenced block, a table cell,
      a sentence telling an agent what to run. Anchoring to the start of a line
      found eight of the fourteen, and the six it missed were in the table that
      exists to be copied from.
    */
    const named = new Set([...skill.matchAll(/\btrazum ([a-z][a-z-]+)/g)].map((m) => m[1]));
    assert.ok(named.size >= 10, `only ${named.size} commands found in the skill`);
    const unknown = [...named].filter((command) => !dispatched.has(command));
    assert.deepEqual(
      unknown,
      [],
      `the skill tells an agent to run commands this CLI does not have: ${unknown.join(', ')}`,
    );
  });

  it('names exactly the MCP tools the server registers', () => {
    /*
      Read out of the table under `## Through MCP` rather than by scanning the
      file for snake_case, which the first version did and which flagged
      `ANTHROPIC_API_KEY` and `pull_request_target` as missing tools. That was
      an exclusion list two lines after a comment about how this repository
      keeps paying for exclusion lists.

      Both directions. A tool the skill names and the server does not register
      is an agent calling into nothing; a tool the server registers and the
      skill never names is one an agent with no shell will never call, which
      for that agent is the same as it not existing.
    */
    /* Bounded by the next heading, whatever it is, rather than by naming the
       section that happens to follow — `publish.test.js` fails a test that
       does the latter, and this one did until it ran. */
    const section = sectionOf(skill, '## Through MCP');
    const named = new Set(
      [...section.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]),
    );
    assert.deepEqual(
      [...named].sort(),
      [...tools].sort(),
      'the skill\'s tool table and the server disagree about which tools exist',
    );
  });

  it('offers every converter the CLI has, so none is described as unbuilt', () => {
    /*
      The defect this describes, pinned from the other side. A converter that
      exists and is missing from the skill is one an agent will not offer —
      and the sentence it offers instead was "not built yet".
    */
    const converters = [...dispatched].filter((command) => command.startsWith('from-'));
    assert.ok(converters.length >= 4, `only ${converters.length} converters found`);
    const missing = converters.filter((command) => !skill.includes(command));
    assert.deepEqual(
      missing,
      [],
      `these converters exist and the skill never mentions them: ${missing.join(', ')}`,
    );
  });
});

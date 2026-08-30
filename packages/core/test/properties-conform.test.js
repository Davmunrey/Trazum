import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTRACT_NAMES,
  CONTRACT_SCHEMAS,
  conform,
  contractSchema,
  requiredFieldsOf,
} from '../dist/index.js';
import { CASES, Draw, replayWith } from './support/random.mjs';

/**
 * Rule 5 of the doctrine, held over documents nobody wrote.
 *
 * > *Refuse rather than guess, and a refusal names what is missing.*
 *
 * `conform` is where that rule is load-bearing rather than aspirational: it is
 * the door a third party's emitter knocks on to find out whether what it
 * produces will be read, and the only thing it can hand back is a refusal. A
 * refusal with nothing after it — a bare `false`, an "invalid document" — is
 * indistinguishable from a bug in the checker, and whoever receives it starts
 * guessing, which is the failure this repository spends its whole design budget
 * avoiding.
 *
 * So these do not check that `conform` says no to the right documents. They
 * check that **every no it says carries the sentence that makes it actionable**,
 * for every input at all, and that the two hand-written lists behind it —
 * the contract names and their schemas — have not drifted apart.
 *
 * Doctrine: [An example only contains what somebody thought of](../../../docs/doctrine.md#an-example-only-contains-what-somebody-thought-of)
 */

const draw = new Draw();
const KINDS = new Set(['missing', 'wrong-type', 'absence-as-zero', 'unreadable']);
const OPTIONAL = ['label', 'timestamp', 'session', 'stop_reason'];

/** A record with every optional field stripped, so a plant can add one back. */
function bare() {
  const record = draw.usageRecord();
  for (const field of OPTIONAL) delete record[field];
  delete record.usage.cache_read_input_tokens;
  delete record.usage.cache_creation_input_tokens;
  return record;
}

const asLog = (records) => records.map((record) => JSON.stringify(record)).join('\n');

describe('the conformance check, on anything at all', () => {
  it('never throws, whatever it is handed and whatever contract it is forced to', () => {
    for (let n = 0; n < CASES; n += 1) {
      const text = draw.chance(0.4)
        ? draw.usageLog()
        : String(JSON.stringify(draw.anything()));
      const options = draw.chance(0.5) ? { contract: draw.pick([...CONTRACT_NAMES]) } : {};
      assert.doesNotThrow(
        () => conform(text, options),
        `${replayWith('conform')} — threw on ${JSON.stringify(text).slice(0, 100)}`,
      );
    }
  });

  it('never refuses without saying what it could not find', () => {
    /**
     * The rule itself. Three shapes a refusal can take here, and all three have
     * to arrive with their reason attached:
     *
     * - nothing matched at all, and `because` has to be a sentence;
     * - something matched and did not conform, and every problem has to name a
     *   place and a detail;
     * - a `kind` outside the four declared ones would be a refusal nobody
     *   downstream can branch on, which is the same failure wearing a type.
     */
    for (let n = 0; n < CASES; n += 1) {
      const text = draw.chance(0.5) ? draw.usageLog() : String(JSON.stringify(draw.anything()));
      const options = draw.chance(0.5) ? { contract: draw.pick([...CONTRACT_NAMES]) } : {};
      const report = conform(text, options);
      const where = `${replayWith('conform')} — on ${JSON.stringify(text).slice(0, 80)}`;

      if (report.contract === null) {
        assert.equal(typeof report.because, 'string', `${where}: refused with no reason`);
        assert.ok(report.because.trim().length > 3, `${where}: refused with "${report.because}"`);
        assert.equal(report.conforms, false, `${where}: conformed to no contract`);
      } else {
        assert.equal(report.because, null, `${where}: named a contract and a reason both`);
        assert.equal(
          report.conforms,
          report.problems.length === 0,
          `${where}: conforms says ${report.conforms} with ${report.problems.length} problems`,
        );
      }

      for (const problem of report.problems) {
        assert.ok(KINDS.has(problem.kind), `${where}: unknown problem kind ${problem.kind}`);
        assert.ok(problem.at.trim().length > 0, `${where}: a problem with no place`);
        assert.ok(problem.detail.trim().length > 5, `${where}: a problem with no detail`);
      }
      for (const entry of report.unavailable) {
        assert.ok(entry.finding.trim().length > 0, `${where}: an unavailable finding with no name`);
        assert.ok(entry.because.trim().length > 0, `${where}: unavailable with no reason`);
        assert.ok(entry.unlockedBy.trim().length > 0, `${where}: unavailable with no remedy`);
      }
    }
  });

  it('names a missing field rather than repairing it', () => {
    /*
      The plant. `model` is the one field a usage record cannot do without —
      tokens with no model are tokens with no price — so removing it must
      produce a refusal that says "model", at the line it was removed from, and
      must never produce a report that quietly priced the line anyway.
    */
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 6, () => bare());
      const at = draw.int(0, records.length - 1);

      const whole = conform(asLog(records), { contract: 'usage-log' });
      assert.equal(
        whole.problems.length,
        0,
        `${replayWith('conform')} — a well-formed log was refused: ${JSON.stringify(whole.problems)}`,
      );

      const broken = records.map((record, index) => {
        if (index !== at) return record;
        const { model, ...rest } = record;
        return rest;
      });
      const report = conform(asLog(broken), { contract: 'usage-log' });
      assert.equal(report.conforms, false, `${replayWith('conform')} — a log with no model conformed`);
      const named = report.problems.filter(
        (problem) => problem.at === `line ${at + 1}` && problem.detail.includes('model'),
      );
      assert.equal(
        named.length,
        1,
        `${replayWith('conform')} — removing model at line ${at + 1} produced `
          + `${JSON.stringify(report.problems)}`,
      );
      assert.equal(named[0].kind, 'missing', `${replayWith('conform')} — a missing field reported as ${named[0].kind}`);
    }
  });

  it('says which finding a field buys, and stops saying it once the field arrives', () => {
    /**
     * The other half of rule 5, and the half a checker usually gets wrong: a
     * document can be perfectly valid and still unable to answer most of the
     * questions this product asks. An emitter that only hears "valid" ships
     * something Trazum reads while half the findings silently never appear.
     *
     * Metamorphic rather than restated: the expected list is not recomputed
     * from the rule, it is **observed to change in exactly one place** when one
     * field is added to one record. A checker that hard-coded its unavailable
     * list, or that dropped an entry for the wrong field, fails here.
     */
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 5, () => bare());
      const field = draw.pick(OPTIONAL);

      const without = conform(asLog(records), { contract: 'usage-log' });
      const mentioned = without.unavailable.filter((entry) => entry.because.includes(`"${field}"`));
      assert.equal(
        mentioned.length,
        1,
        `${replayWith('conform')} — no record carries ${field} and ${mentioned.length} findings said so`,
      );

      const at = draw.int(0, records.length - 1);
      const withIt = conform(
        asLog(records.map((record, index) => (index === at ? { ...record, [field]: 'x' } : record))),
        { contract: 'usage-log' },
      );
      assert.equal(
        withIt.unavailable.some((entry) => entry.because.includes(`"${field}"`)),
        false,
        `${replayWith('conform')} — ${field} arrived and its finding stayed unavailable`,
      );
      assert.deepEqual(
        withIt.unavailable.map((entry) => entry.finding).sort(),
        without.unavailable
          .filter((entry) => !entry.because.includes(`"${field}"`))
          .map((entry) => entry.finding)
          .sort(),
        `${replayWith('conform')} — adding ${field} moved a finding it has nothing to do with`,
      );
    }
  });

  it('is not troubled by a field it has never heard of', () => {
    /*
      Documented promise: these documents gain fields without a version bump, so
      a checker that rejected tomorrow's field is a checker nobody upgrades. Held
      against keys drawn hostile, `__proto__` among them.
    */
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 5, () => bare());
      const plain = conform(asLog(records), { contract: 'usage-log' });
      const key = draw.pick(['tomorrow', '__proto__', 'trace_id', 'x', 'usage_v2', 'constructor']);
      const decorated = conform(
        asLog(records.map((record) => ({ ...record, [key]: draw.anything() }))),
        { contract: 'usage-log' },
      );
      assert.deepEqual(
        decorated.problems,
        plain.problems,
        `${replayWith('conform')} — adding "${key}" made the document non-conforming`,
      );
    }
  });
});

describe('the contract list and the schemas published for it', () => {
  it('are one list rather than two that agree by inspection', () => {
    /**
     * The defect this repository keeps meeting: a hand-written list nothing
     * binds to the thing it describes. The CLI's copy of these names stopped at
     * `cost-answer` and two contracts became unnameable; `CONTRACT_NAMES` is the
     * fix, and this is the guard that the schemas beside it did not drift the
     * same way.
     *
     * Both directions, because a name with no schema and a schema with no name
     * are different bugs and only one of them is loud.
     */
    assert.ok(CONTRACT_NAMES.length > 0, 'there are no contracts');
    for (const name of CONTRACT_NAMES) {
      const schema = contractSchema(name);
      assert.ok(schema, `${name} is named and has no schema`);
      assert.equal(schema.$schema !== undefined, true, `${name}'s schema declares no dialect`);
      assert.equal(typeof schema.$id, 'string', `${name}'s schema has no id`);
      assert.equal(typeof schema.title, 'string', `${name}'s schema has no title`);

      const required = requiredFieldsOf(name);
      assert.ok(Array.isArray(required), `${name} has no required fields list`);
      for (const field of schema.required ?? []) {
        assert.ok(
          required.some((path) => path === field || path.startsWith(`${field}.`)),
          `${name}'s schema requires "${field}" and its conformance rules do not`,
        );
      }
    }
    for (const name of Object.keys(CONTRACT_SCHEMAS)) {
      assert.ok(
        CONTRACT_NAMES.includes(name),
        `a schema is published for "${name}", which is not a contract anybody can name`,
      );
    }
  });

  it('answers for every contract it names, on a document that is not one', () => {
    /*
      Forcing a contract onto the wrong document is what an emitter under test
      actually does — it knows what it meant to produce. Every name has to
      survive that and come back with something readable, rather than one of
      them throwing because it was added after the dispatch was written.
    */
    for (const name of CONTRACT_NAMES) {
      for (const text of ['{}', '[]', 'null', '{"schemaVersion":1}', 'not json at all', '   ']) {
        const report = conform(text, { contract: name });
        assert.equal(report.schemaVersion, 1, `${name} on ${text} returned no version`);
        if (report.contract === null) {
          assert.ok(
            typeof report.because === 'string' && report.because.length > 3,
            `${name} on ${text} refused with ${JSON.stringify(report.because)}`,
          );
        }
      }
    }
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  PROFILE_CSV_MODEL_DAY_COLUMNS,
  profileToCsv,
  profileUsage,
  receiptFrom,
} from '../dist/index.js';
import { CASES, Draw, SECRETS, replayWith } from './support/random.mjs';

/**
 * Rule 6 of the doctrine, as a property over everything rather than a plant on
 * one fixture.
 *
 * > *Prompt text, file paths, branch names and credentials never cross a
 * > converter, a report or a log.*
 *
 * `receipt-redaction.test.js` plants four strings into one hand-built log and
 * searches the serialised receipt for each. That is the right guard and it has
 * the shape every example has: it checks the fields somebody thought of. This
 * plants credentials, absolute paths, branch names and addresses into **every
 * field a record can carry**, including fields nobody declared, over thousands
 * of logs, and searches every artifact this package can produce.
 *
 * The promise is not that these are redacted. It is that they are **absent**:
 * a usage record has nowhere to put them, so nothing downstream can carry them.
 * A property is the honest way to check a claim of that shape, because a
 * fixture can only ever demonstrate it on the fields it happens to set.
 *
 * Doctrine: [An example only contains what somebody thought of](../../../docs/doctrine.md#an-example-only-contains-what-somebody-thought-of)
 */

const draw = new Draw();
const ON = new Date('2026-08-20T00:00:00Z');

/** A record with secrets in every place a record could be made to hold one. */
function poisoned() {
  const secret = () => draw.pick(SECRETS);
  return {
    model: draw.chance(0.5) ? 'gpt-5' : secret(),
    label: draw.chance(0.5) ? 'checkout' : secret(),
    usage: {
      input_tokens: draw.int(1, 100000),
      output_tokens: draw.int(1, 10000),
      /* A field nobody declared, which is how content actually arrives. */
      ...(draw.chance(0.5) ? { note: secret() } : {}),
    },
    /* Every plausible extra key a real logger writes beside the usage. */
    ...(draw.chance(0.7) ? { session: secret() } : {}),
    ...(draw.chance(0.7) ? { prompt: secret() } : {}),
    ...(draw.chance(0.7) ? { messages: [{ role: 'user', content: secret() }] } : {}),
    ...(draw.chance(0.5) ? { file: secret() } : {}),
    ...(draw.chance(0.5) ? { branch: secret() } : {}),
    ...(draw.chance(0.5) ? { authorization: `Bearer ${secret()}` } : {}),
    ...(draw.chance(0.4) ? { [secret()]: secret() } : {}),
  };
}

/**
 * The secrets planted **outside** the two fields a record is allowed to carry
 * through, computed over a whole batch rather than one record at a time.
 *
 * `model` and `label` travel by design: a model id is the whole point of a
 * receipt, and a label is the customer's own attribution, which
 * `docs/commands.md` says out loud is the one thing no guard can check —
 * *"a label named after a prompt's text travels"*. Searching for a secret this
 * package was told to carry would be testing the wrong promise.
 *
 * The per-record version of this function was wrong, and the suite failed on
 * correct code the first time it ran. A string drawn as one record's `session`
 * and as another's `model` is planted in the first sense and carried in the
 * second, and a report folds every record together: the `unpriced` gap names
 * the models it could not price, which is exactly where the second record's
 * model id turned up. **A batch is the unit that produces one report, so a
 * batch is the unit the carried set has to be taken over.**
 */
function plantedIn(records) {
  const carried = new Set(records.flatMap((record) => [record.model, record.label]));
  const found = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const secret of SECRETS) {
        if (value.includes(secret) && !carried.has(value)) found.add(secret);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        walk(key);
        walk(entry);
      }
    }
  };
  for (const record of records) {
    const { model, label, ...rest } = record;
    walk(rest);
  }
  /* A secret carried in this batch is carried, wherever else it was planted. */
  return [...found].filter((secret) => !carried.has(secret));
}

const profile = (records) =>
  profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

describe('nothing a record was not asked for reaches an artifact', () => {
  it('is absent from a receipt, whatever the log carried', () => {
    let planted = 0;
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 5, () => poisoned());
      const secrets = new Set(plantedIn(records));
      if (secrets.size === 0) continue;
      planted += secrets.size;

      const serialised = JSON.stringify(receiptFrom(profile(records), BUNDLED_CATALOGUE, { emittedAt: ON }));
      for (const secret of secrets) {
        assert.equal(
          serialised.includes(secret),
          false,
          `${replayWith('redaction')} — ${JSON.stringify(secret)} reached the receipt`,
        );
      }
    }
    assert.ok(planted > 0, `${replayWith('redaction')} — nothing was planted; this guard inspected nothing`);
  });

  it('is absent from every shape of the CSV', () => {
    /*
      Three tables out of one report: the slice grain a decision is made at, and
      the two time series a spreadsheet charts. A converter is exactly where a
      field gets added "just for debugging", so all three are searched.
    */
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 5, () => poisoned());
      const secrets = new Set(plantedIn(records));
      if (secrets.size === 0) continue;

      const report = profile(records);
      for (const shape of ['slice', 'day', 'hour']) {
        const csv = profileToCsv(report, { unlabelled: '(unlabelled)', shape });
        for (const secret of secrets) {
          assert.equal(
            csv.includes(secret),
            false,
            `${replayWith('redaction')} — ${JSON.stringify(secret)} reached the ${shape} CSV`,
          );
        }
      }
    }
  });

  it('is absent from the profile the converters are built from', () => {
    /**
     * The property underneath the two above, and the reason they can hold at
     * all: `receiptFrom` takes a `UsageProfileReport` and nothing else, so if
     * the report cannot hold content then no consumer of it can emit any. This
     * asserts the narrowing rather than trusting it — the same argument the
     * receipt makes about its own input, made one level down.
     */
    for (let n = 0; n < CASES; n += 1) {
      const records = draw.list(1, 5, () => poisoned());
      const secrets = new Set(plantedIn(records));
      if (secrets.size === 0) continue;

      const serialised = JSON.stringify(profile(records));
      for (const secret of secrets) {
        assert.equal(
          serialised.includes(secret),
          false,
          `${replayWith('redaction')} — ${JSON.stringify(secret)} survived into the profile itself`,
        );
      }
    }
  });

  it('and the CSV still has the columns it says it has', () => {
    /*
      A converter that emitted nothing would pass every assertion above.
      Cheap insurance that these properties are inspecting a document rather
      than an empty string.
    */
    const csv = profileToCsv(profile([poisoned(), poisoned()]), {
      unlabelled: '(unlabelled)',
      shape: 'slice',
    });
    assert.ok(csv.split('\n').length > 1, `${replayWith('redaction')} — the CSV has no rows`);
    assert.ok(
      PROFILE_CSV_MODEL_DAY_COLUMNS.length > 0,
      `${replayWith('redaction')} — the published column list is empty`,
    );
  });
});

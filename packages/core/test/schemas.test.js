import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTRACT_NAMES, CONTRACT_SCHEMAS, conform, contractSchema, requiredFieldsOf } from '../dist/index.js';

/**
 * The schemas and `conform` are two doors to one contract, and two doors to
 * the same value agreeing by coincidence is the defect the 1.62 arc named.
 * So nothing here is a coincidence: the required lists are compared to the
 * single source `conform` runs, every schema-shaped minimum must round-trip
 * through both doors, and gutting any required field must fail both.
 *
 * The validator below is deliberately tiny — the top-level subset these
 * schemas use (`type`, `required`, `const`) — because the promise is that an
 * *off-the-shelf* validator works, and the zero-dependency rule means this
 * repository proves that with its own thirty lines rather than shipping one.
 * It is handed a planted defect before anything trusts it.
 */

/** Enough JSON Schema to check these schemas' own keywords, no more. */
function validates(schema, value) {
  if ('const' in schema) return value === schema.const;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const typeOf = (v) =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? 'number' : typeof v;
  if (schema.type !== undefined && !types.includes(typeOf(value))) return false;
  if (typeOf(value) === 'object' && schema.properties !== undefined) {
    for (const field of schema.required ?? []) {
      if (!(field in value)) return false;
    }
    for (const [field, sub] of Object.entries(schema.properties)) {
      if (field in value && !validates(sub, value[field])) return false;
    }
  }
  return true;
}

/**
 * A minimal document built from the schema's own required properties.
 *
 * One override: `conform` holds the cost answer's verdict to today's union
 * while the schema deliberately leaves it a string — the format's own rule
 * is that unions are open by construction, and a schema that rejected a new
 * verdict value would break every consumer the release it appeared. The
 * fixture therefore uses a real value; the looseness is the schema's policy,
 * not its drift.
 */
function minimumOf(name) {
  const schema = contractSchema(name);
  const sample = (sub) => {
    if ('const' in sub) return sub.const;
    const type = Array.isArray(sub.type) ? sub.type[0] : sub.type;
    return { object: {}, array: [], number: 1, string: 'x', boolean: false, null: null }[type];
  };
  const doc = {};
  for (const field of schema.required) doc[field] = sample(schema.properties[field]);
  if (name === 'cost-answer') doc.verdict = 'within';
  // The outcome report's strongest promise is relational — a rate and its
  // refusal are mutually exclusive — and a schema over field types cannot
  // carry it. The fixture satisfies it; carrying it *is* what conform is for.
  if (name === 'outcome-report') {
    doc.successShareOfRecordedUsd = null;
    doc.noRate = 'nothing-recorded';
  }
  return doc;
}

describe('the schemas agree with conform, by construction', () => {
  it('covers every contract, and nothing else', () => {
    assert.deepEqual(Object.keys(CONTRACT_SCHEMAS).sort(), CONTRACT_NAMES.slice().sort());
  });

  it('requires exactly the fields conform requires, per contract', () => {
    for (const name of CONTRACT_NAMES) {
      const fromConform =
        name === 'usage-log'
          ? requiredFieldsOf(name)
          : ['schemaVersion', ...requiredFieldsOf(name)];
      assert.deepEqual(
        contractSchema(name).required.slice().sort(),
        fromConform.sort(),
        `${name}: the schema and conform require different fields`,
      );
    }
  });

  it('accepts through both doors, and gutting any field fails both', () => {
    for (const name of CONTRACT_NAMES) {
      if (name === 'usage-log') continue; // conform reads a log as lines, below
      const schema = contractSchema(name);
      const whole = minimumOf(name);
      assert.equal(validates(schema, whole), true, `${name}: the minimum fails its own schema`);
      const conformed = conform(JSON.stringify(whole), { contract: name });
      assert.equal(conformed.conforms, true, `${name}: the minimum fails conform`);

      for (const field of schema.required) {
        if (field === 'schemaVersion') continue;
        const gutted = { ...whole };
        delete gutted[field];
        assert.equal(validates(schema, gutted), false, `${name} without ${field} passes the schema`);
        assert.equal(
          conform(JSON.stringify(gutted), { contract: name }).conforms,
          false,
          `${name} without ${field} passes conform`,
        );
      }
    }
  });

  it('holds the usage-log record schema against the line parser', () => {
    const schema = contractSchema('usage-log');
    const record = { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 } };
    assert.equal(validates(schema, record), true);
    assert.equal(conform(JSON.stringify(record)).conforms, true);
    const { model, ...withoutModel } = record;
    assert.equal(model, 'claude-opus-5');
    assert.equal(validates(schema, withoutModel), false, 'a record with no model passes the schema');
  });

  it('and the tiny validator can see its own failures', () => {
    // Planted defects, one per keyword it claims to check.
    assert.equal(validates({ type: 'object', required: ['a'], properties: { a: { type: 'number' } } }, {}), false);
    assert.equal(
      validates({ type: 'object', properties: { a: { type: 'number' } } }, { a: 'not-a-number' }),
      false,
    );
    assert.equal(validates({ const: 1 }, 2), false);
    assert.equal(validates({ type: ['object', 'null'] }, null), true);
    assert.equal(validates({ type: 'array' }, {}), false);
  });
});

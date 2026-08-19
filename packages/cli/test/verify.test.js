import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum verify` — the plan held to the log that came after it.
 * Three outcomes and never two, and the gate that makes promises checkable.
 */

const line = (record) => JSON.stringify(record);

const oldLog = () => {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(line({ model: 'claude-opus-5', label: 'support', ts: `2026-07-0${i + 1}T09:00:00Z`, usage: { input_tokens: 400_000, output_tokens: 1_000 } }));
  }
  for (const [sess, minute] of [['s1', 0], ['s2', 10]]) {
    const at = (m) => `2026-07-05T10:${String(m).padStart(2, '0')}:00Z`;
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute), stop_reason: 'max_tokens', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute + 1), stop_reason: 'end_turn', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
  }
  return rows.join('\n') + '\n';
};

/** support moved to the cheaper model; digest still burns retries; rag never existed. */
const newLog = () => {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push(line({ model: 'claude-sonnet-5', label: 'support', session: `n${i}`, ts: `2026-08-0${i + 1}T09:00:00Z`, usage: { input_tokens: 400_000, output_tokens: 1_200 } }));
  }
  for (const [sess, minute] of [['t1', 0], ['t2', 10]]) {
    const at = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute), stop_reason: 'max_tokens', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
    rows.push(line({ model: 'claude-opus-5', label: 'digest', session: sess, ts: at(minute + 1), stop_reason: 'end_turn', usage: { input_tokens: 200_000, output_tokens: 40_000 } }));
  }
  return rows.join('\n') + '\n';
};

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-verify-'));
  await writeFile(join(dir, 'old.jsonl'), oldLog());
  await writeFile(join(dir, 'new.jsonl'), newLog());
  const planned = spawnSync(
    process.execPath,
    [CLI, 'plan', join(dir, 'old.jsonl'), '-o', join(dir, 'plan.json')],
    { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
  );
  assert.equal(planned.status, 0, planned.stderr);
  return dir;
};

const run = (args) =>
  spawnSync(process.execPath, [CLI, 'verify', ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('verify', () => {
  it('renders three outcomes, never two, with the world named beside the verdicts', async () => {
    const dir = await setup();
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Did it work\? \d+ actions from the plan of \d{4}-\d{2}-\d{2}/);
    // The route arrived, and the movement of the world travels with it.
    assert.match(out, /Route and batch support .* — ARRIVED/);
    assert.match(out, /dearest model is now claude-sonnet-5/);
    assert.match(out, /calls 3 → 6/);
    // The retry bill persists, priced.
    assert.match(out, /Fix the truncation retries on digest .* — DID NOT ARRIVE/);
    assert.match(out, /still shows \$8\.00 of truncation waste/);
    // The batch half is named as unobservable, never counted as arrived.
    assert.match(out, /tokens do not say which tier billed them|batch half of this action cannot be seen/);
  });

  it('gates on broken promises: exit 1 with the count named', async () => {
    const dir = await setup();
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl'), '--gate']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /GATE FAILED — \d+ of \d+ actions/);
  });

  it('emits the verification as data, prices-changed flag included', async () => {
    const dir = await setup();
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl'), '--json']);
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(result.stdout);
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.arrived + doc.notArrived + doc.cannotTell, doc.actions.length);
    assert.equal(typeof doc.pricesChanged, 'boolean');
    assert.ok(doc.planCreatedAt !== undefined);
    const route = doc.actions.find((a) => a.action.label === 'support');
    assert.equal(route.outcome, 'arrived');
    assert.equal(route.attribution.calls.before, 3);
  });

  it('writes the verdicts as Markdown for a CI summary', async () => {
    const dir = await setup();
    const md = join(dir, 'verify.md');
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl'), '--markdown-out', md]);
    assert.equal(result.status, 0, result.stderr);
    const body = await readFile(md, 'utf8');
    assert.match(body, /^## Did it work\?/m);
    assert.match(body, /### Route and batch support .* — ARRIVED/);
  });

  it('speaks Spanish', async () => {
    const dir = await setup();
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl'), '--locale', 'es']);
    assert.match(flat(result), /¿Funcionó\? \d+ acciones del plan/);
    assert.match(flat(result), /NO LLEGÓ/);
  });

  it('is a contract: the doc and the document promise each other every top-level field', async () => {
    const doc = await readFile(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    const section = doc.slice(doc.indexOf('## The verification document'));
    const promised = new Set(
      [...section.matchAll(/^\| `([a-zA-Z]+)(?:\[\])?`/gm)].map((m) => m[1]),
    );
    const dir = await setup();
    const result = run([join(dir, 'plan.json'), '--against', join(dir, 'new.jsonl'), '--json']);
    const emitted = Object.keys(JSON.parse(result.stdout));
    assert.deepEqual(
      emitted.filter((k) => !promised.has(k)),
      [],
      'fields emitted with no line in docs/json-output.md',
    );
    assert.deepEqual(
      [...promised].filter((k) => !emitted.includes(k)),
      [],
      'fields promised by docs/json-output.md and not emitted',
    );
  });

  it('refuses a missing plan, a missing --against, and a file that is not a plan', async () => {
    const bare = run([]);
    assert.equal(bare.status, 1);
    assert.match(flat(bare), /trazum verify plan\.json --against/);

    const dir = await setup();
    const noAgainst = run([join(dir, 'plan.json')]);
    assert.equal(noAgainst.status, 1);
    assert.match(flat(noAgainst), /--against .* is required|--against .* es obligatorio/);

    await writeFile(join(dir, 'not-a-plan.json'), '{"hello": 1}');
    const bad = run([join(dir, 'not-a-plan.json'), '--against', join(dir, 'new.jsonl')]);
    assert.equal(bad.status, 1);
    assert.match(flat(bad), /not a plan document|no es un documento de plan/);
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum from-otel`, run rather than read: OTLP GenAI spans become usage-log
 * records on stdout (or `-o`), the honest summary lands on stderr, nothing
 * private crosses, and the output feeds `profile`.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });

const SECRET = 'otel-prompt-do-not-leak-11ff';

const otlp = () =>
  JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'support-bot' } }] },
        scopeSpans: [
          {
            spans: [
              {
                name: 'chat',
                startTimeUnixNano: '1787600000000000000',
                attributes: [
                  { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
                  { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
                  { key: 'gen_ai.prompt', value: { stringValue: SECRET } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '1200' } },
                  { key: 'gen_ai.usage.output_tokens', value: { intValue: '300' } },
                ],
              },
              { name: 'db.query', startTimeUnixNano: '1', attributes: [{ key: 'db.system', value: { stringValue: 'pg' } }] },
            ],
          },
        ],
      },
    ],
  });

describe('from-otel, run', () => {
  it('refuses with the invocation when no path is given', () => {
    const out = run(['from-otel']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /trazum from-otel/);
  });

  it('names a path that does not exist', () => {
    const out = run(['from-otel', '/no/such/otlp.json']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /not found/);
  });

  it('converts LLM spans, skips non-LLM, and the records feed profile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-otel-'));
    const file = join(dir, 'spans.json');
    await writeFile(file, otlp());
    const log = join(dir, 'usage.jsonl');
    const converted = run(['from-otel', file, '-o', log]);
    assert.equal(converted.status, 0, converted.stderr);
    assert.match(converted.stderr, /1 file\(s\), 1 LLM span\(s\) priced/);
    assert.match(converted.stderr, /1 non-LLM span\(s\) skipped/);
    // The honest gap: OTel has no TTL split, said out loud.
    assert.match(converted.stderr, /no cache data/);
    const records = (await readFile(log, 'utf8')).trim().split('\n');
    assert.equal(records.length, 1);
    const profiled = run(['profile', log]);
    assert.equal(profiled.status, 0, profiled.stderr);
    assert.match(profiled.stdout, /1 call/);
  });

  it('lets nothing private cross — grepped, not trusted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-otel-'));
    const file = join(dir, 'spans.json');
    await writeFile(file, otlp());
    const out = run(['from-otel', file]);
    for (const planted of [SECRET, 'gen_ai.prompt', 'db.system']) {
      assert.ok(!out.stdout.includes(planted), `${planted} crossed into the log`);
    }
    // The label came from the span's operation name, which is not private.
    assert.match(out.stdout, /"label":"chat"/);
  });
});

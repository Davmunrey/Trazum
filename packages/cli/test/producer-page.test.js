import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { CONTRACT_NAMES, contractSchema, requiredFieldsOf } from '../../core/dist/index.js';

/**
 * The producer's section of `docs/format.md`, held by running it.
 *
 * The page shows a connector author the minimum to emit, as fenced JSON
 * blocks labelled with the contract they claim to satisfy. A copied example
 * is the first document a new producer ever emits, so an example that has
 * drifted from the contract is worse than no example: it fails somewhere
 * else, later, in their build. Here every labelled block is piped through
 * `trazum conform` — the product, not a re-implementation — and then gutted
 * of a required field and required to fail, because an example harness that
 * cannot reject anything proves nothing about what it accepts.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const FORMAT = join(ROOT, 'docs/format.md');
const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/** Every fenced block labelled `json <contract>` — the examples the page tells a producer to copy. */
const examples = (page) =>
  [...page.matchAll(/^```json ([a-z-]+)\n([\s\S]*?)\n```/gm)].map((match) => ({
    contract: match[1],
    body: match[2],
  }));

const conform = (body, contract) =>
  spawnSync(process.execPath, [CLI, 'conform', '-', '--contract', contract], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    input: body,
  });

describe('the producer examples in docs/format.md', () => {
  it('labels every example with a contract `--contract` accepts, and shows both producer contracts', async () => {
    const found = examples(await readFile(FORMAT, 'utf8'));
    assert.notEqual(found.length, 0, 'the producer section carries no labelled example');
    for (const { contract } of found) {
      assert.ok(
        CONTRACT_NAMES.includes(contract),
        `an example labelled ${contract}, which --contract does not accept`,
      );
    }
    const labels = found.map((example) => example.contract);
    // The two contracts the page says exist to be written by other tools.
    for (const producer of ['usage-log', 'outcome-report']) {
      assert.ok(labels.includes(producer), `no example for ${producer}, the page's own producer contract`);
    }
  });

  it('conforms every example, by running the product on it', async () => {
    for (const { contract, body } of examples(await readFile(FORMAT, 'utf8'))) {
      const result = conform(body, contract);
      assert.equal(result.status, 0, `${contract} example does not conform:\n${result.stderr}${result.stdout}`);
    }
  });

  it('fails every example once a required field is gutted, so the harness is not vacuous', async () => {
    for (const { contract, body } of examples(await readFile(FORMAT, 'utf8'))) {
      const parsed = JSON.parse(body);
      const [first] = requiredFieldsOf(contract);
      delete parsed[first];
      const result = conform(`${JSON.stringify(parsed)}\n`, contract);
      assert.equal(result.status, 1, `${contract} example still conforms without required "${first}"`);
    }
  });

  it('quotes the schema $id the library actually authors', async () => {
    /**
     * The page prints one `$id` in prose as the shape of all of them. A URI
     * quoted by hand drifts the day the authored one changes, so the quoted
     * string is compared to the schema itself — and it is an identifier,
     * never fetched: nothing here resolves it, matching the decision recorded
     * in trusted-hosts.test.js.
     */
    const page = await readFile(FORMAT, 'utf8');
    const quoted = [...page.matchAll(/`(https:\/\/github\.com\/Davmunrey\/Trazum\/schema\/([a-z-]+)\/v\d+\.json)`/g)];
    assert.notEqual(quoted.length, 0, 'the page no longer quotes any schema $id');
    for (const [, uri, name] of quoted) {
      assert.equal(uri, contractSchema(name).$id, `the page quotes a $id the ${name} schema does not carry`);
    }
  });

  it('reads the fence labels this page actually uses', () => {
    /**
     * The harvest decides what every check above sees, so handed a page
     * written for the purpose it has to find the labelled fences and leave
     * the plain ones alone — otherwise "every example conforms" is a
     * sentence about whatever the regex happened to match.
     */
    const made = [
      'Prose.',
      '',
      '```json usage-log',
      '{"model": "m"}',
      '```',
      '',
      '```json',
      '{"not": "labelled"}',
      '```',
      '',
      '```bash',
      'trazum schema usage-log',
      '```',
      '',
    ].join('\n');
    assert.deepEqual(examples(made), [{ contract: 'usage-log', body: '{"model": "m"}' }]);
  });
});

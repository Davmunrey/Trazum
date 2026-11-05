import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as core from '../dist/index.js';
import {
  DELIBERATELY_UNPRICED,
  PAGES,
  compare,
  dollars,
  markdownTables,
  plainName,
  readAnthropic,
  readOpenAi,
  render,
} from '../../../scripts/price-drift.mjs';

/**
 * `scripts/price-drift.mjs`: the catalogue against the providers' own pages.
 *
 * The pages here are written for the test, in the shape Anthropic's and
 * OpenAI's Markdown pricing pages had on 2026-11-05, with the figures the
 * catalogue holds. A planted figure has to come back as drift, a model the
 * catalogue lacks as missing, and a page whose tables moved as unread: the
 * last is the one that matters most, because a check that reads nothing and
 * passes is worse than no check.
 */

const NOW = new Date('2026-11-05T12:00:00Z');

const anthropicPage = ({ opus41Output = '$75 / MTok', withFast = true, withBatch = true } = {}) => `
# Pricing

## Model pricing

| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| ----- | ----------------- | --------------- | --------------- | ------------------------ | ------------- |
| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok<sup>2</sup> | $20 / MTok |
| Claude Opus 4.1 ([retired, except on Bedrock](https://platform.claude.com/docs/en/about-claude/model-deprecations)) | $15 / MTok | $18.75 / MTok | $30 / MTok | $1.50 / MTok | ${opus41Output} |
| Claude Sonnet 5 | $2 / MTok<sup>3</sup> | $2.50 / MTok | $4 / MTok | $0.20 / MTok | $10 / MTok |
| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |
| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |
| Claude Nimbus 9 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.10 / MTok | $5 / MTok |
${withFast ? `
### Fast mode pricing

| Model                           | Input          | Output         |
| ------------------------------- | -------------- | -------------- |
| Claude Opus 5.5                 | $8 USD / MTok  | $40 USD / MTok |
| Claude Opus 5 / Claude Opus 4.8 | $10 USD / MTok | $50 USD / MTok |
` : ''}${withBatch ? `
### Batch processing

| Model | Batch input | Batch output |
| ----- | ----------- | ------------ |
| Claude Opus 5.5 | $2 / MTok | $10 / MTok |
| Claude Opus 4.1 ([retired](https://example.com)) | $7.50 / MTok | $37.50 / MTok |
| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.05 / MTok | $0.25 / MTok |
| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.25 / MTok | $1.25 / MTok |
` : ''}`;

const openAiPage = ({ astraLongOutput = '$75.00', gpt4oCached = '$1.25' } = {}) => `
# Pricing

Flagship models

### Standard pricing data

| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | $10.00 | $50.00 | $1.00 | $12.50 | $25.00 | $20.00 | ${astraLongOutput} | $2.00 | $25.00 | $50.00 |
| gpt-5.5-pro (<272K context length) | $30.00 | $180.00 | - | - | - | $60.00 | $270.00 | - | - | - |

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-4o | $2.50 | $10.00 | ${gpt4oCached} |
| gpt-9-nova | $3.00 | $9.00 | $0.30 |

#### Batch

| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | $5.00 | $25.00 | $0.50 | - | - | $10.00 | $37.50 | $1.00 | - | - |

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-4o | $1.25 | $5.00 | $0.625 |

#### Flex

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-4o | $99.00 | $99.00 | $99.00 |

Cyber models

### Standard pricing data

| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.5-cyber | $12.50 | $75.00 | $1.25 | - | - | - | - | - | - | - |
`;

const kinds = (findings, kind) => findings.filter((finding) => finding.kind === kind);
const anthropicFindings = (markdown) => compare('anthropic', readAnthropic(markdown), core, NOW).findings;
const openAiFindings = (markdown) => compare('openai', readOpenAi(markdown), core, NOW).findings;

describe('reading a Markdown pricing table', () => {
  it('finds each table with the heading above it, and stops at the first line that is not a row', () => {
    const tables = markdownTables('## A\n\n| x | y |\n| - | - |\n| 1 | 2 |\n\ntext\n\n### B\n| p |\n| --- |\n| q |\n');
    assert.equal(tables.length, 1, 'a one-dash separator is not a table');
    const both = markdownTables('## A\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n\n### B\n| p |\n| --- |\n| q |\n');
    assert.deepEqual(both.map((table) => [table.heading, table.header, table.rows]), [
      ['A', ['x', 'y'], [['1', '2']]],
      ['B', ['p'], [['q']]],
    ]);
  });

  it('reads a price the way a person does, footnotes and units aside', () => {
    assert.equal(dollars('$0.20 / MTok<sup>2</sup>'), 0.2);
    assert.equal(dollars('$8 USD / MTok'), 8);
    assert.equal(dollars('$15.625'), 15.625);
    assert.equal(dollars('$1,250.00'), 1250);
    assert.equal(dollars('-'), undefined);
    assert.equal(plainName('Claude Opus 4.1 ([retired, except on Bedrock](https://x.test/a))'), 'Claude Opus 4.1 (retired, except on Bedrock)');
    assert.equal(plainName('Claude Sonnet 5<sup>3</sup>'), 'Claude Sonnet 5');
  });
});

describe('Anthropic', () => {
  it('finds nothing to report where the page and the catalogue agree', () => {
    const findings = anthropicFindings(anthropicPage());
    assert.deepEqual(kinds(findings, 'drift'), []);
    assert.deepEqual(kinds(findings, 'unread'), []);
  });

  it('reads both Haiku 5.5 bands and the fast rates shared by two models', () => {
    const page = readAnthropic(anthropicPage());
    const haiku = page.rows.filter((row) => row.name === 'Claude Haiku 5.5');
    assert.deepEqual(haiku.map((row) => [row.band, row.rates.input, row.rates.hit, row.rates.batchOutput]), [
      ['base', 0.1, 0.01, 0.25],
      ['long', 0.5, 0.05, 1.25],
    ]);
    const fast = page.rows.filter((row) => row.band === 'fast').map((row) => [row.name, row.rates.input, row.rates.output]);
    assert.deepEqual(fast, [['Claude Opus 5.5', 8, 40], ['Claude Opus 5', 10, 50], ['Claude Opus 4.8', 10, 50]]);
  });

  it('reports a changed price as drift, naming the model, the field and both figures', () => {
    const drift = kinds(anthropicFindings(anthropicPage({ opus41Output: '$80 / MTok' })), 'drift');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].model, 'claude-opus-4-1-20250805');
    assert.match(drift[0].detail, /^output: the page says \$80, the catalogue prices \$75$/);
  });

  it('reports a model the catalogue does not price as missing', () => {
    const missing = kinds(anthropicFindings(anthropicPage()), 'missing');
    assert.deepEqual(missing.map((finding) => finding.model), ['Claude Nimbus 9']);
    assert.match(missing[0].detail, /reads as unpriced/);
  });

  it('notes a catalogue model the page no longer lists, without failing on it', () => {
    const notes = kinds(anthropicFindings(anthropicPage()), 'note').map((finding) => finding.model);
    assert.ok(notes.includes('claude-haiku-4-5'), 'an unlisted model was not noted');
    assert.ok(!notes.includes('claude-opus-5-5'), 'a listed model was noted as unlisted');
  });

  it('says it read nothing when a table it compares is gone, rather than passing', () => {
    const unread = kinds(anthropicFindings(anthropicPage({ withFast: false, withBatch: false })), 'unread');
    assert.equal(unread.length, 2);
    assert.match(unread.map((finding) => finding.detail).join('\n'), /batch table/);
    assert.match(unread.map((finding) => finding.detail).join('\n'), /fast-mode table/);
    assert.equal(kinds(anthropicFindings('# Pricing\n\nNothing here.\n'), 'unread').length, 3);
  });
});

describe('OpenAI', () => {
  it('compares the short band, the long band, the cache and batch, and ignores Flex', () => {
    const findings = openAiFindings(openAiPage());
    assert.deepEqual(kinds(findings, 'drift'), [], 'the page agrees with the catalogue and Flex is not standard pricing');
    assert.deepEqual(kinds(findings, 'unread'), []);
  });

  it('reports drift in a long-context rate and in a cached-input rate', () => {
    const drift = kinds(openAiFindings(openAiPage({ astraLongOutput: '$80.00', gpt4oCached: '$1.20' })), 'drift');
    assert.deepEqual(drift.map((finding) => [finding.model, finding.detail.split(':')[0]]), [
      ['gpt-6-astra', 'long-context output'],
      ['gpt-4o', 'cache hit'],
    ]);
  });

  it('reads the id before a note in the model cell', () => {
    assert.ok(readOpenAi(openAiPage()).rows.some((row) => row.name === 'gpt-5.5-pro'));
  });

  it('reads every family\'s standard table, and holds a deliberate omission as a note with its reason', () => {
    const findings = openAiFindings(openAiPage());
    assert.deepEqual(kinds(findings, 'missing').map((finding) => finding.model), ['gpt-9-nova']);
    const cyber = findings.find((finding) => finding.model === 'gpt-5.5-cyber');
    assert.equal(cyber?.kind, 'note');
    assert.match(cyber.detail, /left unpriced on purpose: Daybreak/);
  });

  it('says it read nothing when there is no standard or batch table', () => {
    assert.equal(kinds(openAiFindings('# Pricing\n'), 'unread').length, 2);
  });
});

describe('the deliberate omissions', () => {
  it('each carries a reason and is genuinely not priced, so a stale entry cannot hide a row', () => {
    for (const [provider, entries] of Object.entries(DELIBERATELY_UNPRICED)) {
      assert.ok(provider in PAGES, `${provider} has no page this script reads`);
      for (const [id, reason] of Object.entries(entries)) {
        assert.ok(reason.length > 20, `${id} has no real reason`);
        assert.equal(core.BUNDLED_CATALOGUE.byId.get(id), undefined, `${id} is priced now; remove it from DELIBERATELY_UNPRICED`);
      }
    }
  });
});

describe('the report and the script', () => {
  it('puts what fails first and names the providers it does not check', () => {
    const lines = render([
      { provider: 'openai', kind: 'note', model: 'a', detail: 'n' },
      { provider: 'openai', kind: 'drift', model: 'b', detail: 'd' },
      { provider: 'anthropic', kind: 'unread', detail: 'u' },
      { provider: 'anthropic', kind: 'missing', model: 'c', detail: 'm' },
    ], { anthropic: 20, openai: 28 });
    assert.deepEqual(lines.slice(0, 4).map((line) => line.split(/\s+/)[0]), ['UNREAD', 'MISSING', 'DRIFT', 'note']);
    assert.ok(lines.some((line) => line.includes('google') && line.includes('re-read by a person')));
  });

  it('never writes a price, and does nothing on import', () => {
    const source = readFileSync(new URL('../../../scripts/price-drift.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /writeFile/, 'the script writes files; a price is changed by a person');
    assert.match(source, /if \(invokedDirectly\) await main/);
  });

  it('runs weekly in CI, failing only on the schedule', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    assert.match(workflow, /node scripts\/price-drift\.mjs --report/);
    assert.match(workflow, /"\$EVENT" = "schedule" \]; then node scripts\/price-drift\.mjs;/);
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as core from '../dist/index.js';
import {
  DELIBERATELY_UNPRICED,
  PAGES,
  LIFECYCLE_PAGES,
  compare,
  compareLifecycle,
  claudeGeneration,
  dollars,
  markdownTables,
  plainName,
  readAnthropic,
  readAnthropicLifecycle,
  readOpenAi,
  readOpenAiModelPage,
  readWebSearch,
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

const anthropicPage = ({
  opus41Output = '$75 / MTok', withFast = true, withBatch = true, residency = '1.1x', residencySince = '4.6', withResidency = true,
  webSearch = '$10', withWebSearch = true,
} = {}) => `
# Pricing
${withResidency ? `
For Claude ${residencySince} and later models, using \`inference_geo: "us"\` applies a ${residency} pricing multiplier. \`inference_geo: "global"\` (default) uses standard pricing.
` : ''}${withWebSearch ? `
Web search is available on the Claude API for **${webSearch} USD per 1,000 searches**, plus standard token costs for search-generated content.
` : ''}
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

const openAiPage = ({ astraLongOutput = '$75.00', gpt4oCached = '$1.25', codexInput = '$1.75', astraFlexInput = '$5.00' } = {}) => `
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

| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-astra | ${astraFlexInput} | $25.00 | $0.50 | $6.25 | $12.50 | $10.00 | $37.50 | $1.00 | $12.50 | $25.00 |

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5.4-mini | $0.375 | $2.25 | $0.0375 |

### Fast pricing data

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-4o | $4.25 | $17.00 | $2.125 |

### Ultrafast pricing data

| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6.1-sol | $12.00 | $60.00 | $0.60 | $15.00 | $30.00 | $24.00 | $90.00 | $1.20 | $30.00 | $60.00 |

Specialized models

Standard

### Grouped Pricing Table data

| Category | Model | Input | Output | Cached input |
| --- | --- | --- | --- | --- |
| ChatGPT | chat-latest | $5.00 | $30.00 | $0.50 |
| Codex | gpt-5.3-codex | ${codexInput} | $14.00 | $0.175 |
| Embedding | text-embedding-3-small | $0.02 | - | - |
| Moderation | omni-moderation-latest | Free | - | - |

Fast

### Grouped Pricing Table data

| Category | Model | Input | Output | Cached input |
| --- | --- | --- | --- | --- |
| Codex | gpt-5.3-codex | $3.50 | $28.00 | $0.35 |

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
    assert.equal(kinds(anthropicFindings('# Pricing\n\nNothing here.\n'), 'unread').length, 5);
  });

  it('reads the data residency sentence, and finds the catalogue agrees with it', () => {
    const page = readAnthropic(anthropicPage());
    assert.deepEqual(page.residency, { since: 406, sinceName: '4.6', multiplier: 1.1 });
    assert.deepEqual(kinds(anthropicFindings(anthropicPage()), 'drift'), []);
    assert.equal(claudeGeneration('claude-opus-4-6'), 406);
    assert.equal(claudeGeneration('claude-fable-5-1'), 501);
    assert.equal(claudeGeneration('claude-opus-4-20250514'), 400);
    assert.equal(claudeGeneration('claude-opus-4-1-20250805'), 401);
    assert.equal(claudeGeneration('claude-3-5-haiku-20241022'), 305);
    assert.equal(claudeGeneration('gpt-6'), null);
  });

  it('reports a changed multiplier, or a moved line, as drift on every row it touches', () => {
    const raised = kinds(anthropicFindings(anthropicPage({ residency: '1.2x' })), 'drift');
    assert.ok(raised.length >= 13, `only ${raised.length} rows reported`);
    assert.ok(raised.every((finding) => /the page bills Claude 4\.6 and later at 1\.2x, the catalogue has 1\.1x/.test(finding.detail)));
    const earlier = kinds(anthropicFindings(anthropicPage({ residencySince: '4.5' })), 'drift');
    assert.deepEqual(earlier.map((finding) => finding.model), ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5']);
    assert.match(earlier[0].detail, /the catalogue has no multiplier/);
    const later = kinds(anthropicFindings(anthropicPage({ residencySince: '5.0' })), 'drift').map((finding) => finding.model);
    assert.deepEqual(later.sort(), ['claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-4-6']);
  });

  it('reads the web search fee, and finds every Claude row carries it', () => {
    assert.equal(readAnthropic(anthropicPage()).webSearch, 10);
    assert.equal(readWebSearch('Web search is available on the Claude API for **$10 USD per 1,000 searches**.'), 10);
    assert.deepEqual(kinds(anthropicFindings(anthropicPage()), 'drift'), []);
  });

  it('reports a changed web search fee as drift on every Claude row', () => {
    const raised = kinds(anthropicFindings(anthropicPage({ webSearch: '$12' })), 'drift');
    const claude = core.MODELS.filter((model) => model.provider === 'anthropic').length;
    assert.equal(raised.length, claude);
    assert.ok(raised.every((finding) => /^web search: the page bills \$12 per 1,000 searches, the catalogue has \$10$/.test(finding.detail)));
  });

  it('says it read nothing when the web search sentence is gone or contradicts itself', () => {
    const gone = kinds(anthropicFindings(anthropicPage({ withWebSearch: false })), 'unread');
    assert.deepEqual(gone.map((finding) => finding.detail), [
      'the web search price ("Web search is available on the Claude API for $N USD per 1,000 searches") is not on the page',
    ]);
    const twice = anthropicPage() + '\nWeb search is available on the Claude API for $15 USD per 1,000 searches.\n';
    assert.match(kinds(anthropicFindings(twice), 'unread')[0].detail, /web search price more than one way: \$10, \$15 per 1,000/);
  });

  it('says it read nothing when the residency sentence is gone or contradicts itself', () => {
    const gone = kinds(anthropicFindings(anthropicPage({ withResidency: false })), 'unread');
    assert.deepEqual(gone.map((finding) => finding.detail), ['the data residency sentence ("For Claude N and later models ... a N.Nx multiplier") is not on the page']);
    const twice = anthropicPage() + '\nFor Claude 4.6 and later models, specifying US-only inference incurs a 1.2x multiplier on all token pricing categories.\n';
    assert.match(kinds(anthropicFindings(twice), 'unread')[0].detail, /more than one way: 1\.1x from Claude 4\.6, 1\.2x from Claude 4\.6/);
  });
});

describe('OpenAI', () => {
  it('compares the short band, the long band, the cache, batch and each service tier', () => {
    const findings = openAiFindings(openAiPage());
    assert.deepEqual(kinds(findings, 'drift'), [], 'the page agrees with the catalogue, service tiers included');
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

  it('reads the Codex and ChatGPT rows of the specialized table, its standard half only', () => {
    const rows = readOpenAi(openAiPage()).rows;
    assert.deepEqual(rows.find((row) => row.name === 'gpt-5.3-codex')?.rates, { input: 1.75, output: 14, hit: 0.175 });
    assert.ok(!rows.some((row) => row.name.startsWith('text-embedding') || row.name.startsWith('omni-moderation')), 'an embedding or moderation row was read as a chat model');
    const drift = kinds(openAiFindings(openAiPage({ codexInput: '$2.00' })), 'drift');
    assert.deepEqual(drift.map((finding) => [finding.model, finding.detail]), [
      ['gpt-5.3-codex', 'input: the page says $2, the catalogue prices $1.75'],
    ]);
  });

  it('reads the Flex, Fast and Ultrafast tables as service tiers and reports a changed one', () => {
    const drift = kinds(openAiFindings(openAiPage({ astraFlexInput: '$5.50' })), 'drift');
    assert.deepEqual(drift.map((finding) => [finding.model, finding.detail]), [
      ['gpt-6-astra', 'flex input: the page says $5.5, the catalogue prices $5'],
    ]);
  });

  it('treats a cent-rounded figure as agreeing and anything further off as drift', () => {
    const rounded = openAiPage().replace('| gpt-5.4-mini | $0.375 | $2.25 | $0.0375 |', '| gpt-5.4-mini | $0.375 | $2.25 | $0.04 |');
    assert.deepEqual(kinds(openAiFindings(rounded), 'drift'), [], '$0.04 is $0.0375 to the cent');
    const off = openAiPage().replace('| gpt-5.4-mini | $0.375 | $2.25 | $0.0375 |', '| gpt-5.4-mini | $0.40 | $2.25 | $0.0375 |');
    assert.deepEqual(kinds(openAiFindings(off), 'drift').map((finding) => finding.detail), ['flex input: the page says $0.4, the catalogue prices $0.375']);
  });

  it('says it read nothing when a standard, batch, specialized or service-tier table is gone', () => {
    assert.equal(kinds(openAiFindings('# Pricing\n'), 'unread').length, 6);
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

describe('markup in a cell', () => {
  it('leaves no tag and no angle bracket, however the tags are nested', () => {
    for (const cell of ['<<b>sup>x', 'Claude <b>Opus</b> 9<sup>1</sup>', '<<script>script>alert(1)<</script>/script>', 'a <b']) {
      assert.doesNotMatch(plainName(cell), /[<>]/, cell);
    }
    assert.equal(plainName('Claude <b>Opus</b> 9<sup>1</sup>'), 'Claude Opus 9');
    assert.equal(dollars('<<b>$1.50</b>'), 1.5);
  });
});

describe('the lifecycle: what the provider retires against what the catalogue recommends', () => {
  const deprecations = (opus47 = 'Active') => `
# Model deprecations

## Model status

| API model name             | Current state | Deprecated         | Tentative retirement date          |
| :------------------------- | :------------ | :----------------- | :--------------------------------- |
| claude-opus-4-7            | ${opus47}${' '.repeat(Math.max(0, 14 - opus47.length))}| N/A                | Not sooner than April 16, 2027     |
| claude-sonnet-4-5-20250929 | Deprecated    | September 30, 2026 | November 30, 2026                  |
| claude-mythos-preview      | Deprecated    | June 9, 2026       | To be announced                    |
`;

  it('reads Anthropic\'s model-status table, dated ids and all', () => {
    const page = readAnthropicLifecycle(deprecations());
    assert.deepEqual(page.unread, []);
    assert.deepEqual(page.entries.map((entry) => [entry.id, entry.state]), [
      ['claude-opus-4-7', 'Active'],
      ['claude-sonnet-4-5-20250929', 'Deprecated'],
      ['claude-mythos-preview', 'Deprecated'],
    ]);
    assert.equal(readAnthropicLifecycle('# Nothing\n').unread.length, 1, 'a page without the table reads as unread');
  });

  it('flags a model the provider deprecated and the catalogue still recommends, and only that', () => {
    assert.deepEqual(compareLifecycle('anthropic', readAnthropicLifecycle(deprecations()).entries, core), [],
      'Sonnet 4.5 is deprecated and already not recommended; a model the catalogue lacks is not this check\'s business');
    const status = compareLifecycle('anthropic', readAnthropicLifecycle(deprecations('Deprecated')).entries, core);
    assert.deepEqual(status.map((finding) => [finding.kind, finding.model]), [['status', 'claude-opus-4-7']]);
    assert.match(status[0].detail, /marks it Deprecated, retiring Not sooner than April 16, 2027, and the catalogue still recommends it/);
  });

  it('reads an OpenAI model page\'s status line and context window', () => {
    const page = (status) => `# GPT-X\n\n${status === undefined ? '' : `Status: ${status}\n`}\n## Model details\n\n- 400,000 context window\n- 128,000 max output tokens\n`;
    assert.deepEqual(readOpenAiModelPage(page()), { state: 'Active', contextWindow: 400_000 });
    assert.deepEqual(readOpenAiModelPage(page('Shut down')), { state: 'Shut down', contextWindow: 400_000 });
    assert.deepEqual(readOpenAiModelPage('# no details\n'), { state: 'Active' });
  });

  it('flags a deprecated OpenAI model still recommended, and a changed context window', () => {
    const findings = compareLifecycle('openai', [
      { id: 'gpt-5.2', state: 'Deprecated', contextWindow: 400_000 },
      { id: 'gpt-6-sol', state: 'Active', contextWindow: 2_000_000 },
      { id: 'gpt-4o', state: 'Deprecated', contextWindow: 128_000 },
    ], core);
    assert.deepEqual(findings.map((finding) => [finding.kind, finding.model, finding.detail]), [
      ['status', 'gpt-5.2', 'the provider marks it Deprecated, and the catalogue still recommends it'],
      ['drift', 'gpt-6-sol', 'context window: the page says 2,000,000, the catalogue has 1,050,000'],
    ]);
  });

  it('asks each OpenAI model\'s own page, by id', () => {
    assert.equal(LIFECYCLE_PAGES.openaiModel('gpt-5.4-mini'), 'https://developers.openai.com/api/docs/models/gpt-5.4-mini.md');
    assert.match(LIFECYCLE_PAGES.anthropic, /^https:\/\/platform\.claude\.com\//);
  });

  it('reports a status finding as failing, after drift and before notes', () => {
    const lines = render([
      { provider: 'openai', kind: 'note', model: 'a', detail: 'n' },
      { provider: 'openai', kind: 'status', model: 'b', detail: 's' },
      { provider: 'openai', kind: 'drift', model: 'c', detail: 'd' },
    ], {});
    assert.deepEqual(lines.slice(0, 3).map((line) => line.split(/\s+/)[0]), ['DRIFT', 'STATUS', 'note']);
  });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { it } from 'node:test';
import { BUNDLED_CATALOGUE, profileUsage, codexRecords } from '@trazum/core';

const source = readFileSync(new URL('../components/Bill.tsx', import.meta.url), 'utf8');

it('a replacement dataset is priced without the previous workload, even before React commits state', () => {
  const implementation = source.match(/  function replaceDataset\([^]*?\n  }/);
  assert.ok(implementation, 'the UI replacement handler must exist');
  const code = stripTypeScriptTypes(implementation[0]);
  let selected = 'old-project';
  let report;
  const analyze = (text, _previous, _since, _until, label = 'old-project') => {
    report = profileUsage(text, {
      catalogue: BUNDLED_CATALOGUE,
      ...(label !== null ? { label } : {}),
    });
  };
  const replace = new Function('setDrillLabel', 'analyze', 'since', 'until',
    `${code}; return replaceDataset;`)((label) => { selected = label; }, analyze, '', '');
  const log = JSON.stringify({ model: 'claude-opus-5', input_tokens: 200_000, output_tokens: 0, label: 'new-project' });
  assert.equal(profileUsage(log, { catalogue: BUNDLED_CATALOGUE, label: selected }).total.calls, 0);
  replace(log, null);
  assert.equal(selected, null);
  assert.equal(report.total.calls, 1);
  assert.equal(report.total.totalUsd, 1);
});

it('upload, paste and demo replace the dataset; repricing and comparison preserve selection', () => {
  assert.match(source, /if \(parts\.length > 0\) replaceDataset\(parts\.join\('\\n'\), previousText\)/);
  assert.match(source, /onClick=\{\(\) => replaceDataset\(pasted, previousText\)\}/);
  assert.match(source, /analyzeRef\.current = \(text, previous\) => replaceDataset\(text, previous\)/);
  assert.match(source, /if \(logText !== null\) analyze\(logText, previousText\)/);
  assert.match(source, /if \(logText !== null\) analyze\(logText, text\)/);
  assert.match(source, /label: string \| null = drillLabel/);
});


it('Codex uploads retain only counts, report excluded snapshots and disclose API-equivalent pricing', () => {
  const branch = source.match(/else if \(looksLikeCodexTranscript\(text\)\) \{([^]*?)\n      \} else if/);
  assert.ok(branch);
  const counts = { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 };
  const text = [
    { type: 'session_meta', payload: { id: 'synthetic-session', cwd: 'SYNTHETIC_PRIVATE_PATH' } },
    { type: 'turn_context', payload: { model: 'gpt-5-mini' } },
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: counts, last_token_usage: counts } } },
    { type: 'event_msg', payload: { type: 'token_count', info: {} } },
  ].map(JSON.stringify).join('\n');
  const parts = [];
  let summary;
  const result = new Function('text', 'codexRecords', 'parts', 'tally',
    `let transcripts = 0, convertedCalls = 0, collapsed = 0; ${branch[1]}; return { transcripts, convertedCalls };`)(
      text, codexRecords, parts, (...values) => { summary = values; });
  assert.deepEqual(result, { transcripts: 1, convertedCalls: 1 });
  assert.deepEqual(summary, ['codex', 1, 1]);
  assert.ok(!parts.join('').includes('SYNTHETIC_PRIVATE_PATH'));
  assert.equal(profileUsage(parts.join('\n'), { catalogue: BUNDLED_CATALOGUE }).total.calls, 1);
});

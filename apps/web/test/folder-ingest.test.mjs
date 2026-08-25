import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_CATALOGUE,
  claudeCodeRecords,
  looksLikeClaudeCodeTranscript,
  looksLikeOtel,
  otelRecords,
  profileUsage,
} from '@trazum/core';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const codeOf = (rel) =>
  readFileSync(join(web, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The 1.70 folder drop: the Bill tab accepts a dropped ~/.claude/projects,
 * converts every transcript in the page and prices them beside any usage
 * logs. The DOM walk needs a browser; the data path — detect, convert,
 * label, feed the profiler — is pure and is what these hold, plus the
 * no-fetch invariant the whole feature lives or dies on.
 */
describe('the Bill tab ingests a folder in the browser', () => {
  const bill = codeOf('components/Bill.tsx');

  it('still never fetches, with the new code inside the same file', () => {
    // The feature's entire promise. A fetch added anywhere here — to "just
    // upload the folder" — ends the privacy story, and it would compile.
    assert.equal(/\bfetch\s*\(/.test(bill), false, 'Bill.tsx contains a fetch call');
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(bill), false);
  });

  it('routes each file by the core detector, converts with the core converter', () => {
    assert.match(bill, /looksLikeClaudeCodeTranscript\(/);
    assert.match(bill, /claudeCodeRecords\(/);
    // Descends a dropped directory — the whole point of the folder drop.
    assert.match(bill, /webkitGetAsEntry/);
    assert.match(bill, /webkitdirectory/);
  });

  it('the 1.71 arm: an OpenTelemetry export is detected and converted in the page too', () => {
    // The third arm — a dropped OTLP export routes through the core converter,
    // and the banner reads its honest counts, not a raw span attribute.
    assert.match(bill, /looksLikeOtel\(/);
    assert.match(bill, /otelRecords\(/);
    assert.match(bill, /t\.bill\.otelSummary\(/);
    assert.match(bill, /t\.bill\.otelNoCache\(/);
  });

  it('a dropped OTLP export prices its LLM spans and nothing else crosses', () => {
    const SECRET = 'web-otel-prompt-do-not-leak-3c9d';
    const otlp = JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  name: 'chat',
                  startTimeUnixNano: '1787600000000000000',
                  attributes: [
                    { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
                    { key: 'gen_ai.prompt', value: { stringValue: SECRET } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: '1000' } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: '120' } },
                  ],
                },
                { name: 'db.query', startTimeUnixNano: '1', attributes: [{ key: 'db.system', value: { stringValue: 'pg' } }] },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(looksLikeOtel(otlp), true);
    const conv = otelRecords(otlp);
    assert.equal(conv.llmSpans, 1);
    assert.equal(conv.otherSpans, 1);
    const parts = conv.records.map((r) => JSON.stringify(r));
    const report = profileUsage(parts.join('\n'), { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.calls, 1);
    assert.equal(/web-otel-prompt-do-not-leak/.test(parts.join('\n')), false, 'the prompt crossed into the priced log');
  });

  it('the ingest summary holds counts, never a session key', () => {
    // The banner is built from the conversion's counts. The `ingest` state
    // object is declared with an explicit field list; a session key added to
    // it — or read off it in the banner — is what this catches. (The report
    // elsewhere in this file legitimately reads `.session`; the guard is
    // scoped to the ingest object, not the whole file.)
    const start = bill.indexOf('const [ingest, setIngest]');
    // The closing brace is searched from the declaration itself: another
    // state with the same `} | null>(null)` shape earlier in the file (the
    // 1.74 price card) must not truncate this slice to nothing.
    const shape = bill.slice(start, bill.indexOf('} | null>(null);', start));
    assert.ok(shape.length > 0, 'the ingest state declaration moved');
    assert.equal(/session/i.test(shape), false, 'the ingest summary object carries a session key');
    // And the banner renders only from t.bill.transcript* — never a raw field.
    assert.equal(/ingest\.session/i.test(bill), false, 'the banner reaches into a session key');
  });

  it('a folder of transcripts and a stray usage log price as one bill', () => {
    // The functional heart: mixed input, one profile. Two transcripts under
    // two project names, plus a bare usage log, priced together.
    const on = new Date('2026-08-15T12:00:00Z');
    const transcript = (session, out) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-10T10:00:00.000Z',
        sessionId: session,
        requestId: `req-${session}`,
        message: {
          model: 'claude-sonnet-5',
          content: [{ type: 'text', text: 'secret words here' }],
          usage: { input_tokens: 1000, output_tokens: out },
        },
      });
    const files = [
      { rel: 'webapp/a.jsonl', text: transcript('s1', 100) },
      { rel: 'etl/b.jsonl', text: transcript('s2', 200) },
      { rel: 'usage.jsonl', text: JSON.stringify({ model: 'claude-opus-5', label: 'legacy', usage: { input_tokens: 500, output_tokens: 50 } }) },
    ];
    const parts = [];
    let transcripts = 0;
    for (const f of files) {
      if (looksLikeClaudeCodeTranscript(f.text)) {
        transcripts += 1;
        const label = f.rel.includes('/') ? f.rel.split('/')[0] : undefined;
        const conv = claudeCodeRecords(f.text, label ? { label } : {});
        for (const r of conv.records) parts.push(JSON.stringify(r));
      } else {
        parts.push(f.text);
      }
    }
    assert.equal(transcripts, 2, 'the usage log was miscounted as a transcript');
    const report = profileUsage(parts.join('\n'), { catalogue: BUNDLED_CATALOGUE, on });
    // Three priced calls, three labels — two project names plus the log's own.
    assert.equal(report.total.calls, 3);
    const labels = new Set(report.byLabel.map((e) => e.label));
    assert.ok(labels.has('webapp') && labels.has('etl') && labels.has('legacy'), `labels were ${[...labels]}`);
    // And the planted words never made it into the priced stream.
    assert.equal(/secret words here/.test(parts.join('\n')), false, 'transcript text crossed into the log');
  });
});

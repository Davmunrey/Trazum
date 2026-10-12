import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolOutput, EFFICIENT_OUTPUT_INSTRUCTIONS, MAX_INPUT_CHARS } from '../dist/index.js';

const recover = 'trazum-filter restore abc --recovery-dir /private/logs';
const noise = 'Polling build queue; no state change yet.\n'.repeat(250);

describe('opt-in tool log views', () => {
  it('preserves unique lines, diagnostic repetition and ordering', () => {
    const error = 'ERROR: failed to connect\n';
    const input = `start\n${noise}${error.repeat(5)}finally done\n`;
    const view = compactToolOutput(input, recover);
    assert.equal(view.applied, true);
    assert.match(view.text, /repeated 249 additional times/);
    assert.ok(view.text.includes(error.repeat(5)));
    assert.ok(view.text.indexOf('start\n') < view.text.indexOf('Polling'));
    assert.ok(view.text.endsWith('finally done\n'));
    assert.ok(view.estimatedTokensAfter < view.estimatedTokensBefore * 0.8);
    assert.ok(view.text.includes(recover));
  });
  it('does not deduplicate across different lines or invent absent reductions', () => {
    const input = 'a\nb\n'.repeat(100);
    assert.equal(compactToolOutput(input, recover).text, input);
    assert.equal(compactToolOutput(input, recover).applied, false);
  });
  it('counts recovery and instruction overhead before accepting a reduction', () => {
    const input = 'a\n'.repeat(3);
    assert.equal(compactToolOutput(input, recover).applied, false);
    assert.equal(compactToolOutput(noise, 'x'.repeat(20000)).reason, 'not-worthwhile');
  });
  it('leaves fenced code, terminal controls, CRLF and invalid recovery instructions unchanged', () => {
    for (const input of ['```\n' + noise + '```', '\x1b[31m' + noise, noise.replaceAll('\n', '\r\n')]) {
      assert.equal(compactToolOutput(input, recover).text, input);
    }
    assert.equal(compactToolOutput(noise, 'a\nb').applied, false);
    assert.equal(compactToolOutput(noise, '').applied, false);
  });
  it('keeps an unterminated final line and is idempotent', () => {
    const input = noise + 'unfinished';
    const first = compactToolOutput(input, recover);
    assert.equal(first.applied, true);
    assert.ok(first.text.endsWith('unfinished'));
    assert.equal(compactToolOutput(first.text, recover).text, first.text);
  });
  it('bounds work and leaves unknown estimates null', () => {
    const view = compactToolOutput('x'.repeat(MAX_INPUT_CHARS + 1), recover);
    assert.equal(view.reason, 'too-large');
    assert.equal(view.estimatedTokensBefore, null);
  });
  it('preserves diagnostic strings in any case and prints compact opt-in guidance', () => {
    for (const line of ['Warning', 'FAILURE', 'Traceback', 'Exception', 'PANIC', 'assertion']) {
      const input = `${line}\n`.repeat(250);
      assert.equal(compactToolOutput(input, recover).text, input);
    }
    assert.ok(EFFICIENT_OUTPUT_INSTRUCTIONS.length < 500);
    assert.match(EFFICIENT_OUTPUT_INSTRUCTIONS, /correctness/);
  });
});

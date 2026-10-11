import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { draw, statementLines } from '../../../scripts/draw-bill.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The picture at the top of the README's start section, checked as output.
 *
 * `docs/assets/bill.svg` is what `trazum bill` prints on the two illustrative
 * projects in `examples/claude-projects`, drawn by `scripts/draw-bill.mjs`.
 * The first thing a visitor sees is a total, a table by project, a table by
 * model and a model named as not in the total, and every one of those is
 * something this CLI computed. A price change, a new model in the catalogue,
 * or a reworded line in the statement changes the output; this fails until the
 * picture is redrawn, so the README never shows a bill the CLI would not print.
 */
describe('the bill picture in the README', () => {
  const lines = statementLines();

  it('is exactly what the drawing script makes of the CLI output today', () => {
    const current = readFileSync(join(ROOT, 'docs/assets/bill.svg'), 'utf8');
    assert.equal(current, draw(lines), 'docs/assets/bill.svg is stale. Run: node scripts/draw-bill.mjs');
  });

  it('shows a priced total and a model kept out of it, named', () => {
    assert.match(lines[1], /^\s+\$[\d,.]+ across \d+ priced call\(s\)$/);
    assert.ok(
      lines.some((line) => line.includes('Not in the total')),
      'the examples no longer exercise an unpriced model, which is half of what the picture argues',
    );
  });

  it('is described in the README with the figures it shows', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const img = readme.match(/<img src="docs\/assets\/bill\.svg" alt="([^"]+)"/);
    assert.ok(img !== null, 'README.md no longer shows docs/assets/bill.svg');
    const [, usd, calls] = lines[1].match(/(\$[\d,.]+) across (\d+)/);
    assert.ok(img[1].includes(`${usd} across ${calls} priced calls`), `the alt text does not say ${usd} across ${calls}`);
    const gap = lines.join(' ').match(/(\d+) call\(s\) to ([\w.-]+)/);
    assert.ok(gap !== null && img[1].includes(`${gap[1]} calls to ${gap[2]}`), 'the alt text does not name the unpriced calls');
  });
});

describe('the example projects behind it', () => {
  const dir = join(ROOT, 'examples/claude-projects');
  const files = readdirSync(dir, { recursive: true }).filter((name) => String(name).endsWith('.jsonl'));

  it('carry usage and no prompt or answer text', () => {
    assert.ok(files.length >= 2, 'the picture is two projects; the examples hold fewer');
    for (const file of files) {
      for (const [index, line] of readFileSync(join(dir, String(file)), 'utf8').trim().split('\n').entries()) {
        const record = JSON.parse(line);
        const texts = (record.message?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text);
        for (const text of texts) {
          assert.equal(text, '(illustrative transcript: no real prompt or answer)', `${file}:${index + 1} holds text`);
        }
        assert.ok(record.message?.usage, `${file}:${index + 1} carries no usage`);
      }
    }
  });
});

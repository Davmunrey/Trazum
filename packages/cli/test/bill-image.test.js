import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { draw, statement, statementLines } from '../../../scripts/draw-bill.mjs';

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
  const ansi = statement();
  const lines = statementLines(ansi);

  it('is exactly what the drawing script makes of the CLI output today', () => {
    const current = readFileSync(join(ROOT, 'docs/assets/bill.svg'), 'utf8');
    assert.equal(current, draw(ansi), 'docs/assets/bill.svg is stale. Run: node scripts/draw-bill.mjs');
  });

  it('shows a priced total, the bill by project and the bill by model', () => {
    assert.match(lines[1], /^\s+\$[\d,.]+ across \d+ priced call\(s\)$/);
    assert.ok(lines.some((line) => /^\s+project\s+calls\s+USD\s+share$/.test(line)), 'no table by project');
    assert.ok(lines.some((line) => /^\s+model\s+calls\s+USD\s+share$/.test(line)), 'no table by model');
  });

  it('is described in the README with the figures it shows', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const img = readme.match(/<img src="docs\/assets\/bill\.svg" alt="([^"]+)"/);
    assert.ok(img !== null, 'README.md no longer shows docs/assets/bill.svg');
    const [, usd, calls] = lines[1].match(/(\$[\d,.]+) across (\d+)/);
    assert.ok(img[1].includes(`${usd} across ${calls} priced calls`), `the alt text does not say ${usd} across ${calls}`);
    // A model the picture names as not in the total, the alt text names too.
    const gap = lines.join(' ').match(/(\d+) call\(s\) to ([\w.-]+), which the catalogue/);
    if (gap !== null) {
      assert.ok(img[1].includes(`${gap[1]} calls to ${gap[2]}`), 'the alt text does not name the unpriced calls');
    } else {
      assert.ok(!/not in the total/i.test(img[1]), 'the alt text names a gap the picture no longer shows');
    }
  });
});

/**
 * The card GitHub shows when the repository's link is shared.
 *
 * `docs/assets/social-preview.png` is a screenshot of the HTML beside it, and a
 * PNG cannot be read here. The HTML can: every figure in its bill panel has to
 * be one the CLI prints for the same examples, on the row of the same name, so
 * a price change that redraws the picture above fails here until the card is
 * redrawn too. It is the first thing somebody sees of this project on a
 * timeline, and it is a bill.
 */
describe('the social preview card', () => {
  const lines = statementLines();
  const card = readFileSync(join(ROOT, 'docs/assets/social-preview.html'), 'utf8');

  it('states the total and the number of calls the CLI prints', () => {
    const [, usd, calls] = lines[1].match(/(\$[\d,.]+) across (\d+)/);
    assert.match(card, /<div class="total">(\$[\d,.]+)<\/div>/, 'the card no longer has a total');
    assert.equal(card.match(/<div class="total">(\$[\d,.]+)<\/div>/)[1], usd, 'the card total is not the bill total');
    assert.ok(card.includes(`across ${calls} priced calls`), `the card does not say ${calls} priced calls`);
    assert.ok(card.includes('sample data'), 'the card no longer says its figures are sample data');
  });

  it('gives each project and model the figures on its own row of the bill', () => {
    const rows = [...card.matchAll(/<div class="row"><span>([^<]+)<\/span><span class="usd">([^<]+)<\/span><span class="bar"><i style="width:([\d.]+)%"><\/i><\/span><span class="pct">([^<]+)<\/span><\/div>/g)];
    assert.ok(rows.length >= 4, `the card shows ${rows.length} row(s); a project table and a model table are at least four`);
    for (const [, name, usd, width, share] of rows) {
      const line = lines.find((candidate) => candidate.trim().split(/\s+/)[0] === name);
      assert.ok(line !== undefined, `the card names ${name}, which the bill does not print`);
      const cells = line.trim().split(/\s+/);
      assert.ok(cells.includes(usd), `${name}: the card says ${usd}, the bill says "${line.trim()}"`);
      assert.ok(cells.includes(share), `${name}: the card says ${share}, the bill says "${line.trim()}"`);
      assert.equal(`${width}%`, share, `${name}: the bar is drawn at ${width}% beside a share of ${share}`);
    }
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

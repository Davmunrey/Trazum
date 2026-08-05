import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comparePrompts } from '@trazum/core';

import {
  MAX_COMMENT_CHARS,
  commentMarker,
  fitWithin,
  mdCell,
  mdText,
  renderCheckMarkdown,
  renderDiffMarkdown,
  wrapForComment,
} from '../dist/markdown.js';
import { getCliMessages } from '../dist/i18n/index.js';

const t = getCliMessages('en');
const es = getCliMessages('es');

/** Parses a GFM table into rows of cells, so a broken table is a failed test. */
function tableRows(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[:\- |]+\|$/.test(line))
    .map((line) =>
      // Split on unescaped pipes only — the same rule GFM applies.
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim()),
    );
}

describe('escaping a table cell', () => {
  // Paths come from a repository, and on a pull request that means from whoever
  // opened it. Each of these is a legal filename.
  it('escapes a pipe, which would otherwise end the cell', () => {
    assert.equal(mdCell('a|b.txt'), '`a\\|b.txt`');
  });

  it('fences past the longest run of backticks', () => {
    assert.equal(mdCell('a`b.txt'), '``a`b.txt``');
    assert.equal(mdCell('a``b.txt'), '```a``b.txt```');
  });

  it('pads when the value starts or ends with a backtick', () => {
    // GFM strips one leading and trailing space back off, so this round-trips.
    assert.equal(mdCell('`x'), '`` `x ``');
    assert.equal(mdCell('x`'), '`` x` ``');
  });

  it('flattens anything vertical, which would end the row', () => {
    assert.equal(mdCell('a\nb'), '`a b`');
    assert.equal(mdCell('a\r\nb'), '`a b`');
    assert.equal(mdCell('a\tb'), '`a b`');
  });

  it('keeps a hostile filename inside one cell', () => {
    const hostile = 'prompts/a|b`c``d\ne.txt';
    const row = tableRows(`| x | ${mdCell(hostile)} | 1 |`)[0];
    assert.equal(row.length, 3, `the filename broke the row: ${row.join(' // ')}`);
  });

  it('is empty for an empty value rather than an empty code span', () => {
    assert.equal(mdCell(''), '');
    assert.equal(mdCell('   '), '');
  });
});

describe('escaping inline prose', () => {
  it('neutralises emphasis, code and links', () => {
    assert.equal(mdText('a*b_c`d'), 'a\\*b\\_c\\`d');
    assert.equal(mdText('[x](y)'), '\\[x\\](y)');
    assert.equal(mdText('<b>'), '\\<b\\>');
  });

  it('leaves block-level punctuation alone', () => {
    // `#`, `-`, `+` and `.` only mean anything at the start of a line, and the
    // newline collapse guarantees this value is never at one. Escaping them
    // turned `a.txt` into `a\.txt`, which renders right and reads like a bug.
    assert.equal(mdText('a.txt'), 'a.txt');
    assert.equal(mdText('claude-opus-5'), 'claude-opus-5');
    assert.equal(mdText('C# 1. x'), 'C# 1. x');
  });
});

describe('trimming to fit', () => {
  it('leaves a body that fits untouched', () => {
    assert.equal(fitWithin('short', 100, 'trimmed'), 'short');
  });

  it('says it trimmed rather than trailing off', () => {
    const out = fitWithin('x'.repeat(500), 100, 'TRIMMED');
    assert.ok(out.length <= 100);
    assert.ok(out.endsWith('TRIMMED'));
  });
});

const verdict = (over) => ({
  path: 'prompts/system.txt',
  tokens: over ? 300 : 100,
  maxTokens: 200,
  pattern: 'prompts/**',
  optimizedTokens: over ? 150 : null,
});

describe('the check report', () => {
  const base = { level: 'safe', tokenSource: 'heuristic', truncated: false, t };

  it('leads with the verdict, then the table', () => {
    const md = renderCheckMarkdown({ ...base, target: 'prompts/', verdicts: [verdict(true)] });
    assert.match(md, /^### Trazum/);
    assert.match(md, /\*\*1 of 1 over budget\*\*/);
    assert.equal(tableRows(md).length, 2, 'header plus one row');
  });

  it('marks each row so the table can be scanned without reading it', () => {
    const md = renderCheckMarkdown({
      ...base,
      target: 'prompts/',
      verdicts: [
        verdict(false),
        verdict(true),
        { path: 'notes.txt', tokens: 10, maxTokens: null, pattern: null, optimizedTokens: null },
      ],
    });
    assert.match(md, /\| ✅ \|/);
    assert.match(md, /\| ❌ \|/);
    assert.match(md, /\| – \|/, 'an unbudgeted file needs its own mark, not a blank');
  });

  it('names files no budget covers instead of omitting them', () => {
    // A report that omits them reads as "everything is fine" while a prompt sits
    // outside every pattern with nothing watching it.
    const md = renderCheckMarkdown({
      ...base,
      target: '.',
      verdicts: [
        verdict(false),
        { path: 'notes.txt', tokens: 10, maxTokens: null, pattern: null, optimizedTokens: null },
      ],
    });
    assert.match(md, /not covered by any budget pattern/);
  });

  it('puts the advice under the table, not in a cell', () => {
    const md = renderCheckMarkdown({ ...base, target: 'p/', verdicts: [verdict(true)] });
    assert.match(md, /#### What would help/);
    assert.match(md, /would land at ~150 tokens, which fits/);
    for (const row of tableRows(md)) {
      assert.equal(row.length, 4, `advice leaked into the table: ${row.join(' // ')}`);
    }
  });

  it('says when a walk limit stopped it early', () => {
    // "Nothing over budget" and "I stopped looking" must not read the same.
    const md = renderCheckMarkdown({
      ...base,
      target: 'p/',
      verdicts: [verdict(false)],
      truncated: true,
    });
    assert.match(md, /\[!WARNING\]/);
    assert.match(md, /Stopped early/);
  });

  it('states where the numbers came from', () => {
    const estimated = renderCheckMarkdown({ ...base, target: 'p/', verdicts: [verdict(false)] });
    assert.match(estimated, /estimated, ±15%/);
    const exact = renderCheckMarkdown({
      ...base,
      target: 'p/',
      verdicts: [verdict(false)],
      tokenSource: 'external',
    });
    assert.match(exact, /counted exactly/);
  });

  it('renders in Spanish too', () => {
    const md = renderCheckMarkdown({ ...base, t: es, target: 'p/', verdicts: [verdict(true)] });
    assert.match(md, /por encima del presupuesto/);
    assert.match(md, /Qué ayudaría/);
  });
});

describe('the diff report', () => {
  const usage = {
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 300,
    cacheHitRate: 0.9,
    batchEligible: false,
  };

  const grown = comparePrompts(
    'Classify the ticket. Answer in English.',
    'Please classify the ticket. Answer in English.\n\nRespond in the user language. Thank you!',
    { usage },
  );

  it('spells out the sign convention, because the reader arrived with no context', () => {
    // Every other figure Trazum prints is a saving. Getting this wrong in a PR
    // comment would be worse than not commenting at all.
    const md = renderDiffMarkdown({
      comparison: grown,
      beforePath: 'a.txt',
      afterPath: 'b.txt',
      optimized: false,
      locale: 'en',
      t,
    });
    assert.match(md, /positive means worse/);
    assert.match(md, /\| \+\d+ \(\+\d+%\)/, 'the token delta should carry its sign');
    assert.match(md, /\+\$/, 'the cost delta should carry its sign');
  });

  it('names what the edit broke, above what it cost', () => {
    const md = renderDiffMarkdown({
      comparison: grown,
      beforePath: 'a.txt',
      afterPath: 'b.txt',
      optimized: false,
      locale: 'en',
      t,
    });
    assert.match(md, /contradictory-instructions/);
    assert.ok(
      md.indexOf('Problems this edit introduced') < md.indexOf('Rules that now find something'),
      'a correctness regression should come before a tidiness one',
    );
  });

  it('shows a shrinking prompt as an improvement', () => {
    const shrunk = comparePrompts(
      'Please classify the ticket. Thank you very much!',
      'Classify the ticket.',
      { usage },
    );
    const md = renderDiffMarkdown({
      comparison: shrunk,
      beforePath: 'b.txt',
      afterPath: 'a.txt',
      optimized: false,
      locale: 'en',
      t,
    });
    assert.match(md, /\| ✅ \|/);
    assert.match(md, /-\$/);
  });

  it('says so when it measured the optimised text', () => {
    const md = renderDiffMarkdown({
      comparison: grown,
      beforePath: 'a.txt',
      afterPath: 'b.txt',
      optimized: true,
      locale: 'en',
      t,
    });
    assert.match(md, /not what is written in the file/);
  });

  it('keeps the table intact with a hostile path', () => {
    const md = renderDiffMarkdown({
      comparison: grown,
      beforePath: 'a|b`c.txt',
      afterPath: 'd\ne.txt',
      optimized: false,
      locale: 'en',
      t,
    });
    for (const row of tableRows(md)) {
      assert.equal(row.length, 3, `a path broke the row: ${row.join(' // ')}`);
    }
  });
});

describe('wrapping a report for a comment', () => {
  it('carries an invisible marker so the next push replaces this comment', () => {
    const marker = commentMarker('default');
    assert.match(marker, /^<!-- trazum-report:default -->$/);
    assert.ok(wrapForComment('body', {
      marker,
      ok: true,
      title: 'Trazum',
      collapsedNote: 'note',
      trimNotice: 'trim',
    }).startsWith(marker));
  });

  it('sanitises a key rather than letting it break the marker', () => {
    // The key reaches an HTML comment. `-->` in it would end the comment early
    // and spill the rest into the rendered body.
    assert.equal(commentMarker('a b/c-->d'), '<!-- trazum-report:a-b-c-d -->');
    assert.equal(commentMarker(''), '<!-- trazum-report:default -->');
    assert.equal(commentMarker('!!!'), '<!-- trazum-report:default -->');
    // No `--` anywhere in the output, so `-->` cannot be assembled at all.
    for (const key of ['a--b', '-->', 'x'.repeat(200), '..--..']) {
      assert.doesNotMatch(commentMarker(key).slice(4, -3), /--/, `key ${key}`);
    }
  });

  it('collapses when there is nothing wrong', () => {
    // A green table that stays green on every push is the thing a maintainer
    // learns to skip — and once they skip it, they skip the red one too.
    const green = wrapForComment('body', {
      marker: commentMarker('k'),
      ok: true,
      title: 'Trazum',
      collapsedNote: 'nothing over budget',
      trimNotice: 'trim',
    });
    assert.match(green, /<details>/);
    assert.match(green, /nothing over budget/);
  });

  it('stays expanded when something needs reading', () => {
    const red = wrapForComment('body', {
      marker: commentMarker('k'),
      ok: false,
      title: 'Trazum',
      collapsedNote: 'nothing over budget',
      trimNotice: 'trim',
    });
    assert.doesNotMatch(red, /<details>/);
  });

  it('fits inside what GitHub will accept', () => {
    const huge = wrapForComment('x'.repeat(200_000), {
      marker: commentMarker('k'),
      ok: false,
      title: 'Trazum',
      collapsedNote: 'note',
      trimNotice: 'TRIMMED',
    });
    assert.ok(huge.length < MAX_COMMENT_CHARS, `${huge.length} characters is too long`);
    assert.match(huge, /TRIMMED/);
  });
});

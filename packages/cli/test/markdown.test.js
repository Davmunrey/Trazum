import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comparePrompts } from '@trazum/core';

import {
  MAX_COMMENT_CHARS,
  commentMarker,
  fitWithin,
  mdCell,
  mdText,
  mdTextCell,
  renderBlameMarkdown,
  renderCheckMarkdown,
  renderDiffMarkdown,
  renderRankMarkdown,
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
  // opened it. Every value here is a legal POSIX filename.
  it('emits no pipe character at all, so the row cannot split', () => {
    // The property that replaces reasoning about the row splitter's backslash
    // handling: there is nothing for it to split on.
    for (const hostile of ['a|b.txt', 'a\\|b.txt', 'a\\\\|b.txt', '|||', 'a\\b|c.txt']) {
      assert.doesNotMatch(mdCell(hostile), /\|/, `a raw pipe survived for ${hostile}`);
    }
  });

  it('leaves a backslash alone, because it now needs no escaping', () => {
    // CodeQL flagged the previous version for exactly this: it escaped `|` and
    // not `\`, so `a\|b` came out as `a\\|b` and its fate depended on how the
    // splitter reads a backslash pair.
    assert.equal(mdCell('a\\b.txt'), '<code>a\\b.txt</code>');
    assert.equal(mdCell('a\\|b.txt'), '<code>a\\&#124;b.txt</code>');
  });

  it('treats a backtick as an ordinary character', () => {
    // Inside <code> it is literal, so there is no fence to widen.
    assert.equal(mdCell('a`b.txt'), '<code>a`b.txt</code>');
    assert.equal(mdCell('```'), '<code>```</code>');
    assert.equal(mdCell('`x'), '<code>`x</code>');
  });

  it('encodes the HTML metacharacters, ampersand first', () => {
    assert.equal(mdCell('<b>&amp;'), '<code>&lt;b&gt;&amp;amp;</code>');
    assert.equal(mdCell('a&b'), '<code>a&amp;b</code>');
    // Double-encoding would render the literal text "&#124;" for a plain pipe.
    assert.equal(mdCell('a|b'), '<code>a&#124;b</code>');
  });

  it('flattens anything vertical, which would end the row', () => {
    assert.equal(mdCell('a\nb'), '<code>a b</code>');
    assert.equal(mdCell('a\r\nb'), '<code>a b</code>');
    assert.equal(mdCell('a\tb'), '<code>a b</code>');
  });

  it('keeps a hostile filename inside one cell', () => {
    const hostile = 'prompts/a|b`c``d\\|e\nf<g>&h.txt';
    const row = tableRows(`| x | ${mdCell(hostile)} | 1 |`)[0];
    assert.equal(row.length, 3, `the filename broke the row: ${row.join(' // ')}`);
  });

  it('is empty for an empty value rather than an empty element', () => {
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
    assert.match(estimated, /estimated, ±10%/);
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

describe('escaping untrusted prose in a table cell', () => {
  /**
   * The third escaper, and why two were not enough.
   *
   * `mdCell` is safe and says "this is code" by wrapping in `<code>`. A commit
   * subject and an author's name are neither code nor safe to pass through, and
   * the first draft of the blame report used `mdCell` for both — so a table
   * typeset somebody's name as a code span and a sentence with it. Correct, and
   * plainly wrong to look at.
   */
  it('emits no pipe character at all, so the row cannot split', () => {
    assert.equal(mdTextCell('grow it | with more'), 'grow it &#124; with more');
    assert.equal(mdTextCell('a|b').includes('|'), false);
  });

  it('does not dress prose as code', () => {
    assert.equal(mdTextCell('David Muñoz Rey'), 'David Muñoz Rey');
    assert.equal(mdTextCell('a name').includes('<code>'), false);
  });

  it('encodes the HTML metacharacters, ampersand first', () => {
    assert.equal(
      mdTextCell('fix </table><script>x</script> & more'),
      'fix &lt;/table&gt;&lt;script&gt;x&lt;/script&gt; &amp; more',
    );
    // Ampersand last would produce `&amp;lt;` and print the entity as text.
    assert.equal(mdTextCell('&lt;').includes('&amp;lt;'), true);
  });

  it('neutralises emphasis and code spans, which mdCell does not need to', () => {
    // Inside `<code>` these are literal. Here they are not, and a subject
    // reading `fix *everything*` would otherwise arrive in italics.
    assert.equal(mdTextCell('fix *all* the `things`'), 'fix \\*all\\* the \\`things\\`');
  });

  it('escapes a backslash, so the output shows what the author wrote', () => {
    assert.equal(mdTextCell('trailing \\'), 'trailing \\\\');
    // The pair that broke the first escaper this repository had: a backslash
    // followed by a pipe. The pipe is an entity, so there is nothing for the
    // backslash to be read as escaping.
    assert.equal(mdTextCell('a\\|b'), 'a\\\\&#124;b');
  });

  it('flattens anything vertical, which would end the row', () => {
    assert.equal(mdTextCell('one\ntwo\tthree'), 'one two three');
  });

  it('is empty for an empty value', () => {
    assert.equal(mdTextCell('   '), '');
  });
});

describe('the rank report', () => {
  const profile = (over) => ({
    tokens: 400,
    protectedTokens: 0,
    sentences: 20,
    tokensPerSentence: 20,
    examples: 0,
    exampleTokens: 0,
    formatTokens: 0,
    ...over,
  });

  const ranked = [
    { path: 'prompts/support.txt', profile: profile({}), recoverable: 36, recoverableUsd: 9 },
    { path: 'prompts/tidy.txt', profile: profile({ tokens: 100 }), recoverable: 1, recoverableUsd: 9 },
  ];

  const render = (over = {}) =>
    renderRankMarkdown({
      root: 'prompts',
      ranked,
      level: 'safe',
      modelDisplayName: 'Claude Opus 5',
      callsPerMonth: 50_000,
      truncated: false,
      skipped: 0,
      t,
      ...over,
    });

  it('keeps the token count beside the money, which is the whole point', () => {
    // Two rows with the same dollar figure and 36 tokens against 1. The terminal
    // report prints both because four prompts reading "$0.25" looked like four
    // equivalent jobs; a comment is where that misreading does the most damage,
    // since nobody reading one has the file open.
    const rows = tableRows(render());
    const [header, first, second] = rows;
    assert.deepEqual(header.slice(0, 2), ['Recover', 'Tokens']);
    assert.equal(first[1], '36');
    assert.equal(second[1], '1');
    assert.equal(first[0], second[0], 'the fixture needs equal money for this test to mean anything');
  });

  it('invents no score', () => {
    const md = render();
    assert.match(md, /There is no score/);
    assert.equal(/\b(score|grade|index|rating)\s*[:=]/i.test(md), false);
  });

  it('says which level the recoverable figures were measured at', () => {
    // Without it, "36 tokens recoverable" is a number whose meaning depends on a
    // flag the reader cannot see from the comment.
    assert.match(render(), /rule level `safe`/);
    assert.match(render({ level: 'aggressive' }), /rule level `aggressive`/);
  });

  it('names the prompts it skipped rather than showing a short list', () => {
    const md = render({ skipped: 12 });
    assert.match(md, /Skipped 12 source files/);
    assert.equal(/Skipped/.test(render()), false, 'nothing skipped should say nothing');
  });

  it('warns when a walk limit stopped it early', () => {
    assert.match(render({ truncated: true }), /\[!WARNING\]/);
  });

  it('keeps the table intact with a hostile path', () => {
    const rows = tableRows(
      render({
        ranked: [
          {
            path: 'a|b`c<script>.txt',
            profile: profile({}),
            recoverable: 5,
            recoverableUsd: 1,
          },
        ],
      }),
    );
    assert.equal(rows.length, 2, 'the hostile path split the row');
    assert.equal(rows[1].length, 5);
    assert.match(rows[1][4], /a&#124;b/);
  });

  it('renders in Spanish too', () => {
    assert.match(render({ t: es }), /qué arreglar primero/);
  });
});

describe('the blame report', () => {
  const revision = (over) => ({
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    author: 'Dana',
    date: '2026-03-04T10:00:00Z',
    subject: 'add escalation rules',
    ...over,
  });

  const rows = [
    { revision: revision({ shortSha: 'ccccccc' }), tokens: 1200, delta: 310, name: null },
    { revision: revision({ shortSha: 'bbbbbbb', author: 'Sam' }), tokens: 890, delta: -40, name: null },
    { revision: revision({ shortSha: 'aaaaaaa' }), tokens: 930, delta: null, name: null },
  ];

  const render = (over = {}) =>
    renderBlameMarkdown({ repoPath: 'prompts/support.txt', rows, truncated: false, netCost: null, t, ...over });

  it('shows the date only, not the time', () => {
    const table = tableRows(render());
    assert.equal(table[1][0], '2026-03-04');
  });

  it('bolds a rise and leaves a fall plain', () => {
    // The same asymmetry the terminal makes with colour. A report that shouts
    // equally about growth and shrinkage trains the reader to ignore it.
    const table = tableRows(render());
    assert.equal(table[1][2], '**+310**');
    assert.equal(table[2][2], '-40');
  });

  it('typesets a name as a name and a subject as a sentence', () => {
    // The regression M1 in the mutation run should have failed and did not: going
    // back to `mdCell` here keeps the table intact and is still wrong, because it
    // wraps a person's name and an English sentence in `<code>`. Only the hostile
    // fixture caught it, and only because `&#124;` happened to differ. This asks
    // the actual question.
    const table = tableRows(render());
    assert.equal(table[1][3], 'Dana', 'the author is wrapped in something');
    assert.equal(table[1][4].includes('<code>ccccccc</code>'), true, 'the sha is code');
    assert.match(table[1][4], /<\/code> add escalation rules$/, 'the subject is not code');
  });

  it('names the single worst commit, which is what the command is for', () => {
    const md = render();
    assert.match(md, /Biggest single increase/);
    assert.match(md, /\+310 tokens — Dana/);
  });

  it('reports the net movement across the history', () => {
    assert.match(render(), /930 → 1,200 tokens \(\+270, \+29%\)/);
  });

  it('prices the movement from the caller rather than computing its own', () => {
    // Shared with the terminal report on purpose: two copies of that arithmetic
    // is how a comment and a job log start disagreeing about one history.
    const md = render({
      netCost: { amount: '+$41.20', modelDisplayName: 'Claude Opus 5', callsPerMonth: 50_000 },
    });
    assert.match(md, /\+\$41\.20 a month on Claude Opus 5/);
    assert.equal(/a month on/.test(render()), false, 'no price should appear without one supplied');
  });

  it('says a file was not present rather than showing zero', () => {
    const table = tableRows(
      render({ rows: [{ revision: revision({}), tokens: null, delta: null, name: null }] }),
    );
    assert.equal(table[1][1], 'not present');
  });

  it('says it followed a rename, because the earlier rows are a different path', () => {
    const md = render({
      rows: [{ ...rows[0], name: 'prompts/old-support.txt' }, ...rows.slice(1)],
    });
    assert.match(md, /Followed a rename/);
    assert.match(md, /old-support/);
  });

  it('keeps the table intact with a hostile author and subject', () => {
    // A commit subject on a pull request from a fork is written by whoever opened
    // it, and lands in a table maintainers read.
    const table = tableRows(
      render({
        rows: [
          {
            revision: revision({
              author: 'Eve | evil',
              subject: 'grow | </table><script>x</script> and a backslash \\',
            }),
            tokens: 100,
            delta: 10,
            name: null,
          },
        ],
      }),
    );
    assert.equal(table.length, 2, 'the hostile subject split the row');
    assert.equal(table[1].length, 5);
    assert.equal(table[1][3], 'Eve &#124; evil');
    assert.match(table[1][4], /&lt;\/table&gt;/);
    assert.equal(table[1][4].includes('<script>'), false);
  });

  it('every row has the same number of cells, whatever the input', () => {
    // The invariant that matters, asserted over all of it rather than per field:
    // a table with one ragged row is a table GitHub renders as prose.
    const table = tableRows(
      render({
        rows: [
          ...rows,
          { revision: revision({ author: '|', subject: '|||' }), tokens: 1, delta: 1, name: null },
          { revision: revision({ author: '', subject: '' }), tokens: null, delta: null, name: null },
        ],
      }),
    );
    const widths = new Set(table.map((row) => row.length));
    assert.equal(widths.size, 1, `ragged table: cell counts ${[...widths].join(', ')}`);
  });

  it('renders in Spanish too', () => {
    assert.match(render({ t: es }), /historial de tokens/);
  });
});

describe('the cost diff a pull-request comment leads with', () => {
  const base = { level: 'safe', tokenSource: 'heuristic', truncated: false, t };
  const verdict = (path, tokens) => ({
    path,
    tokens,
    maxTokens: null,
    pattern: null,
    optimizedTokens: null,
  });

  const comparison = (over) => ({
    grown: [{ path: 'prompts/support.txt', before: 100, after: 145, delta: 45 }],
    shrunk: [{ path: 'prompts/quiet.txt', before: 80, after: 60, delta: -20 }],
    added: [{ path: 'prompts/triage.md', before: 0, after: 64, delta: 64 }],
    removed: [{ path: 'prompts/gone.txt', before: 30, after: 0, delta: -30 }],
    tokensBefore: 210,
    tokensAfter: 269,
    delta: 59,
    deltaPct: 28.1,
    ...over,
  });

  const withBaseline = (over = {}, breached = [], comparable = true) =>
    renderCheckMarkdown({
      ...base,
      target: 'prompts/',
      verdicts: [verdict('prompts/support.txt', 145)],
      baseline: {
        comparison: comparison(over),
        breached,
        money: { before: 400, after: 412.5, comparable },
        path: 'trazum.baseline.json',
      },
    });

  it('puts the cost verdict above the budget table', () => {
    /**
     * A reviewer reads the first two lines and scrolls. "Does each file fit its
     * ceiling" is the narrower question; "did this branch make the repository
     * more expensive" is what the pull request proposes.
     */
    const md = withBaseline();
    assert.ok(
      md.indexOf('This branch adds') < md.indexOf('within budget'),
      'the budget summary came first',
    );
  });

  it('shouts only when a threshold was actually crossed', () => {
    assert.doesNotMatch(withBaseline(), /\[!CAUTION\]/, 'shouted about growth nobody limited');
    const breached = withBaseline({}, [{ kind: 'tokens', limit: 0, actual: 59 }]);
    assert.match(breached, /\[!CAUTION\]/);
    assert.match(breached, /0 tokens/, 'does not name the limit that was crossed');
  });

  it('names every limit that was crossed, not just the first', () => {
    const md = withBaseline({}, [
      { kind: 'tokens', limit: 0, actual: 59 },
      { kind: 'pct', limit: 5, actual: 28.1 },
    ]);
    assert.match(md, /0 tokens/);
    assert.match(md, /5%/);
  });

  it('itemises what cost money and leaves the rest out', () => {
    // A list of everything that shrank buries the rows a reviewer has to act on.
    const md = withBaseline();
    assert.match(md, /prompts\/support\.txt/, 'a file that grew is missing');
    assert.match(md, /prompts\/triage\.md/, 'a file that is new is missing');
    assert.match(md, /prompts\/gone\.txt/, 'a deletion is missing');
    assert.doesNotMatch(md, /prompts\/quiet\.txt/, 'a merely shrunk file was itemised');
  });

  it('says a branch got cheaper rather than staying silent', () => {
    const md = withBaseline({ delta: -30, deltaPct: -14.3, tokensAfter: 180 });
    assert.match(md, /removes 30 tokens/);
    assert.doesNotMatch(md, /\[!CAUTION\]/);
  });

  it('does not subtract two different measurements', () => {
    // A monthly delta across a reprice or a scenario edit is not a saving, and a
    // figure in a pull-request comment gets quoted in a meeting.
    const md = withBaseline({}, [], false);
    assert.doesNotMatch(md, /Monthly cost/);
    assert.match(md, /not the same measurement/);
  });

  it('tells the reader how to accept the growth', () => {
    const md = withBaseline({}, [{ kind: 'tokens', limit: 0, actual: 59 }]);
    assert.match(md, /trazum baseline/);
    assert.match(md, /trazum\.baseline\.json/);
  });

  it('says nothing at all when no baseline governed the run', () => {
    const md = renderCheckMarkdown({
      ...base,
      target: 'prompts/',
      verdicts: [verdict('prompts/support.txt', 145)],
    });
    assert.doesNotMatch(md, /Baseline|This branch/);
  });

  it('escapes a path in the cost table too', () => {
    // The budget table's escaping is tested above; this table is a second place
    // a repository-controlled path reaches GFM.
    const md = renderCheckMarkdown({
      ...base,
      target: 'prompts/',
      verdicts: [verdict('a|b.txt', 10)],
      baseline: {
        comparison: comparison({
          grown: [{ path: 'a|b.txt', before: 1, after: 10, delta: 9 }],
          shrunk: [],
          added: [],
          removed: [],
        }),
        breached: [],
        money: { before: 1, after: 2, comparable: true },
        path: 'trazum.baseline.json',
      },
    });
    for (const row of tableRows(md)) {
      assert.ok(row.length <= 5, `a row split into ${row.length} cells: ${JSON.stringify(row)}`);
    }
  });

  it('renders in Spanish too', () => {
    const md = renderCheckMarkdown({
      ...base,
      t: es,
      target: 'prompts/',
      verdicts: [verdict('prompts/support.txt', 145)],
      baseline: {
        comparison: comparison(),
        breached: [],
        money: { before: 400, after: 412.5, comparable: true },
        path: 'trazum.baseline.json',
      },
    });
    assert.match(md, /Esta rama a\u00f1ade/);
    assert.match(md, /Coste mensual/);
  });
});

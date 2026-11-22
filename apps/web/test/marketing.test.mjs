import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { register } from 'node:module';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { statementLines } from '../../../scripts/draw-bill.mjs';

register('./helpers/loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const read = (relative) => readFileSync(join(web, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The marketing pages sell the product; these guards keep them from selling
 * anything the product is not. A Persuade surface in this repository plays
 * by the same rules as the app: no network, honest numbers, every language
 * it claims, and motion that respects the reader who asked for less of it.
 */
const SHELL = [
  'components/Landing.tsx',
  'components/marketing.tsx',
  'components/site/GitHub.tsx',
  'components/site/SiteHeader.tsx',
  'components/site/SiteFooter.tsx',
  'components/site/SiteFrame.tsx',
  'components/site/CommandLine.tsx',
  'components/site/NotFound.tsx',
  'components/landing/Story.tsx',
];

describe('the marketing pages play by the app’s rules', () => {
  const marketing = codeOf('components/marketing.tsx');
  const locales = codeOf('lib/marketing-locales.ts');
  const landing = codeOf('components/Landing.tsx');
  const copy = codeOf('lib/landing-copy.ts');
  const siteCopy = codeOf('lib/site-copy.ts');

  it('never fetch: a static page has no business calling anywhere', () => {
    /*
      No star count from GitHub, no font from a foreign host, no analytics
      call of their own. The policy is `connect-src 'self'`, and the site's
      pages do not even use that.
    */
    for (const file of [...SHELL, 'lib/landing-copy.ts', 'lib/site-copy.ts', 'lib/site.ts', 'lib/social-card.tsx']) {
      const code = codeOf(file);
      assert.equal(/\bfetch\s*\(/.test(code), false, `${file} contains a fetch call`);
      assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(code), false, `${file} opens a channel`);
      assert.equal(/https?:\/\/(?!github\.com\/(?:TrazumAPP|Davmunrey)|www\.npmjs\.com\/package\/@trazum)[\w.-]+/.test(code), false, `${file} names a third-party host`);
    }
  });

  it('respects prefers-reduced-motion, wherever the motion lives', () => {
    /**
     * The landing's motion is its story, told by scroll (`app/landing.css`).
     * Every rule that moves anything sits inside
     * `@media (prefers-reduced-motion: no-preference)` and under
     * `:root[data-motion='scroll']`, which the bootstrap never sets for a
     * reader who asked for less motion. Outside that block the stylesheet is
     * the still page, and nothing in it may depend on the story's progress.
     */
    const css = read('app/landing.css');
    const at = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    assert.ok(at !== -1, 'nothing gates the story for the reader who asked for less motion');
    const still = css.slice(0, at);
    assert.equal(/var\(--p\)|animation(?:-[a-z]+)?\s*:/.test(still), false, 'the still page depends on the story');
    assert.match(css.slice(at), /:root\[data-motion='scroll'\] \.story \[data-mv\] \{\s*animation-duration: auto;/, 'the story is not under the motion switch');
    assert.match(codeOf('lib/theme.ts'), /prefers-reduced-motion: reduce\)'\)\.matches\)r\.dataset\.motion='scroll'/, 'the bootstrap sets the story mode regardless of the preference');
  });

  it('carries its own locale key, so an unreviewed language stays on the site', () => {
    // The site reaches five languages; the tool speaks two. They must not
    // share storage, or a French landing would push 'fr' into a tool that has
    // no reviewed French.
    assert.match(locales, /MARKETING_LOCALE_KEY = 'trazum:marketing-locale'/);
    assert.match(marketing, /MARKETING_LOCALE_KEY/);
    assert.equal(/LOCALE_STORAGE_KEY/.test(marketing + landing), false, 'the marketing locale reuses the tool key');
  });

  it('carries no price: the owner decided to stay open source, priceless', () => {
    // No euro figure, no tier name, no pricing route.
    assert.equal(/€\s?\d|\/pricing/.test(landing + copy), false, 'a price or pricing link crept back onto the landing');
  });

  it('no private mailbox leaks into a public page', () => {
    assert.equal(/gmail/.test(landing + marketing + copy + siteCopy), false, 'a private mailbox leaked into a public page');
  });

  it('external links carry rel="noreferrer noopener"', () => {
    for (const file of SHELL) {
      const code = codeOf(file);
      const targets = code.match(/target="_blank"|target: '_blank'/g) ?? [];
      const rels = code.match(/rel="noreferrer noopener"|rel: 'noreferrer noopener'/g) ?? [];
      assert.equal(targets.length, rels.length, `${file}: an external link without rel protection`);
    }
  });

  it('speaks five languages, and every one is complete', () => {
    // The types forbid a partial record; this pins the intent: five named,
    // and a copy block for each in both the landing's and the shell's words.
    for (const code of ['en', 'es', 'fr', 'de', 'pt']) {
      assert.ok(new RegExp(`\\n  ${code}: \\{`).test(copy), `the landing is missing a ${code} copy block`);
      assert.ok(new RegExp(`\\n  ${code}: \\{`).test(siteCopy), `the site shell is missing a ${code} copy block`);
    }
    assert.match(locales, /MARKETING_LOCALES = \['en', 'es', 'fr', 'de', 'pt'\]/);
  });

  it('says out loud which languages are machine-drafted, unreviewed', () => {
    // fr/de/pt are marked unreviewed and carry a visible note on every page
    // of the site; en/es are reviewed and carry none.
    assert.match(locales, /fr: \{ name: 'Français', reviewed: false \}/);
    assert.match(locales, /en: \{ name: 'English', reviewed: true \}/);
    assert.match(codeOf('components/site/SiteFrame.tsx'), /UNREVIEWED_NOTE\[locale\]/);
    for (const code of ['fr', 'de', 'pt']) {
      assert.ok(
        new RegExp(`${code}: '[^']+GitHub`).test(siteCopy),
        `the ${code} unreviewed note is missing or does not point at GitHub`,
      );
    }
    assert.match(siteCopy, /en: '',\n  es: '',/);
  });

  it('invents no social proof, and names nobody else’s tool', () => {
    for (const file of ['lib/landing-copy.ts', 'lib/site-copy.ts']) {
      const text = codeOf(file);
      assert.equal(/testimonial|trusted by|customers love|users worldwide|\d[\d,]*\+? (?:users|developers|teams|companies)/i.test(text), false, `${file}: invented social proof`);
      assert.equal(/\b(?:Helicone|LangSmith|Langfuse|Datadog|OpenMeter|Portkey)\b/.test(text), false, `${file}: a comparison with a named tool`);
      assert.equal(/—/.test(text), false, `${file}: an em-dash in the new prose`);
    }
  });
});

/**
 * The worked example on the landing is the README's illustrative bill, and
 * every figure in it is one the CLI prints.
 *
 * The page cannot run the CLI, so it carries the figures; this runs the CLI,
 * through the same `scripts/draw-bill.mjs` that draws the README's picture,
 * and fails on any figure the CLI would not print. A price change redraws the
 * README picture (`bill-image.test.js` asks for that) and then fails here
 * until the landing and the social card say the same.
 */
describe('the landing’s bill is the one the CLI prints', () => {
  const lines = statementLines();
  /** A row of the CLI's table, by its first cell: [name, calls, usd, share]. */
  const row = (name) => {
    const line = lines.find((candidate) => candidate.trim().split(/\s+/)[0] === name);
    assert.ok(line !== undefined, `the CLI prints no row named ${name}`);
    const cells = line.trim().split(/\s+/);
    return { name: cells[0], calls: Number(cells[1]), usd: cells[2], share: cells.at(-1) };
  };

  it('the total, the calls and the window', async () => {
    const { ILLUSTRATIVE_BILL } = await import('../lib/landing-copy.ts');
    const [, usd, calls] = lines[1].match(/(\$[\d,.]+) across (\d+) priced call/);
    assert.equal(ILLUSTRATIVE_BILL.total, usd, 'the landing’s total is not the CLI’s');
    assert.equal(ILLUSTRATIVE_BILL.calls, Number(calls), 'the landing’s call count is not the CLI’s');
    const window = lines.join(' ').match(/covers (\d{4}-\d\d-\d\d) → (\d{4}-\d\d-\d\d) \(([\d.]+) days\)/);
    assert.ok(window !== null, 'the CLI no longer states the window');
    assert.deepEqual([ILLUSTRATIVE_BILL.from, ILLUSTRATIVE_BILL.to, ILLUSTRATIVE_BILL.days], window.slice(1, 4));
    assert.equal(ILLUSTRATIVE_BILL.command, 'trazum bill examples/claude-projects');
  });

  it('every project and every model, on the row of the same name', async () => {
    const { ILLUSTRATIVE_BILL } = await import('../lib/landing-copy.ts');
    const shown = [...ILLUSTRATIVE_BILL.projects, ...ILLUSTRATIVE_BILL.models];
    assert.ok(ILLUSTRATIVE_BILL.projects.length >= 2 && ILLUSTRATIVE_BILL.models.length >= 2);
    for (const entry of shown) assert.deepEqual({ ...entry }, row(entry.name), `${entry.name} differs from the CLI`);
    // And nothing the CLI prints is left off: a table with a row missing still adds up wrongly.
    const printed = (header) => {
      const start = lines.findIndex((line) => new RegExp(`^\\s+${header}\\s+calls`).test(line));
      const rows = [];
      for (let at = start + 1; at < lines.length && lines[at].trim() !== ''; at += 1) rows.push(lines[at].trim().split(/\s+/)[0]);
      return rows;
    };
    assert.deepEqual(ILLUSTRATIVE_BILL.projects.map((r) => r.name), printed('project'));
    assert.deepEqual(ILLUSTRATIVE_BILL.models.map((r) => r.name), printed('model'));
  });

  it('is labelled the way the README labels it, in every language', async () => {
    const { COPY } = await import('../lib/landing-copy.ts');
    const readme = readFileSync(join(web, '../../README.md'), 'utf8');
    assert.match(readme, /Illustrative data from \[`examples\/claude-projects`\][^\n]*\nnot a customer result/);
    assert.match(COPY.en.billNote, /^Illustrative data, not a customer result\. Generated from the CLI output\.$/);
    for (const [locale, t] of Object.entries(COPY)) {
      assert.ok(t.billNote.length > 20, `${locale}: the bill is not labelled`);
      assert.equal(t.billSource, 'examples/claude-projects');
    }
    // The label stands in the bill's chapter of the story, beside the link to the files.
    assert.match(codeOf('components/landing/Story.tsx'), /\{t\.billNote\}/);
    assert.match(codeOf('lib/social-card.tsx'), /\{note\}/, 'the social card shows the bill without its label');
  });
});

/**
 * The landing's English sentences are the README's. Each one below is looked
 * for in the README, whitespace collapsed and the README's markup stripped,
 * so a claim written for the landing alone fails here.
 */
describe('every English sentence on the landing is one the README makes', () => {
  const readme = readFileSync(join(web, '../../README.md'), 'utf8')
    .replace(/\*\*|`|\[|\]\([^)]*\)/g, '')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ');

  it('the headline, the lede, the reasons and what never leaves', async () => {
    const { COPY } = await import('../lib/landing-copy.ts');
    const t = COPY.en;
    const norm = (text) => text.replace(/[’]/g, "'").replace(/\s+/g, ' ');
    const verbatim = [
      t.heroTitle,
      ...t.heroLede.split(/(?<=\.) /),
      t.reasons.map(([title]) => title),
      t.reasons.flatMap(([, body]) => body.split(/(?<=\.) /)),
      'Local analysis does not upload your files.',
      'Requires Node.js 20 or newer.',
      'npx may download Trazum from npm.',
      'On a subscription, this is API-equivalent cost, not what you paid.',
      'Unpriced models are reported as gaps.',
      'Nothing is called and nothing is spent to answer.',
      'One binary, two exit codes',
      'never touching code, URLs, email addresses or placeholders',
      'the things that move 60% to 80% are which model the call goes to, the Batch API, prompt caching, and what re-sending the conversation costs',
      'What leaves: a receipt, a report, a gate verdict.',
      'What never crosses the line: the prompt text, the model\'s answer, file paths, branch names and credentials.',
    ].flat();
    for (const sentence of verbatim) {
      assert.ok(readme.includes(norm(sentence).replace(/^(.)/, (c) => c)), `the README does not say: ${sentence}`);
    }
    // And the landing says them: the two lists at the end are the boundary picture's own words.
    assert.equal(t.leaves, 'A receipt, a report, a gate verdict.');
    assert.deepEqual(t.neverItems.map((item) => item.toLowerCase().replace(/[’]/g, "'")), ['the prompt text', "the model's answer", 'file paths', 'branch names', 'credentials']);
    assert.ok(t.heroTitle.startsWith('Know what your AI agents cost, per project'));
    assert.equal(t.eyebrow, 'Open source · Local analysis · No provider key needed to get started');
    assert.ok(readme.includes(t.eyebrow), 'the eyebrow is not the README’s line');
  });
});

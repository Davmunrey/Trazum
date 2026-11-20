#!/usr/bin/env node
/**
 * Writes `apps/web/lib/landing-terminal.ts`: every character the landing's
 * laptop shows on its screen, as the built CLI printed it, and the receipt
 * that prints out of its side, from the receipt the same CLI writes.
 *
 * The landing puts the product on a desk: one laptop, and around it one
 * object per capability. Pressing an object shows that command's output on
 * the laptop's screen. A terminal on a product page is the easiest place to
 * type a figure nobody computed, so nothing on that screen is typed by hand:
 * this script runs the commands the screen shows, on files that are in this
 * repository, and writes down what came out, line by line and in the colours
 * the CLI chose, the way `draw-bill.mjs` and `draw-demo.mjs` draw the README's
 * two terminal pictures.
 *
 * The transcript, by the object that shows it, in the order the desk lays
 * them out:
 *
 *   1. The receipt. `bill examples/claude-projects`: the illustrative bill the
 *      README shows, two Claude Code projects with no real prompt or answer in
 *      them. The paper receipt beside the laptop is `bill --receipt` on the
 *      same files: each line's model, calls, money and the date its rate was
 *      reviewed, and the total, formatted by the core's own `formatUsd`.
 *   2. The CI gate. `check examples/`: the gate on this repository's own
 *      example prompts, against the budgets in its `trazum.config.json` and
 *      the baseline it commits, then `echo $?` and the exit status the process
 *      really returned.
 *   3. The breaker. `session-guard check`, the hook Claude Code runs, fed the
 *      hook input Claude Code sends (a session id and the transcript's path)
 *      for the example webapp transcript, twice: with figures it passes the
 *      first of (it warns, exit 0) and with figures it reaches the second of
 *      (it stops, exit 2). Each run's standard output and standard error, as a
 *      terminal shows both, and `echo $?` after it. The hook remembers a
 *      warning it gave in a cache directory; here that is a directory made
 *      for the run and removed after it, so every run starts from nothing.
 *   4. The clock. `bill examples/claude-projects --agent claude-code
 *      --timezone Europe/Madrid --by week`: one agent's records, by week, the
 *      days cut in Madrid.
 *   5. The pencil. `optimize examples/support-prompt.txt`: the trimming report
 *      on the README's wordy support prompt, whole, with the token counts
 *      before and after.
 *   6. The calendar. `models`, trimmed: its heading, the dates each provider's
 *      rates were read, the table's head, and the rows of the models the
 *      receipt priced, then lines this script writes, dimmed, saying how many
 *      rows are shown and the clock the run had. `models` says how many days
 *      ago each date was, which would change the screen every day, so it runs
 *      with the clock set to the day the newest rates were read (the latest
 *      date in the core's `PROVIDER_REVIEWED`), and the screen says so.
 *
 * And one block no object shows, for the chapter of the story that says what
 * happens to a model with no published price: `bill
 * examples/unpriced-model.jsonl`, a five-call example log in which two calls
 * went to a self-hosted model the catalogue does not price. The CLI names it
 * and keeps it out of the total; the page labels the file an example. The
 * receipt's lines carry the page each rate was read from, the first of the
 * core's `PROVIDER_SOURCES` for the line's provider, beside the date the
 * receipt says that rate was read.
 *
 * **The narrow screen.** A phone's screen is too narrow for 80 columns at a
 * size anybody can read, and a table wrapped onto two lines is no longer a
 * table. So every command above runs a second time with `COLUMNS=60`, the
 * narrowest window the CLI draws for (`MIN_COLUMNS` in its `style.ts`): its
 * tables narrow their bars and its prose reflows to 60 columns, as they would
 * in a terminal that wide. The one table the CLI does not narrow, `models`,
 * is cut after its `output` column in that transcript, and a dimmed line this
 * script writes says so. The page shows the narrow transcript on a screen
 * too narrow for the wide one and the wide one everywhere else; both are the
 * CLI's, and both are compared by the web suite.
 *
 * The MCP server's `spend_guard` answer is not on the screen: the repository
 * has no example call of it to run, and an answer written for the page would
 * be the invented output this script exists to prevent.
 *
 * What the screen says was typed is the command a person at a terminal would
 * type, through `npx`, without the flags a pipe needs (`--table` for the bill,
 * `-o` for optimize, whose last line naming the scratch file is dropped, as
 * `draw-demo.mjs` drops it); a command too long for the screen is broken
 * across lines the way a shell continues it, after a `|` or a `\`.
 * Standard error is shown only where it is the answer (the breaker's stop);
 * elsewhere the screen is standard output, as both pictures are. Blank lines
 * at either end of an output are left out, as both pictures leave them out;
 * every other line is the CLI's.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { capture, plain, styledLines } from './terminal-picture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/lib/landing-terminal.ts');
const CLI = join(ROOT, 'packages/cli/dist/index.js');
const CORE = join(ROOT, 'packages/core/dist/index.js');

/** How the screen names the CLI: the hero's own command, `npx @trazum/cli`. */
const NPX = 'npx @trazum/cli';

/** Where a command too long for the screen breaks, as a shell continues it. */
const NEXT = ' \\\n    ';

/** The folder of the example transcript the breaker reads, and the hook input Claude Code would send for it. */
const WEBAPP = 'examples/claude-projects/-home-me-webapp';
const HOOK_INPUT = '{"session_id":"demo","transcript_path":"demo-webapp.jsonl"}';

/** What the CLI reads to guess where it is running; blanked, as `terminal-picture.mjs` blanks them. */
const HOST_ENV = ['CLAUDECODE', 'CODEX_SANDBOX', 'CODEX_HOME', 'CURSOR_TRACE_ID', 'GITHUB_ACTIONS', 'CI', 'TERM_PROGRAM'];

/**
 * A run's style as the page's class letters: bold, dim, the four colours, and
 * the mark (the acid ground in ink, whose ink is the mark's and not a colour).
 */
function styleOf({ bold, dim, colour, mark }) {
  const colours = { 32: 'g', 33: 'y', 31: 'r', 36: 'a' };
  const hue = colour === null || (mark && colour === 30) ? '' : colours[colour];
  if (hue === undefined) throw new Error(`The CLI printed colour code ${colour}, which the landing gives no class`);
  return `${bold ? 'b' : ''}${dim ? 'd' : ''}${hue}${mark ? 'm' : ''}`;
}

/** The CLI's coloured output as lines of `[text, style]` runs. */
const toLines = (ansi) => styledLines(ansi).map((runs) => runs.map((run) => [run.text, styleOf(run)]));

/**
 * A line this script writes, dimmed, under two spaces, as the CLI indents its
 * notes; in a window `columns` wide it is wrapped at a space, as the CLI wraps
 * its prose, each line under the same two spaces.
 */
function said(text, columns) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && (columns === undefined || 2 + last.length + 1 + word.length <= columns)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.map((line) => [['  ', ''], [line, 'd']]);
}

/** A line's runs cut to its first `width` characters, without the spaces the cut leaves at its end. */
function cutRuns(runs, width) {
  const out = [];
  let left = width;
  for (const [text, style] of runs) {
    if (left <= 0) break;
    out.push([text.slice(0, left), style]);
    left -= text.length;
  }
  while (out.length > 0) {
    const [text, style] = out.at(-1);
    const trimmed = text.replace(/\s+$/, '');
    if (trimmed !== '') {
      out[out.length - 1] = [trimmed, style];
      break;
    }
    out.pop();
  }
  return out;
}

/** The narrowest window the CLI draws for (`MIN_COLUMNS`): the phone's transcript is the CLI's at this width. */
const NARROW = 60;

/**
 * One run of the built CLI, as a terminal would see it: colour on, English, no
 * host read from the environment, and a window `columns` wide when that is
 * given (a pipe otherwise, as the README's pictures are drawn).
 */
function run(args, { cwd = ROOT, input, env: extra = {}, node = [], columns } = {}) {
  const env = { ...process.env, FORCE_COLOR: '1', TRAZUM_LOCALE: 'en', ...extra };
  delete env.NO_COLOR;
  delete env.COLUMNS;
  if (columns !== undefined) env.COLUMNS = String(columns);
  for (const name of HOST_ENV) env[name] = '';
  const result = spawnSync(process.execPath, [...node, CLI, ...args], { cwd, env, input, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

/** What the built CLI writes to standard output for `args`, as `capture` does, in a window `columns` wide when that is given. */
function captureAt(args, columns) {
  if (columns === undefined) return capture(args);
  return run(args, { columns }).stdout;
}

/** The exit status `check` returns, which `echo $?` prints. */
function exitStatus(args) {
  const env = { ...process.env, TRAZUM_LOCALE: 'en' };
  for (const name of HOST_ENV) env[name] = '';
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, env, stdio: 'ignore' });
  return result.status;
}

/** The optimize report without the line naming the file `-o` wrote. */
function optimizeReport(prompt, columns) {
  const scratch = mkdtempSync(join(tmpdir(), 'trazum-landing-'));
  try {
    const ansi = captureAt(['optimize', prompt, '-o', join(scratch, 'shorter.txt'), '--locale', 'en'], columns);
    const lines = ansi.split('\n');
    const written = lines.findLastIndex((line) => plain(line).includes(scratch));
    if (written === -1) throw new Error('optimize no longer says where it wrote the prompt');
    return lines.slice(0, written).join('\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The breaker: the hook run twice on the webapp's transcript, from its folder,
 * as Claude Code runs it, with standard output then standard error (each run
 * writes only one of the two), and the status after each. A fresh cache
 * directory, so the warning is the first this session was given.
 */
function sessionGuard(columns) {
  const cache = mkdtempSync(join(tmpdir(), 'trazum-landing-guard-'));
  try {
    const runs = [
      ['warn', ['--warn', '1', '--stop', '5'], 0],
      ['stop', ['--warn', '1', '--stop', '3'], 2],
    ];
    return runs.flatMap(([id, figures, expected]) => {
      const args = ['session-guard', 'check', ...figures, '--on-cannot-tell', 'fail-open'];
      const result = run(args, { cwd: join(ROOT, WEBAPP), input: `${HOOK_INPUT}\n`, env: { TRAZUM_STATUSLINE_CACHE: cache }, columns });
      if (result.status !== expected) throw new Error(`session-guard exited ${result.status} at ${figures.join(' ')}: those figures no longer ${id} on the example transcript`);
      return [
        {
          id: `guard-${id}`,
          cap: 'guard',
          command: `echo '${HOOK_INPUT}' |\n    ${NPX} session-guard check${NEXT}${figures.join(' ')} --on-cannot-tell fail-open`,
          lines: toLines(`${result.stdout}${result.stderr}`),
        },
        { id: `guard-${id}-status`, cap: 'guard', command: 'echo $?', lines: [[[String(result.status), '']]] },
      ];
    });
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

/** The first page the core says a provider's prices were read from, without its scheme. */
function sourceOf(sources, provider) {
  const page = sources[provider]?.[0];
  if (page === undefined) throw new Error(`the core names no page for ${provider}'s prices`);
  return page.replace(/^https:\/\//, '').replace(/\/$/, '');
}

/**
 * The example a chapter of the story runs: a log in which some calls went to
 * a model the catalogue does not price. Its receipt's gaps name the models
 * and count the calls, and the bill says the same on the screen.
 */
const UNPRICED_LOG = 'examples/unpriced-model.jsonl';
/** What `bill --receipt` on the example log reports as unpriced: the file, the models and their calls. */
function unpriced() {
  const result = run(['bill', UNPRICED_LOG, '--receipt', '--locale', 'en']);
  if (result.status !== 0) throw new Error(`bill --receipt on ${UNPRICED_LOG} exited ${result.status}`);
  const gaps = JSON.parse(result.stdout).gaps.filter((gap) => gap.kind === 'unpriced');
  if (gaps.length === 0) throw new Error(`${UNPRICED_LOG} no longer has a model the catalogue does not price`);
  return { source: UNPRICED_LOG, models: gaps.flatMap((gap) => gap.models), calls: gaps.reduce((sum, gap) => sum + gap.calls, 0) };
}

/** The receipt `bill --receipt` writes for the example projects, as the paper beside the laptop shows it. */
async function receipt() {
  const { formatUsd } = await import(pathToFileURL(CORE).href);
  // Not exported from the core's entry point: read from the module that holds it.
  const { PROVIDER_SOURCES } = await import(pathToFileURL(join(dirname(CORE), 'pricing.js')).href);
  const result = run(['bill', 'examples/claude-projects', '--receipt', '--locale', 'en']);
  if (result.status !== 0) throw new Error(`bill --receipt exited ${result.status}`);
  const data = JSON.parse(result.stdout);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  if (data.gaps.length > 0) throw new Error('the example receipt has gaps, which the paper receipt does not show');
  return {
    source: 'examples/claude-projects',
    from: day(data.span.fromMs),
    to: day(data.span.toMs),
    calls: data.span.calls,
    lines: data.lines.map((line) => ({
      model: line.model,
      label: line.label,
      calls: line.calls,
      usd: formatUsd(line.usd),
      reviewedOn: line.pricing.reviewedOn,
      provider: line.pricing.provider,
      source: sourceOf(PROVIDER_SOURCES, line.pricing.provider),
    })),
    total: formatUsd(data.total.usd),
  };
}

/**
 * The calendar: `models` with the clock set to the day the newest rates were
 * read, cut to its head and the rows of the models the receipt priced. The
 * clock is a module loaded before the CLI that makes `new Date()` and
 * `Date.now()` that day at noon UTC; nothing else about the run changes.
 */
async function models(priced, columns) {
  const { PROVIDER_REVIEWED } = await import(pathToFileURL(CORE).href);
  const today = Object.values(PROVIDER_REVIEWED).sort().at(-1);
  const scratch = mkdtempSync(join(tmpdir(), 'trazum-landing-clock-'));
  try {
    const clock = join(scratch, 'clock.mjs');
    writeFileSync(
      clock,
      `const at = Date.parse(${JSON.stringify(`${today}T12:00:00Z`)});
const Real = Date;
globalThis.Date = class extends Real {
  constructor(...args) { if (args.length === 0) super(at); else super(...args); }
  static now() { return at; }
};
`,
    );
    const result = run(['models', '--locale', 'en'], { node: ['--import', pathToFileURL(clock).href], columns });
    if (result.status !== 0) throw new Error(`models exited ${result.status}`);
    const lines = toLines(result.stdout);
    const text = lines.map((runs) => runs.map(([t]) => t).join(''));
    const head = text.findIndex((line) => /^\s+model\s+input\s+output/.test(line));
    if (head === -1) throw new Error('models no longer prints a table headed model, input, output');
    let end = text.findIndex((line, index) => index > head && line.trim() === '');
    if (end === -1) end = text.length;
    const rows = lines.slice(head + 1, end).filter((_, index) => priced.includes(text[head + 1 + index].trim().split(/\s+/)[0]));
    if (rows.length !== new Set(priced).size) throw new Error('the table does not have a row for every model the receipt priced');
    // The table is as wide as its columns whatever the window: in a narrow one it is cut after `output`, and says so.
    const output = text[head].indexOf('output');
    const cut = columns !== undefined && widthOf(lines[head]) > columns ? output + 'output'.length : null;
    if (cut !== null && output === -1) throw new Error('models no longer has an output column to cut the narrow table after');
    const fit = (runs) => (cut === null ? runs : cutRuns(runs, cut));
    const left = cut === null ? [] : text[head].slice(cut).trim().split(/\s{2,}/);
    return {
      id: 'models',
      cap: 'models',
      command: `${NPX} models`,
      lines: [
        ...lines.slice(0, head),
        fit(lines[head]),
        ...rows.map(fit),
        ...said(`… ${rows.length} of ${end - head - 1} rows shown: the models the receipt priced.`, columns),
        ...(cut === null ? [] : said(`Cut after output to fit ${columns} columns: ${left.join(', ')} not shown.`, columns)),
        ...said(`Run with the clock set to ${today}, the day the newest rates were read.`, columns),
      ],
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The transcript: one block per command, each with the object that shows it,
 * in a window `columns` wide when that is given (the narrow screen's), as a
 * pipe otherwise.
 */
async function blocksAt(paper, columns) {
  const check = ['check', 'examples/', '--locale', 'en'];
  return [
    {
      id: 'bill',
      cap: 'bill',
      command: `${NPX} bill examples/claude-projects`,
      lines: toLines(captureAt(['bill', 'examples/claude-projects', '--table', '--locale', 'en'], columns)),
    },
    { id: 'check', cap: 'check', command: `${NPX} check examples/`, lines: toLines(captureAt(check, columns)) },
    { id: 'status', cap: 'check', command: 'echo $?', lines: [[[String(exitStatus(check)), '']]] },
    { id: 'guard-cd', cap: 'guard', command: `cd ${WEBAPP}`, lines: [] },
    ...sessionGuard(columns),
    {
      id: 'clock',
      cap: 'clock',
      command: `${NPX} bill examples/claude-projects${NEXT}--agent claude-code --timezone Europe/Madrid --by week`,
      lines: toLines(
        captureAt(['bill', 'examples/claude-projects', '--agent', 'claude-code', '--timezone', 'Europe/Madrid', '--by', 'week', '--table', '--locale', 'en'], columns),
      ),
    },
    {
      id: 'optimize',
      cap: 'optimize',
      command: `${NPX} optimize examples/support-prompt.txt`,
      lines: toLines(optimizeReport('examples/support-prompt.txt', columns)),
    },
    await models(
      paper.lines.map((line) => line.model),
      columns,
    ),
    {
      id: 'unpriced',
      cap: 'unpriced',
      command: `${NPX} bill ${UNPRICED_LOG}`,
      lines: toLines(captureAt(['bill', UNPRICED_LOG, '--table', '--locale', 'en'], columns)),
    },
  ];
}

/** The transcript as a pipe sees it and as a 60-column window does, and the paper receipt. */
export async function transcript() {
  const paper = await receipt();
  return { receipt: paper, unpriced: unpriced(), blocks: await blocksAt(paper), narrow: await blocksAt(paper, NARROW) };
}

/** A line's width in columns: the length of its runs' text. */
const widthOf = (runs) => runs.reduce((n, [text]) => n + text.length, 0);
/** A heading ruled out to the width: the rule may be cut at the screen's edge, so it does not set the width. */
const isRuled = (runs) => runs.length > 0 && /^─+$/.test(runs.at(-1)[0]);

/**
 * The screen's width in characters: its widest line, the typed commands
 * included, that is neither a rule nor a sentence a terminal of that width
 * wraps. The breaker's messages are one line each, which any terminal wraps,
 * and so is the calendar's line naming every provider; the calendar's table
 * is not wrapped.
 */
function columnsOf(blocks, { wrapped = [] } = {}) {
  const measured = blocks.flatMap((block) => {
    const commands = block.command.split('\n').map((line, index) => line.length + (index === 0 ? 2 : 0));
    if (wrapped.includes(block.cap)) return [];
    if (block.cap === 'guard') return commands;
    const from = block.id === 'models' ? block.lines.findIndex((runs) => /^\s+model\s/.test(runs.map(([t]) => t).join(''))) : 0;
    return [...commands, ...block.lines.slice(from).filter((runs) => !isRuled(runs)).map(widthOf)];
  });
  return Math.max(...measured);
}

/** One block as the generated source writes it. */
const blockSource = (block) => `  {
    id: ${JSON.stringify(block.id)},
    cap: ${JSON.stringify(block.cap)},
    command: ${JSON.stringify(block.command)},
    lines: [${block.lines.length === 0 ? '' : `\n${block.lines.map((runs) => `      ${JSON.stringify(runs)},`).join('\n')}\n    `}],
  },`;

/** Writes `lib/landing-terminal.ts` from the transcripts, refusing a narrow line wider than the narrow screen. */
export async function render(data) {
  const { receipt: paper, unpriced: gap, blocks, narrow } = data ?? (await transcript());
  const narrowColumns = columnsOf(narrow, { wrapped: ['guard'] });
  if (narrowColumns > NARROW) throw new Error(`the narrow transcript has a line ${narrowColumns} columns wide, more than the ${NARROW} it was drawn for`);
  return `/**
 * Written by scripts/draw-landing-terminal.mjs from what the built CLI prints.
 * Do not edit: run \`node scripts/draw-landing-terminal.mjs\`. The web suite
 * fails when this stops being that output.
 *
 * Each line is a list of runs, \`[text, style]\`, where the style letters are
 * the CLI's own: b bold, d dim, g green, y yellow, r red, a cyan (drawn in the
 * acid fill, as the README's pictures draw it), m the mark (ink on the acid
 * ground: the one figure the report answers with). A command broken across
 * lines is one string with a newline where the shell continues it.
 */

/** The object on the desk whose press shows a block on the screen. */
export type CapabilityId = 'bill' | 'check' | 'guard' | 'clock' | 'optimize' | 'models';
/** What shows a block: an object, or the story's chapter on a model with no published price, which no object shows. */
export type BlockOwner = CapabilityId | 'unpriced';
export type TerminalRun = readonly [text: string, style: string];
export interface TerminalBlock {
  readonly id: ${blocks.map((block) => JSON.stringify(block.id)).join(' | ')};
  readonly cap: BlockOwner;
  readonly command: string;
  readonly lines: readonly (readonly TerminalRun[])[];
}

/** The screen's width in characters, prompt included: its widest line that is neither a rule nor a sentence a terminal wraps. */
export const TERMINAL_COLUMNS = ${columnsOf(blocks)};

export const TERMINAL: readonly TerminalBlock[] = [
${blocks.map(blockSource).join('\n')}
];

/**
 * The narrow screen's width in characters: the same commands run again in a window ${NARROW} columns wide, the
 * narrowest the CLI draws for. The breaker's echo line and its messages are wider, and wrap as that terminal wraps them.
 */
export const TERMINAL_NARROW_COLUMNS = ${narrowColumns};

export const TERMINAL_NARROW: readonly TerminalBlock[] = [
${narrow.map(blockSource).join('\n')}
];

/**
 * The paper receipt beside the laptop: \`bill examples/claude-projects --receipt\`, each figure formatted by the
 * core's \`formatUsd\`, each line with the date its rate was read and the page it was read from (the core's
 * \`PROVIDER_SOURCES\` for the line's provider).
 */
export const RECEIPT = ${JSON.stringify(paper, null, 2)} as const;

/** What \`bill --receipt\` on the example log says it kept out of the total: the models it does not price, and their calls. */
export const UNPRICED = ${JSON.stringify(gap, null, 2)} as const;
`;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const text = await render();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing is the same failure as different.
    }
    if (current !== text) {
      console.error('apps/web/lib/landing-terminal.ts is not what the CLI prints today.\n\nRun: node scripts/draw-landing-terminal.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
    console.log('wrote apps/web/lib/landing-terminal.ts');
  }
}

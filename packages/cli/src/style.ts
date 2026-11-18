/**
 * The one module that draws the CLI's terminal reports (#758).
 *
 * The commands hand it rows and sentences; it decides the colour, the width
 * and the order a report is read in, so two commands cannot drift apart
 * again. DESIGN.md, "Terminal", states the rules this file implements.
 *
 * **Colour depth comes from the terminal.** True colour where it says it has
 * it (`COLORTERM`), the chosen nearest of the 256 where `TERM` says 256, the
 * 16 otherwise, and nothing at all where `NO_COLOR` is set or stdout is not a
 * terminal. `FORCE_COLOR` outranks all of that, with the levels other tools
 * give it (1 the 16, 2 the 256, 3 true colour, 0 none): it is the door the
 * tests and the drawing scripts walk through, since they run under a pipe. A
 * plain pipe stays plain: every `trazum ... | grep` in somebody's script is
 * owed the bytes their script was written against.
 *
 * **Colour never carries a meaning alone.** Every state has a word or a mark
 * (`!`, `?`, `→`, `OK`, `OVER`) that a pipe carries too, and the paint only
 * repeats it. The chapter-four guard in `style.test.js` strips the paint and
 * asserts nothing was lost and nothing was hiding in it.
 *
 * **Width comes from the window**, between 60 and 76 columns: a table fits by
 * narrowing its bars and then its names, never by wrapping a figure away from
 * its label.
 */

/**
 * The variables the decisions below read: colour depth and width.
 *
 * Exported for the same reason `LOCALE_ENV_VARS` is: the test suite has to
 * neutralise the machine before asserting on output, and a list of what to
 * neutralise kept in the test file drifts from the list that is read here. It
 * drifted once already, in the other direction: `env.mjs` set `NO_COLOR` and
 * left `FORCE_COLOR` alone, so a contributor whose shell exports `FORCE_COLOR`
 * ran the whole CLI suite against painted output and twenty-nine tests failed.
 * `COLUMNS` is here because a shell that exports it would otherwise narrow
 * every report a test reads.
 */
export const TERMINAL_ENV_VARS = ['FORCE_COLOR', 'NO_COLOR', 'COLORTERM', 'TERM', 'COLUMNS'] as const;

type TerminalEnv = Partial<Record<(typeof TERMINAL_ENV_VARS)[number], string>>;

/** How many colours the terminal has said it can show. */
export type ColourDepth = 'none' | '16' | '256' | 'truecolor';

/**
 * The depth for an environment and a stdout, as a pure function so each of
 * the four answers can be asked for directly.
 */
export function colourDepth(env: TerminalEnv, isTTY: boolean): ColourDepth {
  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    if (force === '0' || force === 'false') return 'none';
    if (force === '2') return '256';
    if (force === '3') return 'truecolor';
    return '16';
  }
  if (env.NO_COLOR !== undefined) return 'none';
  if (!isTTY || env.TERM === 'dumb') return 'none';
  const colorterm = (env.COLORTERM ?? '').toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  if ((env.TERM ?? '').includes('256')) return '256';
  return '16';
}

export const depth: ColourDepth = colourDepth(process.env, process.stdout.isTTY === true);
export const useColor = depth !== 'none';

/**
 * The brand's colours, from DESIGN.md's token table, at each depth.
 *
 * Ink and paper are the reader's: a terminal's foreground and ground are
 * whatever its owner chose, and the CLI cannot see which, so it never paints
 * a foreground that reads on only one of them. The brand's ink appears as the
 * type inside the mark, on the acid ground, which reads on a light terminal
 * and a dark one alike. The 256 values are the nearest of the fixed cube and
 * grey ramp (16 to 255) by distance in RGB, worked out in
 * `terminal-report.test.js`; the first 16 are left out because every theme
 * redefines them.
 *
 * **The accent is not the page's accent text.** The page knows its ground and
 * changes the accent with it (#526014 on paper, the acid on the dark canvas);
 * a terminal cannot tell its own ground, so its accent is one colour that has
 * to hold on both. #526014 measured 2.37:1 on the dark canvas, and the bars
 * and arrows went dull where the old cyan read. #70831b is the same olive,
 * same hue and saturation, at the lightness that keeps 3.5:1 or more on
 * paper, white and the two dark grounds; `terminal-report.test.js` computes it.
 */
export const PALETTE = {
  ink: { hex: '#20231e', c256: 234, c16: 30 },
  acid: { hex: '#dce94d', c256: 185, c16: 43 },
  accent: { hex: '#70831b', c256: 64, c16: 36 },
} as const;

const rgb = (hex: string): string =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(';');

/** An SGR foreground (or, with `ground`, background) for a palette colour at a depth. */
function sgr(colour: (typeof PALETTE)[keyof typeof PALETTE], at: ColourDepth, ground = false): string {
  if (at === 'truecolor') return `${ground ? 48 : 38};2;${rgb(colour.hex)}`;
  if (at === '256') return `${ground ? 48 : 38};5;${colour.c256}`;
  return String(colour.c16);
}

/**
 * The painters, for a depth. Exported as a factory so the tests can paint at a
 * depth the machine running them does not have.
 *
 * Success, caution and error stay the terminal's own green, yellow and red at
 * every depth: its theme already tunes those to its ground, which the CLI
 * cannot see. The accent (what points: the share bars and the lever arrows)
 * is the brand's at 256 and true colour and cyan in the 16, the one colour of
 * the 16 no state uses. The mark is the acid ground with ink type and bold,
 * and a report puts it on one figure: the one that answers its question.
 */
export function painters(at: ColourDepth) {
  const wrap = (open: string, close: string) => (s: string) =>
    at === 'none' || s === '' ? s : `\u001b[${open}m${s}\u001b[${close}m`;
  const accent = wrap(sgr(PALETTE.accent, at), '39');
  return {
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    green: wrap('32', '39'),
    red: wrap('31', '39'),
    yellow: wrap('33', '39'),
    accent,
    /** The name every caller used for what points; the accent now. */
    cyan: accent,
    mark: wrap(`1;${sgr(PALETTE.ink, at)};${sgr(PALETTE.acid, at, true)}`, '22;39;49'),
  };
}

export const c = painters(depth);

/**
 * The painters for standard error, which is a terminal or not on its own: the
 * bill's notes on what it read are dimmed on a terminal and left plain in a
 * pipe or a file.
 */
export const cErr = painters(colourDepth(process.env, process.stderr.isTTY === true));

/** The report's text column when nothing says how wide the window is. */
export const REPORT_WIDTH = 74;

/** The narrowest and widest a report is drawn, the indent included. */
export const MIN_COLUMNS = 60;
export const MAX_COLUMNS = 76;

/**
 * How wide a report is drawn: the window's width when there is a window (or
 * `COLUMNS` says what it is), held between 60 and 76 columns. 76 is the
 * widest line the reports printed before they knew the window, so a wide
 * terminal gets the layout it always had.
 *
 * `window` is false when nothing said how wide: a pipe or a file. Then the
 * report keeps the layout it always printed there, line for line, because a
 * script reading it has no window to fit and was written against those bytes;
 * a name in a table is never cut for a reader with no window.
 */
export function columnsFor(env: TerminalEnv, ttyColumns: number | undefined): { columns: number; window: boolean } {
  const asked = ttyColumns !== undefined && ttyColumns > 0 ? ttyColumns : Number.parseInt(env.COLUMNS ?? '', 10);
  if (!Number.isFinite(asked) || asked <= 0) return { columns: MAX_COLUMNS, window: false };
  return { columns: Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, asked)), window: true };
}

const measured = columnsFor(process.env, process.stdout.isTTY === true ? process.stdout.columns : undefined);
export const COLUMNS = measured.columns;
export const WINDOW = measured.window;

/**
 * A paragraph wrapped to `width` characters, its later lines under `indent`.
 *
 * Every paragraph of every command goes through here. With no window it cuts
 * where it always cut; with one it also keeps the line, indent included,
 * inside the window, so prose reflows down to 60 columns. Unpainted text in:
 * the caller paints the result.
 */
export function wrap(text: string, width: number, indent: string, columns = WINDOW ? COLUMNS : null): string {
  const room = columns === null ? width : Math.min(width, Math.max(20, columns - indent.length));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > room) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${indent}`);
}

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * A string's width as a terminal draws it — the ANSI codes not counted.
 *
 * Every hand-rolled `padStart` in the CLI miscounted the moment a painted
 * cell reached it, which is why nothing painted ever sat in a column. All
 * padding below measures through this.
 */
export function visibleWidth(s: string): number {
  return s.replace(ANSI, '').length;
}

export function padCell(s: string, width: number, align: 'left' | 'right'): string {
  const gap = Math.max(0, width - visibleWidth(s));
  return align === 'right' ? ' '.repeat(gap) + s : s + ' '.repeat(gap);
}

/** A word that states a figure: it holds a digit. */
const FIGURE = /\d/;

/**
 * A paragraph as lines no wider than `width`, a word never split.
 *
 * A figure is held to the word after it, so `126 calls` or `$5.21 projected`
 * never ends one line and starts the next. Unpainted text in, unpainted
 * lines out: the caller paints a line once it is cut.
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const units: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let unit = words[i]!;
    if (FIGURE.test(unit) && i + 1 < words.length && unit.length + 1 + words[i + 1]!.length <= width) {
      unit = `${unit} ${words[++i]}`;
    }
    units.push(unit);
  }
  const lines: string[] = [];
  let line = '';
  for (const unit of units) {
    if (line !== '' && line.length + unit.length + 1 > width) {
      lines.push(line);
      line = unit;
    } else {
      line = line === '' ? unit : `${line} ${unit}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

export interface TableColumn {
  /** The header cell, already localized. Empty string for a headerless column. */
  header: string;
  align: 'left' | 'right';
}

/**
 * A bar cell: a share drawn as `███░░░░░░░`, as wide as the table has room for.
 *
 * The bar is content, not paint — it prints in a pipe too, so the stripped
 * and plain outputs stay byte-identical. It never carries information the
 * text does not: the percentage beside it is the number, the bar is the
 * glance.
 */
export interface BarCell {
  bar: number;
}

export type Cell = string | BarCell;

const isBar = (cell: Cell | undefined): cell is BarCell => typeof cell === 'object' && cell !== null;

/**
 * A share the line already states, readable from further away: `███░░░░░░░`.
 * Clamped, because a share over 1 is the caller's bug and a bar wider than
 * asked would make it the layout's.
 */
export function bar(share: number, width = 10, paint = c): string {
  const clamped = Math.max(0, Math.min(1, share));
  const filled = Math.round(clamped * width);
  return paint.accent('█'.repeat(filled)) + paint.dim('░'.repeat(width - filled));
}

const BAR_WIDTHS = [10, 5, 0];
const ELLIPSIS = '…';

/** A name cut to `width` characters, saying it was cut. Unpainted names only. */
function cut(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (text !== text.replace(ANSI, '')) return text;
  return `${text.slice(0, Math.max(1, width - 1))}${ELLIPSIS}`;
}

/**
 * A path cut from its start to `room` characters, `…` saying so: the end of a
 * path is the part that names the file. Untouched when it fits, or when there
 * is no window to fit (`room` infinite).
 */
export function fitPath(path: string, room: number): string {
  if (!Number.isFinite(room) || path.length <= room) return path;
  const keep = Math.max(11, room) - 1;
  return `${ELLIPSIS}${path.slice(path.length - keep)}`;
}

/**
 * The one table renderer.
 *
 * Widths come from the content, headers print dimmed, and cells may arrive
 * painted — the measurement ignores the paint. When the table is wider than
 * `width` it narrows its bars (ten cells, then five, then none) and then cuts
 * its first left-aligned column, the name, with an ellipsis. A figure is never
 * cut and a row never wraps, so every figure stays on the line of its label.
 * Returns lines; the caller owns the indent, because some tables live inside a
 * bullet and some at the margin.
 */
export function table(
  columns: TableColumn[],
  rows: Cell[][],
  indent = '  ',
  width = Number.POSITIVE_INFINITY,
  paint = c,
): string[] {
  const draw = (barWidth: number, nameWidth: number | null): string[] => {
    const text = rows.map((row) =>
      columns.map((_, i) => {
        const cell = row[i];
        if (isBar(cell)) return barWidth === 0 ? '' : bar(cell.bar, barWidth, paint);
        const value = cell ?? '';
        return nameWidth !== null && i === nameColumn ? cut(value, nameWidth) : value;
      }),
    );
    const shown = columns.map((col, i) => {
      const barColumn = rows.some((row) => isBar(row[i]));
      return !(barColumn && barWidth === 0) || col.header !== '';
    });
    const widths = columns.map((col, i) =>
      Math.max(visibleWidth(col.header), ...text.map((row) => visibleWidth(row[i] ?? ''))),
    );
    const join = (cells: string[]) =>
      indent +
      cells
        .map((cell, i) => (shown[i] ? padCell(cell, widths[i] ?? 0, columns[i]!.align) : null))
        .filter((cell): cell is string => cell !== null)
        .join('  ')
        .trimEnd();
    const lines: string[] = [];
    if (columns.some((col) => col.header !== '')) lines.push(join(columns.map((col) => paint.dim(col.header))));
    for (const row of text) lines.push(join(row));
    return lines;
  };
  const nameColumn = columns.findIndex((col) => col.align === 'left');
  const fits = (lines: string[]) => lines.every((line) => visibleWidth(line) <= width);
  const hasBars = rows.some((row) => row.some(isBar));
  let lines: string[] = [];
  for (const barWidth of hasBars ? BAR_WIDTHS : [0]) {
    lines = draw(barWidth, null);
    if (fits(lines)) return lines;
  }
  if (nameColumn === -1) return lines;
  const over = Math.max(...lines.map(visibleWidth)) - width;
  const longest = Math.max(visibleWidth(columns[nameColumn]!.header), ...rows.map((row) => (isBar(row[nameColumn]) ? 0 : visibleWidth((row[nameColumn] as string) ?? ''))));
  return draw(0, Math.max(8, longest - over));
}

/**
 * A section heading an eye can stop on: the text bold, the line completed
 * with a dim rule out to the report's width.
 *
 *   Adónde fue el dinero ─────────────────────────────────────────────
 *
 * The rule is content (it survives the strip); the weight is paint.
 */
export function sectionHeading(text: string, width = WINDOW ? COLUMNS - 2 : REPORT_WIDTH, paint = c): string {
  const room = Math.max(0, width - visibleWidth(text) - 1);
  return `${paint.bold(text)} ${paint.dim('─'.repeat(room))}`.trimEnd();
}

/** What a line of prose is painted as. */
export type Tone = 'plain' | 'dim' | 'bold' | 'caution' | 'good' | 'error';

/**
 * A state and the mark that says it without colour: the mark prints in a pipe,
 * the colour only repeats it.
 */
export type State = 'caution' | 'error' | 'good' | 'point' | 'aside' | 'question';

const MARKS: Record<State, string> = {
  caution: '!',
  error: '✗',
  good: '✓',
  point: '→',
  aside: '·',
  question: '?',
};

/**
 * A report, drawn in one order: the question and the figure that answers it,
 * then the breakdown, then the notes and what to do next. A reader who stops
 * after the first three lines has the answer.
 *
 * The commands hand it sentences and rows; it wraps them to the window,
 * paints them at the terminal's depth and puts the one mark on the figure the
 * headline names. Nothing here computes a figure: every number arrives as
 * text the command already formatted.
 */
export class Report {
  private readonly out: string[] = [];
  private marked = false;

  constructor(
    readonly width: number = COLUMNS,
    private readonly paint = c,
    /** Whether a window is known; tables are fitted to one only then. */
    private readonly window: boolean = WINDOW,
  ) {}

  private tone(text: string, tone: Tone): string {
    switch (tone) {
      case 'dim':
        return this.paint.dim(text);
      case 'bold':
        return this.paint.bold(text);
      case 'caution':
        return this.paint.yellow(text);
      case 'good':
        return this.paint.green(text);
      case 'error':
        return this.paint.red(text);
      default:
        return text;
    }
  }

  /** The state's mark, painted in the state's colour. */
  markOf(state: State): string {
    const glyph = MARKS[state];
    switch (state) {
      case 'caution':
      case 'question':
        return this.paint.yellow(glyph);
      case 'error':
        return this.paint.red(glyph);
      case 'good':
        return this.paint.green(glyph);
      case 'point':
        return this.paint.accent(glyph);
      default:
        return this.paint.dim(glyph);
    }
  }

  blank(): this {
    this.out.push('');
    return this;
  }

  /**
   * The question, as a heading ruled out to the width, and the line that
   * answers it with `figure` marked. The mark goes on one figure per report:
   * a second headline draws its figure bold instead.
   */
  headline(question: string, answer: string, figure?: string): this {
    this.heading(question);
    return this.answer(answer, figure);
  }

  /** The answering line on its own, under a heading drawn elsewhere. */
  answer(answer: string, figure?: string, indent = '  '): this {
    const lines = wrapText(answer, this.width - indent.length);
    const at = figure === undefined ? -1 : (lines[0] ?? '').indexOf(figure);
    lines.forEach((line, index) => {
      if (index === 0 && figure !== undefined && at !== -1) {
        const painted = this.marked ? this.paint.bold(figure) : this.paint.mark(figure);
        this.marked = true;
        this.out.push(`${indent}${this.paint.bold(line.slice(0, at))}${painted}${this.paint.bold(line.slice(at + figure.length))}`);
      } else {
        this.out.push(`${indent}${this.paint.bold(line)}`);
      }
    });
    return this;
  }

  /** A section heading with its rule. */
  heading(text: string): this {
    this.out.push(sectionHeading(text, this.width - 2, this.paint));
    return this;
  }

  /** A bold title on its own line, no rule: a subsection. */
  title(text: string, indent = ''): this {
    this.out.push(`${indent}${this.paint.bold(text)}`);
    return this;
  }

  /** A paragraph, wrapped to the window under `indent`. */
  text(text: string, options: { indent?: string; tone?: Tone; first?: string } = {}): this {
    const indent = options.indent ?? '  ';
    const first = options.first ?? indent;
    const tone = options.tone ?? 'plain';
    wrapText(text, this.width - Math.max(visibleWidth(first), indent.length)).forEach((line, index) => {
      this.out.push(`${index === 0 ? first : indent}${this.tone(line, tone)}`);
    });
    return this;
  }

  /**
   * A note with its mark: `! sentence`, the wrapped lines hanging under the
   * sentence. The mark carries the state; the sentence keeps the reader's
   * colour unless `tone` says otherwise.
   */
  note(state: State, text: string, options: { indent?: string; tone?: Tone } = {}): this {
    const indent = options.indent ?? '  ';
    return this.text(text, {
      first: `${indent}${this.markOf(state)} `,
      indent: `${indent}  `,
      tone: options.tone ?? 'plain',
    });
  }

  /** Rows under columns, fitted to the window. */
  table(columns: TableColumn[], rows: Cell[][], indent = '  '): this {
    this.out.push(...table(columns, rows, indent, this.window ? this.width : Number.POSITIVE_INFINITY, this.paint));
    return this;
  }

  /** Whether a composed line fits the window; always, when there is none. */
  fits(line: string): boolean {
    return !this.window || visibleWidth(line) <= this.width;
  }

  /**
   * The room left on a line after `lead`, for a cell that can be cut to fit:
   * infinite when no window is known, so a pipe never loses a character.
   */
  room(lead: string): number {
    return this.window ? Math.max(12, this.width - visibleWidth(lead)) : Number.POSITIVE_INFINITY;
  }

  /**
   * Shares drawn as a bar before the line that states them: `███░░░  Input
   * $3.51  27.6%`. A table of two columns, so a narrow window narrows the bar
   * and never the line.
   */
  shares(rows: { share: number; text: string }[], indent = '  '): this {
    return this.table(
      [
        { header: '', align: 'left' },
        { header: '', align: 'left' },
      ],
      rows.map((row) => [{ bar: row.share }, row.text]),
      indent,
    );
  }

  /**
   * A line the caller composed. For the few lines whose layout is the
   * content (a diff, a column of rule tags); they are not wrapped.
   */
  line(text: string): this {
    this.out.push(text);
    return this;
  }

  lines(): string[] {
    return [...this.out];
  }

  print(write: (line: string) => void = (line) => console.log(line)): void {
    for (const line of this.out) write(line);
    this.out.length = 0;
  }
}

/**
 * The CLI's presentation layer — the 1.75 arc.
 *
 * Six painters, one measurer, one table renderer, one proportion bar, one
 * heading rule. Everything here decorates figures the prose already states;
 * the chapter-four guard strips the paint and asserts nothing was lost and
 * nothing was hiding in it.
 *
 * Colour is on for a TTY unless `NO_COLOR` says otherwise, and on anywhere
 * when `FORCE_COLOR=1` — the door the guard itself walks through, since a
 * test that wants to see what colour does runs under a pipe. A plain pipe
 * stays plain: every `trazum ... | grep` in somebody's script is owed the
 * bytes their script was written against.
 */

const forced = process.env.FORCE_COLOR === '1';
export const useColor = forced || (process.stdout.isTTY === true && process.env.NO_COLOR === undefined);

export const c = {
  bold: (s: string) => (useColor ? `\u001b[1m${s}\u001b[22m` : s),
  dim: (s: string) => (useColor ? `\u001b[2m${s}\u001b[22m` : s),
  green: (s: string) => (useColor ? `\u001b[32m${s}\u001b[39m` : s),
  red: (s: string) => (useColor ? `\u001b[31m${s}\u001b[39m` : s),
  yellow: (s: string) => (useColor ? `\u001b[33m${s}\u001b[39m` : s),
  cyan: (s: string) => (useColor ? `\u001b[36m${s}\u001b[39m` : s),
};

/** The report's text column. Headings rule out to it; nothing else needs it. */
export const REPORT_WIDTH = 74;

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

export interface TableColumn {
  /** The header cell, already localized. Empty string for a headerless column. */
  header: string;
  align: 'left' | 'right';
}

/**
 * The one table renderer, for the eleven layouts that each rebuilt it.
 *
 * Widths come from the content, headers print dimmed, and cells may arrive
 * painted — the measurement ignores the paint. Returns lines; the caller
 * owns the `console.log` and the indent, because some tables live inside a
 * bullet and some at the margin.
 */
export function table(columns: TableColumn[], rows: string[][], indent = '  '): string[] {
  const widths = columns.map((col, i) =>
    Math.max(visibleWidth(col.header), ...rows.map((row) => visibleWidth(row[i] ?? ''))),
  );
  const lines: string[] = [];
  if (columns.some((col) => col.header !== '')) {
    lines.push(
      indent +
        columns.map((col, i) => padCell(c.dim(col.header), widths[i] ?? 0, col.align)).join('  ').trimEnd(),
    );
  }
  for (const row of rows) {
    lines.push(
      indent + columns.map((col, i) => padCell(row[i] ?? '', widths[i] ?? 0, col.align)).join('  ').trimEnd(),
    );
  }
  return lines;
}

/**
 * A share the line already states, readable from further away: `███░░░░░░░`.
 *
 * The bar is content, not paint — it prints in a pipe too, so the stripped
 * and plain outputs stay byte-identical. It never carries information the
 * text does not: the percentage beside it is the number, the bar is the
 * glance. Clamped, because a share over 1 is the caller's bug and a bar
 * wider than asked would make it the layout's.
 */
export function bar(share: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, share));
  const filled = Math.round(clamped * width);
  return c.cyan('█'.repeat(filled)) + c.dim('░'.repeat(width - filled));
}

/**
 * A section heading an eye can stop on: the text bold, the line completed
 * with a dim rule out to the report's width.
 *
 *   Adónde fue el dinero ─────────────────────────────────────────────
 *
 * The rule is content (it survives the strip); the weight is paint.
 */
export function sectionHeading(text: string, width = REPORT_WIDTH): string {
  const room = Math.max(0, width - visibleWidth(text) - 1);
  return `${c.bold(text)} ${c.dim('─'.repeat(room))}`.trimEnd();
}

/**
 * What reaches the terminal is text, never a command to the terminal.
 *
 * A usage log is written by somebody else's tool and read by this one, and a
 * label, a model name or a session id in it can carry escape sequences: clear
 * the screen, retitle the window, rewrite the line above. `bill --table`,
 * `profile` and `plan` printed them as they came (penetration test of
 * 2026-11-22, finding L-8). HTML, Markdown, CSV formulas and Prometheus were
 * already escaped; the terminal was the one writer that was not.
 *
 * Filtered at the one place every line passes, the stream, rather than at each
 * of the hundreds of places that print.
 *
 * - Control characters are dropped, except tab and newline.
 * - ESC is dropped unless it opens a colour code (`ESC [ digits ; m`), which is
 *   the only sequence this CLI writes itself (`style.ts`). A colour code in the
 *   data survives too: it can colour text, and it cannot move the cursor, clear
 *   anything or retitle the window.
 * - On a terminal, the characters that reorder text (bidirectional overrides
 *   and isolates) are dropped as well. Piped output keeps them: JSON is data,
 *   and a label is whatever its author wrote.
 */

const COLOUR = /\u001b\[[0-9;]*m/y;
// C0 except tab (09) and newline (0a), DEL, C1.
const CONTROL = /[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f-\u009f]/g;
const REORDERING = /[؜‪-‮⁦-⁩]/g;

export function terminalSafe(text: string, options: { terminal: boolean }): string {
  let out = '';
  let from = 0;
  for (let i = text.indexOf('\u001b'); i !== -1; i = text.indexOf('\u001b', i + 1)) {
    COLOUR.lastIndex = i;
    if (COLOUR.test(text)) continue;
    out += text.slice(from, i);
    from = i + 1;
  }
  out += text.slice(from);
  out = out.replace(CONTROL, '');
  return options.terminal ? out.replace(REORDERING, '') : out;
}

/** Filter every string this stream is given, as `terminalSafe` says. */
export function guardStream(stream: NodeJS.WriteStream): void {
  const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
  stream.write = ((chunk: unknown, ...rest: unknown[]) =>
    write(typeof chunk === 'string' ? terminalSafe(chunk, { terminal: stream.isTTY === true }) : chunk, ...rest)) as typeof stream.write;
}

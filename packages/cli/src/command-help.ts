/**
 * The help for one command, cut from the help for all of them (#865).
 *
 * The README promises that `trazum <command> --help` explains that command's
 * flags. It printed the whole help, 1,332 lines, for every command but `task`.
 * The help already carries each command's flags in a section of its own
 * ("OPTIONS FOR bill", "OPCIONES DE bill"), so the answer is cut from it
 * rather than written a second time: one text, in every language, and a
 * section that cannot drift from the full help because it is the full help.
 *
 * What is cut: the command's lines from the usage section (with the lines that
 * continue them), every section whose heading ends in the command's name, and
 * a closing line saying where the rest is. A command that appears in neither
 * gets `undefined`, and the caller prints the whole help as before.
 */

/** A heading starts at column 0; everything under it is indented. */
const isHeading = (line: string): boolean => line.length > 0 && !/^\s/.test(line);

export function commandHelp(rendered: string, plain: string, command: string, more: string): string | undefined {
  const lines = plain.split('\n');
  const shown = rendered.split('\n');
  // Rendering only wraps words in escape codes, so the two have the same lines.
  if (lines.length !== shown.length) return undefined;

  const sections: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!isHeading(lines[i] ?? '')) continue;
    let end = i + 1;
    while (end < lines.length && !isHeading(lines[end] ?? '')) end += 1;
    sections.push({ start: i, end });
  }

  const opensWith = (line: string) => line === `  trazum ${command}` || line.startsWith(`  trazum ${command} `);
  // The usage section is the one with the most lines that open with `trazum`.
  const usage = sections.reduce<{ start: number; end: number } | undefined>((best, section) => {
    const count = (s: { start: number; end: number }) => lines.slice(s.start + 1, s.end).filter((line) => line.startsWith('  trazum ')).length;
    return best === undefined || count(section) > count(best) ? section : best;
  }, undefined);

  const out: string[] = [];
  if (usage !== undefined) {
    const picked: string[] = [];
    for (let i = usage.start + 1; i < usage.end; i += 1) {
      if (!opensWith(lines[i] ?? '')) continue;
      picked.push(shown[i] ?? '');
      // A long usage line continues on lines indented past the command.
      while (i + 1 < usage.end && /^ {3,}\S/.test(lines[i + 1] ?? '')) picked.push(shown[++i] ?? '');
    }
    if (picked.length > 0) out.push(shown[usage.start] ?? '', ...picked);
  }

  for (const section of sections) {
    if (section === usage) continue;
    const heading = lines[section.start] ?? '';
    if (!(heading.endsWith(` ${command}`) || heading === `trazum ${command}`)) continue;
    const body = shown.slice(section.start, section.end);
    while (body.length > 0 && (body[body.length - 1] ?? '').trim() === '') body.pop();
    if (out.length > 0) out.push('');
    out.push(...body);
  }

  if (out.length === 0) return undefined;
  return [...out, '', more].join('\n');
}

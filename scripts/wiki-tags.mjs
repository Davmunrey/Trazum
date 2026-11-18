/**
 * The `<div>` tags of a wiki page, paired. Its own module so that the test
 * can hand it a page: `build-wiki.mjs` writes files when it is loaded.
 */

/**
 * A section with its `<div>` tags paired.
 *
 * A section is cut out of a document by its heading, and a document may open
 * a `<div>` above the heading and close it inside the section, or the other
 * way round. The README does the first: its opening block is centred, so the
 * wiki's Home page ended on a `</div>` that closed nothing, from the day the
 * page was first built until 2026-11-18. A closing tag with nothing open is
 * dropped, and a tag still open at the end is closed. Code is left alone, in
 * a fence and in backticks on a line: a `<div>` in an example is text, and
 * counting it would close a tag for a sentence that only names one.
 */
export const withoutInlineCode = (line) => line.replace(/(`+)[^`\n]*?\1/g, '');

export function paired(text) {
  const kept = [];
  let open = 0;
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced) {
      const prose = withoutInlineCode(line);
      const opens = (prose.match(/<div\b[^>]*>/gi) ?? []).length;
      const closes = (prose.match(/<\/div\s*>/gi) ?? []).length;
      if (closes > open + opens && /^\s*<\/div\s*>\s*$/i.test(line)) continue;
      open = Math.max(0, open + opens - closes);
    }
    kept.push(line);
  }
  while (kept.length > 0 && kept.at(-1) === '' && kept.at(-2) === '') kept.pop();
  return kept.join('\n') + '\n</div>'.repeat(open);
}


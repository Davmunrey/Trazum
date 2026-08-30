import type { ProtectionKind, Segment } from './types.js';

/**
 * Splits the prompt into mutable and protected slices.
 *
 * Protected content is NEVER touched. Compressing a code block, a URL or a
 * template placeholder would break the prompt, and that is exactly the failure
 * that makes a prompt optimiser useless.
 */

interface PatternDef {
  kind: ProtectionKind;
  regex: RegExp;
  /**
   * Characters to trim from the end of a match. Needed for URLs: the full stop
   * in "see https://example.com/guide." belongs to the sentence, not the URL,
   * and protecting it leaves duplicated punctuation once the rest is cleaned.
   */
  trimTrailing?: RegExp;
}

// Order matters: the first pattern to match at a position wins.
const PATTERNS: PatternDef[] = [
  // Fenced code blocks with ``` or ~~~ (unclosed blocks run to the end).
  { kind: 'fenced-code', regex: /(?:```|~~~)[\s\S]*?(?:```|~~~|$)/g },
  /*
    Indented code blocks, which this file used to leave to the rules on the
    grounds that they are *"ambiguous in markdown"*. The ambiguity is real. The
    consequence of acting on it was not proportionate to it.

    **What the rules did to four lines of indented code**, at the aggressive
    level, every one measured rather than imagined:

      const label = "please keep";   ->  Const label = " keep";
      def run(x):                    ->  Def run(x):
      SELECT … WHERE note = 'please refund';  ->  … = ' refund';
      {"reason": "please cancel"}    ->  {"reason": " cancel"}

    Three separate failures at once. The indentation goes, which by itself
    makes the Python a syntax error. Keywords get sentence-capitalised, which
    makes the rest of them syntax errors. And **string literals are edited** —
    that SQL now matches a different value and that payload carries a different
    reason. The report says tokens were saved.

    The blank line before the block is what makes this checkable rather than a
    guess: CommonMark says an indented code block cannot interrupt a paragraph,
    so a run of indented lines after a blank line is code by the specification
    rather than by anybody's judgement here.

    **What it still gets wrong, stated rather than discovered later.** Content
    indented four or more spaces inside a deeply nested list is continuation,
    not code, and this protects it. That costs unsaved tokens in a rare shape.
    Not protecting code costs a broken prompt in a common one, and those are not
    the same kind of wrong.

    Every quantifier is bounded or consumes a whole line exactly once, for the
    reason the email mask below now carries in full.
  */
  {
    kind: 'indented-code',
    /*
      **The lookbehind requires real content before the blank line, and the
      fuzzer is why.** Its first version asked only for a blank line, which a
      document *beginning* with one satisfies — and `optimize` ends with a
      `.trim()` on the whole reassembled string, outside every mask, which then
      removes the leading newlines and the first line's indentation. The block
      stopped being a block, the second pass no longer protected it, and 54 of
      1,500 corpus inputs failed the idempotence property.

      The trim is fixed at its source now — `optimize` trims the *masked* string,
      where a protected span is a placeholder nothing can edit — so the mask can
      also claim a block at the very start of a document. It has to: at the
      aggressive level a rule can delete the sentence before the blank line, and
      a block that was protected on the first pass has to still be protected on
      the second or the output never settles.
    */
    regex: /(?<=\S[ \t]*\n[ \t]*\n)(?:(?: {4,}|\t)[^\n]*(?:\n|$))+/g,
  },
  { kind: 'url', regex: /\b(?:https?|ftp):\/\/[^\s<>"')\]]+/g, trimTrailing: /[.,;:!?]+$/ },
  /*
    Email addresses, for the reason at the top of this file.

    **Five of ten realistic addresses came out corrupted before this existed.**
    `please@example.com` became `@example.com`, and so did `thanks@`,
    `basically@`, `essentially.ops@` and `very.important@`: the politeness,
    filler and intensifier rules match the local part as ordinary prose and cut
    it out. What is left is not a wrong address, it is not an address — and the
    report says tokens were saved.

    That is the failure this module's own first paragraph names. A code block, a
    URL and a placeholder were on the list; the thing every support prompt in
    the world carries was not. `support@` and `no-reply@` survived, and
    `por.favor@ejemplo.es` survived only because the Spanish politeness entry is
    written with a space — luck, not design, which is what made it invisible.

    After the URL pattern so a `mailto:` link is claimed as a URL first, and
    trailing punctuation is trimmed for the same reason it is there: the full
    stop in "write to a@b.com." belongs to the sentence.
  */
  {
    kind: 'email',
    /*
      **Every quantifier here is bounded, and the first version of this was not.**
      The local part accepts `.`, so on a long dotted run with no `@` in it —
      a dotted run behind a scheme, which is a fixture in `security.test.js`
      for exactly this reason — an unbounded `+` matches the whole run from every starting
      position and then fails. Quadratic: **897ms on 40,008 characters**, and
      `optimize` runs this alongside every other pattern, which took the total
      past the 5-second cliff detector on a CI runner while passing on a faster
      machine. That test's own note had already recorded the lesson from the
      last time — *"quadratic until the label quantifiers were bounded"* — and
      this pattern arrived a week later without them.

      The bounds are RFC 5321's, not invented: 64 octets for a local part, 63
      for a domain label. The TLD's 24 is generous against the longest real one
      (`.travelersinsurance`, 19). Bounded, the same input takes **8ms**, and no
      address in the corpus is lost.
    */
    regex: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g,
    trimTrailing: /[.,;:!?]+$/,
  },
  // Template placeholders: {{var}}, {var}, ${var}, {% tag %}, <<VAR>>, %(var)s
  {
    kind: 'placeholder',
    regex:
      /\{\{[^{}]*\}\}|\{%[\s\S]*?%\}|\$\{[^{}]*\}|<<[A-Z0-9_]+>>|%\([^()]*\)[sdfr]|\{[A-Za-z_][A-Za-z0-9_.]*\}/g,
  },
  // Inline code spans.
  { kind: 'inline-code', regex: /`[^`\n]+`/g },
  // XML/HTML tags, heavily used to structure prompts.
  { kind: 'xml-tag', regex: /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*?)?\/?>/g },
];

interface Match {
  start: number;
  end: number;
  kind: ProtectionKind;
}

/** Splits the text into segments, marking what must not be modified. */
export function segment(text: string): Segment[] {
  /*
    Each pattern scans with the earlier patterns' ranges already reserved, and
    a match that overlaps a reservation restarts the scan **after the
    reservation** rather than after itself.

    The old version scanned every pattern over the whole text and dropped the
    overlaps afterwards, which loses more than the overlap: on
    ``` ``` `span` ``` ``` shapes, inline-code matched from the *third
    backtick of a closing fence* to the opening of the real span — an
    illegitimate match, later dropped — but its `lastIndex` had already
    advanced past the real span's opening backtick, so the legitimate match
    was never seen and the span was left mutable. A fuzzed corpus caught it:
    bait text inside a code span came out rewritten, with every mask believed
    to be on.
  */
  const kept: Match[] = [];

  for (const { kind, regex, trimTrailing } of PATTERNS) {
    const reserved = [...kept].sort((a, b) => a.start - b.start);
    const overlapping = (start: number, end: number): Match | undefined =>
      reserved.find((range) => start < range.end && end > range.start);

    // Copy the regex so lastIndex is not shared between calls.
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let matched = m[0];
      if (matched.length === 0) {
        re.lastIndex++;
        continue;
      }
      if (trimTrailing) matched = matched.replace(trimTrailing, '');
      if (matched.length === 0) continue;
      const start = m.index;
      const end = start + matched.length;
      const hit = overlapping(start, end);
      if (hit !== undefined) {
        // Not simply skipped: the scan resumes where the reservation ends, so
        // a legitimate match sitting just past it is still found.
        re.lastIndex = Math.max(hit.end, start + 1);
        continue;
      }
      kept.push({ start, end, kind });
    }
  }

  // Order for emission; within one pattern matches never overlap, and across
  // patterns the reservation check above already guaranteed it.
  kept.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let pos = 0;
  for (const match of kept) {
    if (match.start > pos) {
      segments.push({ kind: 'mutable', text: text.slice(pos, match.start) });
    }
    segments.push({
      kind: 'protected',
      protection: match.kind,
      text: text.slice(match.start, match.end),
    });
    pos = match.end;
  }
  if (pos < text.length) {
    segments.push({ kind: 'mutable', text: text.slice(pos) });
  }

  return segments;
}

/** Joins segments back into a single string. */
export function join(segments: Segment[]): string {
  return segments.map((s) => s.text).join('');
}

/** Returns only the text of the protected segments, in order. */
export function protectedTexts(segments: Segment[]): string[] {
  return segments.filter((s) => s.kind === 'protected').map((s) => s.text);
}

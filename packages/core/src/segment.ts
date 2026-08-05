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
  // Indented blocks of 4+ spaces are left to the rules: they are ambiguous in markdown.
  { kind: 'url', regex: /\b(?:https?|ftp):\/\/[^\s<>"')\]]+/g, trimTrailing: /[.,;:!?]+$/ },
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
  const matches: Match[] = [];

  for (const { kind, regex, trimTrailing } of PATTERNS) {
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
      matches.push({ start: m.index, end: m.index + matched.length, kind });
    }
  }

  // Sort by start and, on a tie, longest span first.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop overlaps, keeping the first match at each position.
  const kept: Match[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }

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

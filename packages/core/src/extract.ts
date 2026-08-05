/**
 * Prompts embedded in source files.
 *
 * `check` and `diff` read `.txt`, `.md`, `.prompt` and `.tmpl`. Real prompts live
 * in TypeScript template literals, Python triple-quoted strings and YAML blocks,
 * so adopting Trazum has meant first refactoring them out into standalone files —
 * a change to somebody's application as the price of admission.
 *
 * **It reads a marker, it does not guess.** `// trazum:prompt` on the line before
 * the literal, and then the literal by delimiter matching. Guessing which string
 * in a file is a prompt is a heuristic, and a heuristic inside a tool used as a
 * CI gate produces failures on strings nobody meant to govern. A marker is one
 * line of noise in exchange for never being wrong about what it picked up.
 *
 * **Interpolation already works and is not a special case.** `${x}` inside a
 * template literal is exactly the placeholder shape `segment.ts` protects, so an
 * embedded prompt gets the same cache-prefix analysis, the same protection from
 * the rules, and the same `--reorder` treatment as a `{{x}}` template. Nothing
 * here has to know about it.
 *
 * **The honest limit:** a prompt assembled from concatenated pieces cannot be
 * read this way. `` `You are ${role}.` + rules.join('\n') `` is a prompt whose
 * text does not exist until it runs. This module declines it and says so rather
 * than governing the half it can see — a budget enforced against a fragment is a
 * green build for a prompt nobody measured.
 *
 * Scanned character by character rather than with a regex. The module it most
 * resembles shipped two quadratic patterns this week, and delimiter matching over
 * untrusted source is exactly the shape that goes wrong.
 */

export interface ExtractedPrompt {
  /** Name from `trazum:prompt <name>`, or undefined when the marker was bare. */
  name?: string;
  /** 1-based line of the marker comment, which is what an error should cite. */
  line: number;
  /** The prompt text, delimiters removed and escapes resolved. */
  text: string;
  /** The delimiter it was written with, so a writer could put it back. */
  quote: '`' | '"' | "'" | '"""' | "'''";
  /** Offsets of the text within the source, exclusive of the delimiters. */
  start: number;
  end: number;
}

export interface DeclinedPrompt {
  line: number;
  /**
   * Why this marker produced nothing.
   *
   * `concatenated` is the interesting one: the text exists only at runtime.
   * `no-literal` means the marker was not followed by a string at all.
   * `unterminated` means the file ends inside the literal, which is a syntax
   * error in the source rather than a Trazum problem, but worth naming.
   */
  reason: 'concatenated' | 'no-literal' | 'unterminated';
  detail: string;
}

export interface ExtractionResult {
  prompts: ExtractedPrompt[];
  declined: DeclinedPrompt[];
}

/** The marker, in the comment syntaxes that cover the languages prompts live in. */
const MARKERS = ['//', '#', '--', '<!--'];
const TAG = 'trazum:prompt';

/**
 * Both ways an HTML comment can close.
 *
 * `--!>` is the "comment end bang" the HTML parser also accepts, and stripping
 * only `-->` put it in the name: `<!-- trazum:prompt greeting--!>` produced the
 * name `greeting--!>`. Found by CodeQL, which is the second time this week a
 * pattern has been right about the case in front of it and wrong about the one
 * beside it.
 */
const COMMENT_CLOSE = /--!?>\s*$/;

/**
 * What a name may be.
 *
 * An identifier charset rather than "whatever is left on the line". The name
 * flows into `promptId`, which is printed in reports and matched against the
 * budget patterns in `trazum.config.json` — a name is an identifier, and letting
 * it be arbitrary text is how a stray terminator became part of one above. A
 * candidate that does not fit falls back to the `file:line` form, which always
 * works.
 */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * How far past the marker a literal may start.
 *
 * A prompt is expected on the next line or two — `const SYSTEM = \`` and the
 * occasional type annotation. Scanning further would let a marker attach itself
 * to an unrelated string much later in the file, which is the false positive this
 * design exists to avoid.
 */
const MAX_GAP_LINES = 3;

/**
 * A forward-only line counter.
 *
 * Markers are found in increasing order, so each character is counted once
 * across the whole scan. Recomputing the line by counting from zero at every
 * marker is the obvious version and is quadratic in the number of markers —
 * 15.5 seconds on a file of 20,000 of them, which the hostile-input tests
 * caught before this shipped.
 */
function lineCounter(source: string): (offset: number) => number {
  let seen = 0;
  let line = 1;
  return (offset) => {
    for (; seen < offset && seen < source.length; seen++) {
      if (source[seen] === '\n') line++;
    }
    return line;
  };
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  '"': '"',
  "'": "'",
  '`': '`',
  '0': '\0',
};

/**
 * Reads a string literal starting at `start`, which must be its opening quote.
 *
 * Returns the resolved text and the offset just past the closing delimiter, or
 * null when the literal never closes. Escapes are resolved for single- and
 * double-quoted strings, where `\n` is one newline written as two characters;
 * backtick and triple-quoted literals carry their newlines literally and only
 * need the delimiter itself unescaped.
 */
function readLiteral(
  source: string,
  start: number,
): { text: string; quote: ExtractedPrompt['quote']; end: number; textStart: number } | null {
  const triple = source.slice(start, start + 3);
  const quote: ExtractedPrompt['quote'] | null =
    triple === '"""' || triple === "'''"
      ? (triple as '"""' | "'''")
      : source[start] === '`' || source[start] === '"' || source[start] === "'"
        ? (source[start] as '`' | '"' | "'")
        : null;
  if (quote === null) return null;

  const raw = quote === '`' || quote.length === 3;
  const textStart = start + quote.length;
  let out = '';
  let i = textStart;

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === '\\') {
      const next = source[i + 1];
      if (next === undefined) break;
      // In a raw literal only the delimiter and the backslash itself are
      // escapes; `\n` there is a literal backslash followed by an n, and
      // resolving it would invent a newline the prompt does not contain.
      if (raw) {
        out += next === quote[0] || next === '\\' ? next : `\\${next}`;
      } else {
        out += ESCAPES[next] ?? `\\${next}`;
      }
      i += 2;
      continue;
    }

    if (source.startsWith(quote, i)) {
      return { text: out, quote, end: i + quote.length, textStart };
    }

    // A single-quoted or double-quoted literal cannot span lines. Stopping here
    // rather than running to the end of the file is what keeps a missing quote
    // from swallowing the rest of the source.
    if (quote.length === 1 && quote !== '`' && ch === '\n') return null;

    out += ch;
    i++;
  }

  return null;
}

/** Whether the expression continues past the literal with a concatenation. */
function isConcatenated(source: string, end: number): boolean {
  let i = end;
  while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
  // `+` in JS/TS, `.` in PHP-ish sources, and a bare newline followed by `+` is
  // the wrapped form of the same thing. A trailing comma or semicolon is not.
  if (source[i] === '+') return true;
  if (source[i] === '\n') {
    let j = i + 1;
    while (j < source.length && /[ \t\n]/.test(source[j]!)) j++;
    return source[j] === '+';
  }
  return false;
}

/**
 * Finds every marked prompt in a source file.
 *
 * Returns what it found and what it refused, because a marker that produced
 * nothing is the case the author most needs to hear about: they asked for the
 * prompt to be governed and it is not being governed.
 */
export function extractPrompts(source: string): ExtractionResult {
  const prompts: ExtractedPrompt[] = [];
  const declined: DeclinedPrompt[] = [];

  const lineAt = lineCounter(source);

  let cursor = 0;
  while (cursor < source.length) {
    const at = source.indexOf(TAG, cursor);
    if (at === -1) break;
    cursor = at + TAG.length;

    // The tag has to be inside a comment. Without this, the string 'trazum:prompt'
    // appearing in a prompt's own text would mark the prompt after it.
    const lineStart = source.lastIndexOf('\n', at) + 1;
    const before = source.slice(lineStart, at).trimStart();
    if (!MARKERS.some((m) => before.startsWith(m))) continue;

    const markerLine = lineAt(at);

    // The rest of the marker line is an optional name: `trazum:prompt greeting`.
    const lineEnd = source.indexOf('\n', at);
    const rest = source.slice(cursor, lineEnd === -1 ? source.length : lineEnd);
    const candidate = rest.replace(COMMENT_CLOSE, '').trim().split(/\s+/)[0] ?? '';
    const name = NAME.test(candidate) ? candidate : undefined;

    // Scan forward for the opening delimiter, bounded so a marker cannot adopt
    // a string much further down the file.
    let i = lineEnd === -1 ? source.length : lineEnd + 1;
    let lines = 0;
    let opened: ReturnType<typeof readLiteral> = null;
    let openAt = -1;

    while (i < source.length && lines <= MAX_GAP_LINES) {
      const ch = source[i]!;
      if (ch === '\n') {
        lines++;
        i++;
        continue;
      }
      if (ch === '`' || ch === '"' || ch === "'") {
        openAt = i;
        opened = readLiteral(source, i);
        break;
      }
      i++;
    }

    if (openAt === -1) {
      declined.push({
        line: markerLine,
        reason: 'no-literal',
        detail: `no string literal within ${MAX_GAP_LINES} lines of the marker`,
      });
      continue;
    }
    if (opened === null) {
      declined.push({
        line: markerLine,
        reason: 'unterminated',
        detail: 'the literal is never closed',
      });
      continue;
    }
    if (isConcatenated(source, opened.end)) {
      declined.push({
        line: markerLine,
        reason: 'concatenated',
        detail:
          'the prompt is built by concatenation, so its text does not exist until it runs',
      });
      cursor = opened.end;
      continue;
    }

    prompts.push({
      name,
      line: markerLine,
      text: opened.text,
      quote: opened.quote,
      start: opened.textStart,
      end: opened.end - opened.quote.length,
    });
    cursor = opened.end;
  }

  return { prompts, declined };
}

/**
 * A stable identifier for an embedded prompt, for budgets and reports.
 *
 * `src/prompts.ts#support` when the marker was named, `src/prompts.ts:12` when it
 * was not. Both are path-prefixed so the glob patterns in `trazum.config.json`
 * cover embedded prompts without learning a new syntax — `src/**` matches either.
 */
export function promptId(path: string, prompt: ExtractedPrompt): string {
  return prompt.name ? `${path}#${prompt.name}` : `${path}:${prompt.line}`;
}

/** Whether a file is worth opening for extraction at all. */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.php',
  '.yaml',
  '.yml',
];

/** Cheap pre-filter: a source file with no marker has nothing to extract. */
export const hasMarker = (source: string): boolean => source.includes(TAG);

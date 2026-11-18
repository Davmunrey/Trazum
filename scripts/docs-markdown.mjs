/**
 * A small Markdown reader for the documents this repository publishes on its
 * own site, and nothing else.
 *
 * ## Why this is written here and not installed
 *
 * The site publishes about forty documents the repository already keeps. They
 * use a narrow part of Markdown: headings, paragraphs, lists, tables, fenced
 * code, inline code, links, emphasis, quotes, images, and a handful of HTML
 * tags that GitHub draws (a centred block, a disclosure, a picture). A
 * general-purpose renderer carries the rest of the language, and with it a
 * way for a document to put a `<script>` or an `onerror` on a page. This one
 * has no such path: it builds a tree of plain data, the tree is drawn by
 * React, which escapes every string, and the only attributes that can carry
 * an address (`href`, `src`) pass through `safeHref` and `safeSrc` in
 * `apps/web/lib/docs/safe.ts`, in the build and again in the renderer.
 *
 * ## What it does with a construct it does not know
 *
 * It stops, and names the file and the line. A page that renders a construct
 * wrongly is worse than a build that fails, because nobody reads the page
 * twice to check. Raw HTML is the case that matters most: only the tags in
 * `BLOCK_TAGS` and `INLINE_TAGS` are understood, each with the attributes it
 * is known by; any other tag, or any other attribute, is `UnknownConstruct`.
 * `onUnknown: 'escape'` turns the failure into literal text instead, which is
 * what the hostile-input test uses to show that what a document says can only
 * ever become text.
 *
 * The block rules follow CommonMark and the table rule follows GitHub's, to
 * the extent the corpus uses them; `docs.test.mjs` runs every published
 * document through it, and a document using more than that fails there.
 *
 * ## Anchors
 *
 * `githubSlugger` gives every heading the address GitHub gives it, so a link
 * written for the document on GitHub (`commands.md#token-counting`) lands on
 * the same heading here.
 */

export class UnknownConstruct extends Error {
  /** @param {string} message @param {{ file: string, line: number }} where */
  constructor(message, where) {
    super(`${where.file}:${where.line}: ${message}`);
    this.name = 'UnknownConstruct';
    this.file = where.file;
    this.line = where.line;
  }
}

/* ------------------------------------------------------------------ */
/* Anchors                                                            */
/* ------------------------------------------------------------------ */

/**
 * The text GitHub builds a heading's address from, as a string.
 * @param {readonly Inline[]} nodes
 * @returns {string}
 */
export function inlineText(nodes) {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') out += node;
    else if (node.t === 'code') out += node.v;
    else if (node.t === 'br') out += ' ';
    else if (node.t === 'img') out += '';
    else if (node.t === 'anchor') out += '';
    else if (node.c) out += inlineText(node.c);
  }
  return out;
}

/**
 * GitHub's rule for a heading's address: lower-case it, drop everything that
 * is not a letter, mark, number, connector, hyphen or space, turn each space
 * into a hyphen, and number a repeat (`-1`, `-2`) in the order they come.
 *
 * Stateful on purpose: one slugger per document, headings fed in order.
 */
export function githubSlugger() {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return {
    /** @param {string} text */
    slug(text) {
      const base = text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
      let slug = base;
      while (seen.has(slug)) {
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        slug = `${base}-${count + 1}`;
        if (!seen.has(slug)) break;
      }
      if (!seen.has(base)) seen.set(base, 0);
      seen.set(slug, seen.get(slug) ?? 0);
      return slug;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {string | { t: 'code', v: string }
 *   | { t: 'em' | 'strong' | 'del' | 'sub' | 'sup' | 'kbd', c: Inline[] }
 *   | { t: 'a', href: string, title?: string, ext?: boolean, c: Inline[] }
 *   | { t: 'img', src: string, alt: string, w?: number, h?: number }
 *   | { t: 'br' }
 *   | { t: 'anchor', id: string }} Inline
 *
 * @typedef {{ c: Block[] }} Item
 *
 * @typedef {{ t: 'h', depth: number, id: string, c: Inline[] }
 *   | { t: 'p', c: Inline[] }
 *   | { t: 'ul', tight: boolean, c: Item[] }
 *   | { t: 'ol', tight: boolean, start: number, c: Item[] }
 *   | { t: 'code', lang: string, v: string }
 *   | { t: 'quote', c: Block[] }
 *   | { t: 'table', align: (string | null)[], head: Inline[][], rows: Inline[][][] }
 *   | { t: 'hr' }
 *   | { t: 'center', c: Block[] }
 *   | { t: 'details', summary: Inline[], c: Block[] }
 *   | { t: 'picture', dark: string, src: string, alt: string, w?: number }
 *   | { t: 'anchor', id: string }} Block
 */

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ text: string, line: number }} Line
 * @typedef {{ file: string, onUnknown: 'throw' | 'escape' }} Ctx
 */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: String.fromCharCode(0x2014),
  ndash: '–',
  hellip: '…',
  rarr: '→',
  larr: '←',
  times: '×',
  middot: '·',
  copy: '©',
};

/** What an HTML block may open and close, with the attributes each is known by. */
const BLOCK_TAGS = new Set(['div', 'details', 'summary', 'picture', 'source', 'img', 'a']);
/** What may appear inside a paragraph. */
const INLINE_TAGS = new Set(['sub', 'sup', 'kbd', 'br', 'a', 'img']);

const ASCII_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** HTML block-level tag names that begin an HTML block (CommonMark type 6), the ones the corpus could meet. */
const TYPE6 = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details',
  'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main',
  'menu', 'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'section', 'summary', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
]);

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\n]*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST_ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])( +|\t|$)/;
const QUOTE = /^ {0,3}>/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const REF_DEF = /^ {0,3}\[[^\]\n]+\]:[ \t]*\S/;
const BLANK = /^[ \t]*$/;

/** Blocks that had a blank line before them, which is what makes a list loose. */
const gapped = new WeakSet();

/**
 * @param {string} message
 * @param {Ctx} ctx
 * @param {number} line
 */
function unknown(message, ctx, line) {
  return new UnknownConstruct(message, { file: ctx.file, line });
}

/** The first non-blank indent of a line, tabs as four columns. */
function indentOf(text) {
  let n = 0;
  for (const ch of text) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4 - (n % 4);
    else break;
  }
  return n;
}

/** A line with `n` columns of leading whitespace removed. */
function stripIndent(text, n) {
  let cols = 0;
  let i = 0;
  while (i < text.length && cols < n) {
    if (text[i] === ' ') cols += 1;
    else if (text[i] === '\t') {
      const next = cols + (4 - (cols % 4));
      if (next > n) break;
      cols = next;
    } else break;
    i += 1;
  }
  return text.slice(i);
}

/** The HTML tag a line starts a block with, or `null`. */
function htmlBlockStart(text, inParagraph) {
  const t = text.replace(/^ {0,3}/, '');
  if (!t.startsWith('<')) return null;
  if (t.startsWith('<!--')) return 'comment';
  const open = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/.exec(t);
  if (open === null) return null;
  const name = open[1].toLowerCase();
  if (TYPE6.has(name)) return 'block';
  if (inParagraph) return null;
  // Type 7: a complete open or closing tag alone on the line.
  if (/^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>\s*$/.test(t)) {
    return 'block';
  }
  return null;
}

/** Does this line begin a block that ends a paragraph? */
function interruptsParagraph(text) {
  if (FENCE.test(text)) return true;
  if (ATX.test(text)) return true;
  if (HR.test(text)) return true;
  if (QUOTE.test(text)) return true;
  const item = LIST_ITEM.exec(text);
  if (item !== null) {
    const rest = text.slice(item[0].length);
    // An empty item cannot interrupt, and an ordered one must start at 1.
    if (rest.trim() === '') return false;
    if (/^\d/.test(item[2]) && !/^1[.)]$/.test(item[2])) return false;
    return true;
  }
  return htmlBlockStart(text, true) !== null;
}

/**
 * Split a table row into cells at each pipe that is not escaped, dropping
 * the empty edge cells a leading or trailing pipe makes.
 * @param {string} row
 */
function splitRow(row) {
  const text = row.trim();
  const cells = [];
  let cell = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && !text.endsWith('\\|')) cells.pop();
  return cells.map((c) => c.trim());
}

/**
 * Parse a list of lines into blocks.
 * @param {Line[]} lines
 * @param {Ctx} ctx
 * @returns {Block[]}
 */
function parseBlocks(lines, ctx) {
  /** @type {(Block | { t: 'open', kind: string, summary?: Inline[], line: number } | { t: 'close', kind: string, line: number })[]} */
  const out = [];
  // Every block remembers whether a blank line came before it: that is what
  // `parseList` reads to tell a tight list from a loose one.
  let blank = false;
  const append = out.push.bind(out);
  out.push = (...nodes) => {
    for (const node of nodes) if (blank) gapped.add(node);
    blank = false;
    return append(...nodes);
  };
  let i = 0;
  while (i < lines.length) {
    const { text, line } = lines[i];
    if (BLANK.test(text)) {
      blank = true;
      i += 1;
      continue;
    }

    // Fenced code.
    const fence = FENCE.exec(text);
    if (fence !== null && !(fence[2][0] === '`' && fence[3].includes('`'))) {
      const indent = fence[1].length;
      const marker = fence[2];
      const body = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i].text);
        if (close !== null && close[1][0] === marker[0] && close[1].length >= marker.length) {
          closed = true;
          i += 1;
          break;
        }
        body.push(stripIndent(lines[i].text, indent));
        i += 1;
      }
      if (!closed && ctx.onUnknown !== 'escape') {
        // An unclosed fence runs to the end of its container, which in a
        // document is almost always a mistake worth hearing about.
        throw unknown('a fenced code block is never closed', ctx, line);
      }
      out.push({ t: 'code', lang: fence[3].trim().split(/\s+/)[0] ?? '', v: body.join('\n') });
      continue;
    }

    // Headings.
    const atx = ATX.exec(text);
    if (atx !== null) {
      out.push({ t: 'h', depth: atx[1].length, id: '', c: parseInline((atx[2] ?? '').trim(), ctx, line) });
      i += 1;
      continue;
    }

    // Thematic break (before lists: `* * *` and `- - -` are rules).
    if (HR.test(text)) {
      out.push({ t: 'hr' });
      i += 1;
      continue;
    }

    // Block quote.
    if (QUOTE.test(text)) {
      const inner = [];
      while (i < lines.length) {
        const here = lines[i];
        if (QUOTE.test(here.text)) {
          inner.push({ text: here.text.replace(/^ {0,3}> ?/, ''), line: here.line });
          i += 1;
        } else if (!BLANK.test(here.text) && inner.length > 0 && !BLANK.test(inner[inner.length - 1].text) && !interruptsParagraph(here.text)) {
          inner.push(here);
          i += 1;
        } else break;
      }
      out.push({ t: 'quote', c: parseBlocks(inner, ctx) });
      continue;
    }

    // Lists.
    if (LIST_ITEM.test(text)) {
      const result = parseList(lines, i, ctx);
      out.push(result.block);
      i = result.next;
      continue;
    }

    // HTML.
    const html = htmlBlockStart(text, false);
    if (html !== null) {
      const body = [];
      if (html === 'comment') {
        while (i < lines.length) {
          body.push(lines[i].text);
          i += 1;
          if (body[body.length - 1].includes('-->')) break;
        }
        // A comment is invisible: the corpus uses them as markers.
        continue;
      }
      const first = line;
      while (i < lines.length && !BLANK.test(lines[i].text)) {
        body.push(lines[i].text);
        i += 1;
      }
      out.push(...parseHtmlBlock(body.join('\n'), ctx, first));
      continue;
    }

    // Link reference definitions are a construct the documents do not use.
    if (REF_DEF.test(text)) throw unknown('a link reference definition', ctx, line);

    // Tables.
    if (text.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1].text) && lines[i + 1].text.includes('-')) {
      const head = splitRow(text);
      const delim = splitRow(lines[i + 1].text);
      if (head.length === delim.length) {
        const align = delim.map((cell) => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
        });
        const rows = [];
        let j = i + 2;
        while (j < lines.length && !BLANK.test(lines[j].text) && lines[j].text.includes('|') && !interruptsParagraph(lines[j].text)) {
          const cells = splitRow(lines[j].text);
          while (cells.length < head.length) cells.push('');
          rows.push(cells.slice(0, head.length).map((c) => parseInline(c, ctx, lines[j].line)));
          j += 1;
        }
        out.push({ t: 'table', align, head: head.map((c) => parseInline(c, ctx, line)), rows });
        i = j;
        continue;
      }
    }

    // Indented code.
    if (indentOf(text) >= 4) {
      const body = [];
      while (i < lines.length && (BLANK.test(lines[i].text) || indentOf(lines[i].text) >= 4)) {
        body.push(stripIndent(lines[i].text, 4));
        i += 1;
      }
      while (body.length > 0 && BLANK.test(body[body.length - 1])) body.pop();
      out.push({ t: 'code', lang: '', v: body.join('\n') });
      continue;
    }

    // Paragraph, or a setext heading.
    const para = [];
    let setext = 0;
    while (i < lines.length && !BLANK.test(lines[i].text)) {
      const here = lines[i];
      if (para.length > 0) {
        const underline = SETEXT.exec(here.text);
        if (underline !== null) {
          setext = underline[1][0] === '=' ? 1 : 2;
          i += 1;
          break;
        }
        if (interruptsParagraph(here.text)) break;
        if (here.text.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1].text) && lines[i + 1].text.includes('-') && para.length > 0) break;
      }
      para.push(here);
      i += 1;
    }
    const joined = para.map((l) => l.text.replace(/^[ \t]+/, '')).join('\n');
    if (setext > 0) {
      if (para.length > 1) {
        throw unknown(
          `a paragraph of ${para.length} lines is followed by a line of ${setext === 1 ? '=' : '-'}, which CommonMark reads as a heading; a blank line before it makes it a rule`,
          ctx,
          para[0].line,
        );
      }
      out.push({ t: 'h', depth: setext, id: '', c: parseInline(joined.trim(), ctx, para[0].line) });
    } else {
      const inline = parseInline(joined.replace(/[ \t]+$/, ''), ctx, para[0].line);
      // A paragraph of nothing but anchors is the anchors, not an empty paragraph.
      if (inline.every((node) => (typeof node === 'string' ? node.trim() === '' : node.t === 'anchor'))) {
        for (const node of inline) if (typeof node !== 'string') out.push({ t: 'anchor', id: node.id });
      } else out.push({ t: 'p', c: inline });
    }
  }
  return foldHtml(out, ctx);
}

/**
 * Turn the open and close markers an HTML block left into the containers
 * they bound.
 * @param {any[]} flat
 * @param {Ctx} ctx
 * @returns {Block[]}
 */
function foldHtml(flat, ctx) {
  /** @type {{ kind: string, summary?: Inline[], line: number, c: Block[] }[]} */
  const stack = [{ kind: 'root', line: 0, c: [] }];
  for (const node of flat) {
    const top = stack[stack.length - 1];
    if (node.t === 'open') {
      stack.push({ kind: node.kind, summary: node.summary, line: node.line, c: [] });
    } else if (node.t === 'close') {
      if (top.kind !== node.kind || stack.length === 1) {
        if (ctx.onUnknown === 'escape') {
          top.c.push({ t: 'p', c: [`</${node.kind === 'center' ? 'div' : node.kind}>`] });
          continue;
        }
        throw unknown(`</${node.kind === 'center' ? 'div' : node.kind}> closes nothing that was opened here`, ctx, node.line);
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      parent.c.push(
        top.kind === 'details' ? { t: 'details', summary: top.summary ?? [], c: top.c } : { t: 'center', c: top.c },
      );
    } else top.c.push(node);
  }
  while (stack.length > 1) {
    const open = /** @type {NonNullable<typeof stack[number]>} */ (stack.pop());
    if (ctx.onUnknown !== 'escape') throw unknown(`<${open.kind === 'center' ? 'div' : open.kind}> is never closed`, ctx, open.line);
    // Escaping: what was opened is not a container, only the words it held.
    stack[stack.length - 1].c.push({ t: 'p', c: [`<${open.kind === 'center' ? 'div' : open.kind}>`] }, ...open.c);
  }
  return stack[0].c;
}

/**
 * Read the attributes of one tag, refusing any it is not known by.
 * @param {string} tag @param {string} source @param {readonly string[]} allowed
 * @param {Ctx} ctx @param {number} line
 */
function attributes(tag, source, allowed, ctx, line) {
  /** @type {Record<string, string>} */
  const found = {};
  const rest = source.replace(/\s*\/?$/, '');
  const re = /\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  let consumed = 0;
  for (let m = re.exec(rest); m !== null; m = re.exec(rest)) {
    const name = m[1].toLowerCase();
    if (!allowed.includes(name)) throw unknown(`<${tag}> with an attribute this reader does not know: ${name}`, ctx, line);
    found[name] = m[2] ?? m[3] ?? m[4] ?? '';
    consumed = re.lastIndex;
  }
  if (consumed !== rest.length) throw unknown(`<${tag}> with attributes this reader cannot read`, ctx, line);
  return found;
}

/**
 * The blocks an HTML block stands for, or its text when `escape` is on.
 * @param {string} body @param {Ctx} ctx @param {number} firstLine
 */
function parseHtmlBlock(body, ctx, firstLine) {
  /** @type {any[]} */
  const out = [];
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/y;
  let pos = 0;
  const lineAt = (offset) => firstLine + (body.slice(0, offset).match(/\n/g) ?? []).length;
  const fail = (message, offset) => {
    if (ctx.onUnknown === 'escape') {
      out.push({ t: 'p', c: [body.trim()] });
      return null;
    }
    throw unknown(message, ctx, lineAt(offset));
  };
  while (pos < body.length) {
    const lt = body.indexOf('<', pos);
    const between = body.slice(pos, lt === -1 ? body.length : lt);
    if (between.trim() !== '') {
      if (fail(`text inside an HTML block: ${between.trim().slice(0, 40)}`, pos) === null) return out;
    }
    if (lt === -1) break;
    if (body.startsWith('<!--', lt)) {
      const end = body.indexOf('-->', lt);
      pos = end === -1 ? body.length : end + 3;
      continue;
    }
    tag.lastIndex = lt;
    const m = tag.exec(body);
    if (m === null) {
      if (fail('an HTML tag this reader cannot read', lt) === null) return out;
      break;
    }
    pos = tag.lastIndex;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const line = lineAt(lt);
    if (!BLOCK_TAGS.has(name)) {
      if (fail(`the HTML tag <${name}>, which this reader does not draw`, lt) === null) return out;
      break;
    }
    try {
      if (name === 'div') {
        if (closing) out.push({ t: 'close', kind: 'center', line });
        else {
          const a = attributes('div', m[3], ['align'], ctx, line);
          if (a.align !== 'center') throw unknown('a <div> that is not align="center"', ctx, line);
          out.push({ t: 'open', kind: 'center', line });
        }
      } else if (name === 'details') {
        if (closing) out.push({ t: 'close', kind: 'details', line });
        else {
          attributes('details', m[3], [], ctx, line);
          // The summary, if it follows, is the disclosure's label.
          const rest = body.slice(pos);
          const sm = /^\s*<summary>([\s\S]*?)<\/summary>/.exec(rest);
          let summary = [];
          if (sm !== null) {
            summary = parseInline(sm[1].replace(/\s+/g, ' ').trim(), ctx, line);
            pos += sm[0].length;
          }
          out.push({ t: 'open', kind: 'details', summary, line });
        }
      } else if (name === 'a') {
        if (closing) throw unknown('a stray </a>', ctx, line);
        const a = attributes('a', m[3], ['id', 'name'], ctx, line);
        const id = a.id ?? a.name;
        const end = /^\s*<\/a>/.exec(body.slice(pos));
        if (id === undefined || end === null) throw unknown('an <a> in a block that is not an empty anchor', ctx, line);
        pos += end[0].length;
        out.push({ t: 'anchor', id });
      } else if (name === 'picture') {
        if (closing) throw unknown('a stray </picture>', ctx, line);
        const close = body.indexOf('</picture>', pos);
        if (close === -1) throw unknown('<picture> is never closed', ctx, line);
        const inner = body.slice(pos, close);
        pos = close + '</picture>'.length;
        const source = /<source\b([^>]*)>/.exec(inner);
        const img = /<img\b([^>]*)>/.exec(inner);
        if (source === null || img === null) throw unknown('a <picture> without a <source> and an <img>', ctx, line);
        const s = attributes('source', source[1], ['media', 'srcset'], ctx, line);
        const i = attributes('img', img[1], ['src', 'alt', 'width', 'height'], ctx, line);
        if (!/prefers-color-scheme:\s*dark/.test(s.media ?? '')) throw unknown('a <source> that is not the dark scheme', ctx, line);
        out.push({
          t: 'picture',
          dark: s.srcset ?? '',
          src: i.src ?? '',
          alt: i.alt ?? '',
          ...(i.width ? { w: Number(i.width) } : {}),
        });
      } else if (name === 'img') {
        if (closing) throw unknown('a stray </img>', ctx, line);
        const a = attributes('img', m[3], ['src', 'alt', 'width', 'height'], ctx, line);
        out.push({ t: 'p', c: [{ t: 'img', src: a.src ?? '', alt: a.alt ?? '', ...(a.width ? { w: Number(a.width) } : {}) }] });
      } else {
        throw unknown(`<${name}> where this reader does not expect it`, ctx, line);
      }
    } catch (error) {
      if (ctx.onUnknown === 'escape' && error instanceof UnknownConstruct) {
        out.push({ t: 'p', c: [body.trim()] });
        return out;
      }
      throw error;
    }
  }
  return out;
}

/**
 * One list, starting at `start`, and the index after it.
 *
 * An item owns every following line that is indented to its content, every
 * blank line that is followed by such a line, and a lazy continuation: an
 * unindented line that carries on the paragraph above it. What it owns is
 * parsed again as blocks of its own, which is how a fence or a second list
 * inside an item needs no rule of its own.
 * @param {Line[]} lines @param {number} start @param {Ctx} ctx
 */
function parseList(lines, start, ctx) {
  const first = /** @type {RegExpExecArray} */ (LIST_ITEM.exec(lines[start].text));
  const ordered = /\d/.test(first[2]);
  const delimiter = ordered ? first[2].slice(-1) : first[2];
  const startNumber = ordered ? Number.parseInt(first[2], 10) : 1;
  const sameList = (m) => (ordered ? /\d/.test(m[2]) && m[2].slice(-1) === delimiter : m[2] === delimiter);
  /** @type {Line[][]} */
  const items = [];
  let betweenItems = false;
  let i = start;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i].text);
    if (m === null || HR.test(lines[i].text) || !sameList(m)) break;
    const markerWidth = m[1].length + m[2].length;
    const rest = lines[i].text.slice(m[0].length);
    const spaces = m[3] === '\t' ? 4 : m[3].length;
    let offset;
    let firstText;
    if (rest.trim() === '') {
      offset = markerWidth + 1;
      firstText = '';
    } else if (spaces >= 5) {
      offset = markerWidth + 1;
      firstText = ' '.repeat(spaces - 1) + rest;
    } else {
      offset = markerWidth + spaces;
      firstText = rest;
    }
    const content = [{ text: firstText, line: lines[i].line }];
    i += 1;
    let fence = FENCE.exec(firstText)?.[2] ?? null;
    let pendingBlank = 0;
    while (i < lines.length) {
      const here = lines[i];
      if (BLANK.test(here.text)) {
        pendingBlank += 1;
        i += 1;
        continue;
      }
      if (indentOf(here.text) >= offset) {
        for (let k = 0; k < pendingBlank; k += 1) content.push({ text: '', line: here.line });
        pendingBlank = 0;
        const stripped = stripIndent(here.text, offset);
        content.push({ text: stripped, line: here.line });
        const f = FENCE.exec(stripped);
        if (f !== null) {
          if (fence === null) fence = f[2];
          else if (f[2][0] === fence[0] && f[2].length >= fence.length && /^ {0,3}(`{3,}|~{3,})[ \t]*$/.test(stripped)) fence = null;
        }
        i += 1;
        continue;
      }
      // Less indented: a lazy continuation of a paragraph, or the end of the item.
      if (pendingBlank === 0 && fence === null && !interruptsParagraph(here.text) && !LIST_ITEM.test(here.text)) {
        const prev = content[content.length - 1].text;
        if (!BLANK.test(prev) && !FENCE.test(prev) && !ATX.test(prev) && !HR.test(prev) && !(prev.includes('|') && TABLE_DELIM.test(prev))) {
          content.push({ text: here.text.replace(/^[ \t]+/, ''), line: here.line });
          i += 1;
          continue;
        }
      }
      break;
    }
    items.push(content);
    if (pendingBlank > 0) {
      // Blank lines before another item of this list make it loose; before
      // anything else they end the list and belong to what follows.
      const next = lines[i];
      const nm = next === undefined ? null : LIST_ITEM.exec(next.text);
      if (nm === null || HR.test(next.text) || !sameList(nm)) break;
      betweenItems = true;
    }
  }
  const parsed = items.map((content) => parseBlocks(content, ctx));
  // Loose when items are parted by a blank line, or when one item's own
  // blocks are (a nested list's blank lines are the nested list's business).
  const loose = betweenItems || parsed.some((blocks) => blocks.slice(1).some((b) => gapped.has(b)));
  const c = parsed.map((blocks) => ({ c: blocks }));
  return {
    block: ordered ? { t: 'ol', tight: !loose, start: startNumber, c } : { t: 'ul', tight: !loose, c },
    next: i,
  };
}

/* ------------------------------------------------------------------ */
/* Inline                                                             */
/* ------------------------------------------------------------------ */

const isSpace = (ch) => ch === undefined || /\s/u.test(ch);
const isPunct = (ch) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

/**
 * @param {string} text @param {Ctx} ctx @param {number} line
 * @returns {Inline[]}
 */
function parseInline(text, ctx, line) {
  /** @type {any[]} */
  const items = [];
  let buf = '';
  const flush = () => {
    if (buf !== '') {
      items.push(buf);
      buf = '';
    }
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];

    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '\n') {
        flush();
        items.push({ t: 'br' });
        i += 2;
        while (text[i] === ' ' || text[i] === '\t') i += 1;
        continue;
      }
      if (next !== undefined && ASCII_PUNCT.test(next)) {
        buf += next;
        i += 2;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === '`') {
      let k = i;
      while (text[k] === '`') k += 1;
      const run = k - i;
      let j = k;
      let end = -1;
      while (j < n) {
        if (text[j] === '`') {
          let e = j;
          while (text[e] === '`') e += 1;
          if (e - j === run) {
            end = j;
            break;
          }
          j = e;
        } else j += 1;
      }
      if (end === -1) {
        buf += text.slice(i, k);
        i = k;
        continue;
      }
      let code = text.slice(k, end).replace(/\n/g, ' ');
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1);
      flush();
      items.push({ t: 'code', v: code });
      i = end + run;
      continue;
    }

    if (ch === '<') {
      // Autolink.
      const auto = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(text.slice(i));
      if (auto !== null) {
        flush();
        items.push({ t: 'a', href: auto[1], c: [auto[1]] });
        i += auto[0].length;
        continue;
      }
      const comment = /^<!--[\s\S]*?-->/.exec(text.slice(i));
      if (comment !== null) {
        i += comment[0].length;
        continue;
      }
      const tag = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/.exec(text.slice(i));
      if (tag !== null) {
        const name = tag[2].toLowerCase();
        const closing = tag[1] === '/';
        const whole = tag[0];
        if (!INLINE_TAGS.has(name) || closing) {
          if (ctx.onUnknown === 'escape') {
            buf += whole;
            i += whole.length;
            continue;
          }
          throw unknown(`the HTML tag ${whole}, which this reader does not draw (write it in backticks if it is text)`, ctx, line);
        }
        try {
          if (name === 'br') {
            flush();
            items.push({ t: 'br' });
            i += whole.length;
            continue;
          }
          if (name === 'img') {
            const a = attributes('img', tag[3], ['src', 'alt', 'width', 'height'], ctx, line);
            flush();
            items.push({ t: 'img', src: a.src ?? '', alt: a.alt ?? '', ...(a.width ? { w: Number(a.width) } : {}) });
            i += whole.length;
            continue;
          }
          if (name === 'a') {
            const a = attributes('a', tag[3], ['id', 'name'], ctx, line);
            const id = a.id ?? a.name;
            const end = /^<\/a>/.exec(text.slice(i + whole.length));
            if (id === undefined || end === null) throw unknown('an inline <a> that is not an empty anchor', ctx, line);
            flush();
            items.push({ t: 'anchor', id });
            i += whole.length + end[0].length;
            continue;
          }
          // sub, sup, kbd: a pair around inline content.
          attributes(name, tag[3], [], ctx, line);
          const closeTag = `</${name}>`;
          const rest = text.slice(i + whole.length);
          const close = rest.toLowerCase().indexOf(closeTag);
          if (close === -1) throw unknown(`<${name}> is never closed in its paragraph`, ctx, line);
          flush();
          items.push({ t: name, c: parseInline(rest.slice(0, close), ctx, line) });
          i += whole.length + close + closeTag.length;
          continue;
        } catch (error) {
          if (ctx.onUnknown === 'escape' && error instanceof UnknownConstruct) {
            buf += whole;
            i += whole.length;
            continue;
          }
          throw error;
        }
      }
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === '!' && text[i + 1] === '[') {
      const link = readLink(text, i + 1);
      if (link !== null) {
        flush();
        const alt = inlineText(parseInline(link.label, ctx, line));
        items.push({ t: 'img', src: link.dest, alt, ...(link.title ? { title: link.title } : {}) });
        i = link.end;
        continue;
      }
    }

    if (ch === '[') {
      const link = readLink(text, i);
      if (link !== null) {
        flush();
        items.push({ t: 'a', href: link.dest, ...(link.title ? { title: link.title } : {}), c: parseInline(link.label, ctx, line) });
        i = link.end;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === '*' || ch === '_') {
      let k = i;
      while (text[k] === ch) k += 1;
      const before = i === 0 ? undefined : text[i - 1];
      const after = text[k];
      const leftFlanking = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const rightFlanking = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
      const canOpen = ch === '*' ? leftFlanking : leftFlanking && (!rightFlanking || isPunct(before));
      const canClose = ch === '*' ? rightFlanking : rightFlanking && (!leftFlanking || isPunct(after));
      flush();
      items.push({ delim: true, ch, count: k - i, orig: k - i, canOpen, canClose });
      i = k;
      continue;
    }

    if (ch === '~' && text[i + 1] === '~' && text[i + 2] !== '~') {
      // GFM's strikethrough: two tildes, text that does not start or end in a
      // space, two tildes. Anything else is the characters it was written as.
      const close = text.indexOf('~~', i + 2);
      const inner = close === -1 ? '' : text.slice(i + 2, close);
      if (inner !== '' && inner === inner.trim() && !inner.includes('~')) {
        flush();
        items.push({ t: 'del', c: parseInline(inner, ctx, line) });
        i = close + 2;
        continue;
      }
    }

    if (ch === '&') {
      const ent = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(text.slice(i));
      if (ent !== null) {
        const body = ent[1];
        let decoded;
        if (body[0] === '#') {
          const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
          decoded = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
        } else decoded = ENTITIES[body];
        if (decoded === undefined) {
          if (ctx.onUnknown !== 'escape') throw unknown(`the character reference ${ent[0]}, which this reader does not know`, ctx, line);
          buf += ent[0];
        } else buf += decoded;
        i += ent[0].length;
        continue;
      }
    }

    if (ch === '\n') {
      // Two spaces before a newline is a hard break; otherwise a soft one.
      const hard = / {2,}$/.test(buf);
      buf = buf.replace(/[ \t]+$/, '');
      if (hard && buf === '' && items.length === 0) {
        i += 1;
        continue;
      }
      flush();
      items.push(hard ? { t: 'br' } : '\n');
      i += 1;
      while (text[i] === ' ' || text[i] === '\t') i += 1;
      continue;
    }

    // GFM's extended autolink, for http(s) only.
    if (ch === 'h' && (i === 0 || !/[A-Za-z0-9]/.test(text[i - 1]))) {
      const bare = /^https?:\/\/[^\s<]+/.exec(text.slice(i));
      if (bare !== null) {
        let url = bare[0];
        // Trailing punctuation is not part of the address; an unbalanced `)` is not either.
        for (;;) {
          const last = url[url.length - 1];
          if (/[?!.,:*_~'";]/.test(last)) url = url.slice(0, -1);
          else if (last === ')' && (url.match(/\)/g) ?? []).length > (url.match(/\(/g) ?? []).length) url = url.slice(0, -1);
          else break;
        }
        if (url.length > 'https://'.length) {
          flush();
          items.push({ t: 'a', href: url, c: [url] });
          i += url.length;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return finish(emphasis(items));
}

/**
 * The CommonMark delimiter-stack pass: pair `*` and `_` runs into emphasis.
 * @param {any[]} items
 */
function emphasis(items) {
  for (let c = 0; c < items.length; c += 1) {
    const closer = items[c];
    if (typeof closer === 'string' || !closer.delim || !closer.canClose || closer.count === 0) continue;
    let found = -1;
    for (let j = c - 1; j >= 0; j -= 1) {
      const o = items[j];
      if (typeof o === 'string' || !o.delim || o.ch !== closer.ch || !o.canOpen || o.count === 0) continue;
      const odd = (o.canClose || closer.canOpen) && (o.orig + closer.orig) % 3 === 0 && !(o.orig % 3 === 0 && closer.orig % 3 === 0);
      if (!odd) {
        found = j;
        break;
      }
    }
    if (found === -1) continue;
    const opener = items[found];
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    const inner = items.slice(found + 1, c);
    const node = { t: use === 2 ? 'strong' : 'em', c: finish(inner) };
    opener.count -= use;
    closer.count -= use;
    items.splice(found + 1, c - found - 1, node);
    c = found + 1;
  }
  return items;
}

/** Unpaired delimiters become the characters they were; neighbours merge. */
function finish(items) {
  /** @type {Inline[]} */
  const out = [];
  for (const item of items) {
    let next = item;
    if (typeof item !== 'string' && item.delim) next = item.ch.repeat(item.count);
    if (next === '') continue;
    if (typeof next === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += next;
    else out.push(next);
  }
  return out;
}

/**
 * `[label](destination "title")` starting at the `[` at `at`, or `null`.
 * @param {string} text @param {number} at
 */
function readLink(text, at) {
  // The label: up to the matching `]`, skipping code spans and escapes.
  let depth = 0;
  let i = at;
  let close = -1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      let k = i;
      while (text[k] === '`') k += 1;
      const run = k - i;
      const closeAt = findCodeClose(text, k, run);
      i = closeAt === -1 ? k : closeAt + run;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
    i += 1;
  }
  if (close === -1 || text[close + 1] !== '(') return null;
  let j = close + 2;
  while (text[j] === ' ' || text[j] === '\t' || text[j] === '\n') j += 1;
  let dest = '';
  if (text[j] === '<') {
    const end = text.indexOf('>', j);
    if (end === -1 || text.slice(j, end).includes('\n')) return null;
    dest = text.slice(j + 1, end);
    j = end + 1;
  } else {
    let parens = 0;
    const start = j;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\' && ASCII_PUNCT.test(text[j + 1] ?? '')) {
        j += 2;
        continue;
      }
      if (/\s/.test(ch)) break;
      if (ch === '(') parens += 1;
      else if (ch === ')') {
        if (parens === 0) break;
        parens -= 1;
      }
      j += 1;
    }
    dest = text.slice(start, j).replace(/\\([!-/:-@[-`{-~])/g, '$1');
  }
  while (text[j] === ' ' || text[j] === '\t' || text[j] === '\n') j += 1;
  let title = '';
  const open = text[j];
  if (open === '"' || open === "'" || open === '(') {
    const closeCh = open === '(' ? ')' : open;
    let k = j + 1;
    while (k < text.length && text[k] !== closeCh) k += text[k] === '\\' ? 2 : 1;
    if (k >= text.length) return null;
    title = text.slice(j + 1, k).replace(/\\(.)/g, '$1');
    j = k + 1;
    while (text[j] === ' ' || text[j] === '\t' || text[j] === '\n') j += 1;
  }
  if (text[j] !== ')') return null;
  return { label: text.slice(at + 1, close), dest, title, end: j + 1 };
}

function findCodeClose(text, from, run) {
  let j = from;
  while (j < text.length) {
    if (text[j] === '`') {
      let e = j;
      while (text[e] === '`') e += 1;
      if (e - j === run) return j;
      j = e;
    } else j += 1;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Parse a document into blocks, with each heading given the address GitHub
 * gives it.
 *
 * @param {string} source
 * @param {{ file?: string, onUnknown?: 'throw' | 'escape' }} [options]
 * @returns {{ blocks: Block[], ids: string[] }}
 */
export function parseMarkdown(source, options = {}) {
  const ctx = { file: options.file ?? '<input>', onUnknown: options.onUnknown ?? 'throw' };
  // A document may carry a byte-order mark, and its line endings are its own.
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((t, index) => ({ text: t, line: index + 1 }));
  const blocks = parseBlocks(lines, ctx);
  const slugger = githubSlugger();
  /** @type {string[]} */
  const ids = [];
  const visit = (list) => {
    for (const block of list) {
      if (block.t === 'h') {
        block.id = slugger.slug(inlineText(block.c));
        ids.push(block.id);
      } else if (block.t === 'anchor') ids.push(block.id);
      if (block.t === 'ul' || block.t === 'ol') for (const item of block.c) visit(item.c);
      else if (block.c && block.t !== 'p' && block.t !== 'h') visit(block.c);
      if (block.t === 'p') {
        for (const node of block.c) if (typeof node !== 'string' && node.t === 'anchor') ids.push(node.id);
      }
    }
  };
  visit(blocks);
  return { blocks, ids };
}

/**
 * Every inline node of a document, depth first: what the link pass walks.
 * @param {readonly Block[]} blocks
 * @param {(node: Exclude<Inline, string>, parent: Inline[]) => void} visit
 */
export function walkInlines(blocks, visit) {
  const inline = (list) => {
    for (const node of list) {
      if (typeof node === 'string') continue;
      visit(node, list);
      if (node.c) inline(node.c);
    }
  };
  const block = (list) => {
    for (const b of list) {
      if (b.t === 'h' || b.t === 'p') inline(b.c);
      else if (b.t === 'table') {
        for (const cell of b.head) inline(cell);
        for (const row of b.rows) for (const cell of row) inline(cell);
      } else if (b.t === 'ul' || b.t === 'ol') for (const item of b.c) block(item.c);
      else if (b.t === 'details') {
        inline(b.summary);
        block(b.c);
      } else if (b.t === 'quote' || b.t === 'center') block(b.c);
    }
  };
  block(blocks);
}

/**
 * Every block of a document, depth first.
 * @param {readonly Block[]} blocks
 * @param {(block: Block) => void} visit
 */
export function walkBlocks(blocks, visit) {
  for (const b of blocks) {
    visit(b);
    if (b.t === 'ul' || b.t === 'ol') for (const item of b.c) walkBlocks(item.c, visit);
    else if (b.t === 'quote' || b.t === 'center' || b.t === 'details') walkBlocks(b.c, visit);
  }
}

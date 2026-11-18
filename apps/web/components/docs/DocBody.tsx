import type { ReactNode } from 'react';

import { safeHref, safeId, safeLang, safeSrc } from '../../lib/docs/safe';
import type { Block, Inline } from '../../lib/docs/types';

/**
 * A document, drawn from the tree the build made of it.
 *
 * ## There is no way in for markup
 *
 * Everything here is a React element built from data. A string becomes a
 * text node, so a document that says `<script>alert(1)</script>` shows those
 * characters, and nothing in this file turns a string into HTML. The only
 * attributes that take a value from a document are `href`, `src`, `id`, a
 * code block's language and an image's description, and each is checked first
 * (`lib/docs/safe.ts`): an address that is not `http(s)`, `mailto`, a
 * fragment or a path on this site is drawn as the text it labelled, with no
 * link, and an image that is not on this site is drawn as its description.
 * `DocBody` has no hooks and no state, so it renders on the server and ships
 * no script of its own.
 *
 * What it draws is styled by `.doc-body` in `globals.css`, which is why the
 * elements carry almost no classes of their own: a long document is tens of
 * thousands of elements, and a class string on each would be most of its
 * weight.
 */

/**
 * A list with the position of each entry, as a key. A document's tree is
 * fixed when it is built and is never reordered, so position is the
 * identity of an entry.
 */
function keyed<T>(items: readonly T[]): { item: T; at: number }[] {
  return items.map((item, at) => ({ item, at }));
}

/** An image from this site's own files, drawn lazily. */
function Picture({ className, src, alt, width }: { className?: string; src: string; alt: string; width?: number }) {
  return (
    // biome-ignore lint/performance/noImgElement: a static picture from this site's own files, lazy, with the size the document gave; the image optimiser is a server to run for no gain
    <img className={className} src={src} alt={alt} loading="lazy" decoding="async" {...(width ? { width } : {})} />
  );
}

function Inlines({ nodes }: { nodes: readonly Inline[] }) {
  return <>{nodes.map((node, index) => inline(node, index))}</>;
}

function inline(node: Inline, key: number): ReactNode {
  if (typeof node === 'string') return node;
  switch (node.t) {
    case 'code':
      return <code key={key}>{node.v}</code>;
    case 'em':
      return (
        <em key={key}>
          <Inlines nodes={node.c} />
        </em>
      );
    case 'strong':
      return (
        <strong key={key}>
          <Inlines nodes={node.c} />
        </strong>
      );
    case 'sub':
      return (
        <sub key={key}>
          <Inlines nodes={node.c} />
        </sub>
      );
    case 'sup':
      return (
        <sup key={key}>
          <Inlines nodes={node.c} />
        </sup>
      );
    case 'kbd':
      return (
        <kbd key={key}>
          <Inlines nodes={node.c} />
        </kbd>
      );
    case 'a': {
      const href = safeHref(node.href);
      // An address that may not be a link leaves its words, and no link.
      if (href === null) {
        return (
          <span key={key}>
            <Inlines nodes={node.c} />
          </span>
        );
      }
      return (
        <a key={key} href={href} {...(node.ext ? { 'data-external': '' } : {})}>
          <Inlines nodes={node.c} />
        </a>
      );
    }
    case 'img': {
      const src = safeSrc(node.src);
      if (src === null) return node.alt;
      return <Picture key={key} src={src} alt={node.alt} width={node.w} />;
    }
    case 'br':
      return <br key={key} />;
    case 'anchor': {
      const id = safeId(node.id);
      return id === null ? null : <span key={key} id={id} />;
    }
    default:
      return null;
  }
}

/** Does this subtree hold a heading? A disclosure that does is open: it is the page's structure. */
function holdsHeading(blocks: readonly Block[]): boolean {
  return blocks.some((block) => {
    if (block.t === 'h') return true;
    if (block.t === 'ul' || block.t === 'ol') return block.c.some((item) => holdsHeading(item.c));
    if (block.t === 'quote' || block.t === 'center' || block.t === 'details') return holdsHeading(block.c);
    return false;
  });
}

function Blocks({ blocks, tight = false }: { blocks: readonly Block[]; tight?: boolean }) {
  return <>{blocks.map((block, index) => blockView(block, index, tight))}</>;
}

const HEADINGS = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;

function blockView(block: Block, key: number, tight: boolean): ReactNode {
  switch (block.t) {
    case 'h': {
      const Tag = HEADINGS[Math.min(6, Math.max(1, block.depth)) as 1 | 2 | 3 | 4 | 5 | 6];
      const id = safeId(block.id);
      const permalink =
        id !== null && block.depth > 1 ? (
          <a className="doc-anchor" href={`#${id}`} aria-label="#" tabIndex={-1}>
            #
          </a>
        ) : null;
      return (
        <Tag key={key} {...(id === null ? {} : { id })}>
          <Inlines nodes={block.c} />
          {permalink}
        </Tag>
      );
    }
    case 'p':
      // In a tight list item a paragraph is the item's own text.
      return tight ? (
        <Inlines key={key} nodes={block.c} />
      ) : (
        <p key={key}>
          <Inlines nodes={block.c} />
        </p>
      );
    case 'ul':
      return (
        <ul key={key}>
          {keyed(block.c).map(({ item, at }) => (
            <li key={at}>
              <Blocks blocks={item.c} tight={block.tight} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} {...(block.start !== 1 ? { start: block.start } : {})}>
          {keyed(block.c).map(({ item, at }) => (
            <li key={at}>
              <Blocks blocks={item.c} tight={block.tight} />
            </li>
          ))}
        </ol>
      );
    case 'code': {
      const lang = safeLang(block.lang);
      return (
        // A scrolling block has to be reachable by keyboard, or its far end is not.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region that cannot take focus cannot be scrolled from the keyboard
        <pre key={key} tabIndex={0} {...(lang === null ? {} : { 'data-lang': lang })}>
          <code>{block.v}</code>
        </pre>
      );
    }
    case 'quote':
      return (
        <blockquote key={key}>
          <Blocks blocks={block.c} />
        </blockquote>
      );
    case 'table':
      return (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a table wider than the page scrolls inside this box, and the box has to be reachable by keyboard
        <div key={key} className="doc-table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {keyed(block.head).map(({ item, at }) => (
                  <th key={at} scope="col" {...(block.align[at] ? { 'data-align': block.align[at] } : {})}>
                    <Inlines nodes={item} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keyed(block.rows).map(({ item: row, at: r }) => (
                <tr key={r}>
                  {keyed(row).map(({ item, at }) => (
                    <td key={at} {...(block.align[at] ? { 'data-align': block.align[at] } : {})}>
                      <Inlines nodes={item} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={key} />;
    case 'center':
      return (
        <div key={key} className="doc-center">
          <Blocks blocks={block.c} />
        </div>
      );
    case 'details':
      return (
        <details key={key} {...(holdsHeading(block.c) ? { open: true } : {})}>
          <summary>
            <Inlines nodes={block.summary} />
          </summary>
          <Blocks blocks={block.c} />
        </details>
      );
    case 'picture': {
      // Both schemes are drawn and the stylesheet shows the one the page is
      // in, because the site's own appearance control (data-theme) is
      // something a `<source media>` cannot read.
      const light = safeSrc(block.src);
      const dark = safeSrc(block.dark);
      if (light === null) return block.alt === '' ? null : <p key={key}>{block.alt}</p>;
      return (
        <p key={key} className="doc-picture">
          <Picture className="doc-light" src={light} alt={block.alt} width={block.w} />
          {dark !== null && <Picture className="doc-dark" src={dark} alt={block.alt} width={block.w} />}
        </p>
      );
    }
    case 'anchor': {
      const id = safeId(block.id);
      return id === null ? null : <span key={key} id={id} />;
    }
    default:
      return null;
  }
}

export function DocBody({ blocks }: { blocks: readonly Block[] }) {
  return <Blocks blocks={blocks} />;
}

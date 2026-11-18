import type { Block, Inline } from '../../../../scripts/docs-markdown.mjs';
import type { DocGroup } from './manifest';

/**
 * The shapes `scripts/build-docs-site.mjs` writes and the pages read. The
 * tree itself (`Block`, `Inline`) is described where it is made, in
 * `scripts/docs-markdown.mjs`.
 */
export type { Block, Inline };

/** One heading below a document's own title: what the contents list is made of. */
export interface DocHeading {
  /** 2 to 6: the document's single `#` is the page's title, not a heading in it. */
  depth: number;
  /** The address GitHub gives it. */
  id: string;
  text: string;
}

/** One document, as the build left it. */
export interface DocData {
  slug: string;
  path: string;
  title: string;
  group: DocGroup;
  /** Its first paragraph, as plain text, trimmed. */
  description: string;
  headings: DocHeading[];
  blocks: Block[];
}

/** `[slug, text, anchor, depth]`: a document's title (depth 1) or one of its headings. */
export type SearchEntry = [slug: string, text: string, anchor: string, depth: number];

/** What `/docs` shows that is not a document: each page's description and the task table. */
export interface DocsIndexData {
  descriptions: Record<string, string>;
  /** The table of tasks that opens `docs/README.md`, links resolved. */
  tasks: Block | null;
  /** How many documents of each kept-out family the repository holds, counted at build. */
  unpublished: Record<string, number>;
}

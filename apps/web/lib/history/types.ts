import type { Block, DocHeading } from '../docs/types';

/**
 * The shapes `scripts/build-site-pages.mjs` writes and the changelog, the
 * roadmap and the models pages read. The tree itself (`Block`) is described
 * where it is made, in `scripts/docs-markdown.mjs`.
 */

/** What a release's heading says after its version: a date, a title, or nothing. */
export type LabelKind = 'date' | 'title' | 'none';

export interface ReleaseSummary {
  /** The anchor: the version, or `unreleased`. */
  anchor: string;
  /** `null` for the unreleased changes. */
  version: string | null;
  unreleased: boolean;
  /** The date or the title the heading carries, exactly as written, or `null`. */
  label: string | null;
  labelKind: LabelKind;
  /** The address GitHub gives the heading in the file: where an old link lands. */
  slug: string;
}

/** One release, as its own page. */
export interface ReleaseData extends ReleaseSummary {
  newer: ReleaseSummary | null;
  older: ReleaseSummary | null;
  headings: DocHeading[];
  blocks: Block[];
}

export interface ChangelogIndex {
  /** What the file says before its first release. */
  intro: Block[];
  /** Every release, newest first, the unreleased changes before them. */
  releases: ReleaseSummary[];
  /** The ones `/changelog` draws in full. */
  featured: (ReleaseSummary & { headings: DocHeading[]; blocks: Block[] })[];
}

export interface RoadmapIssue {
  number: number;
  url: string;
  /** From the table of open work in `ROADMAP.md` when the issue is in it. */
  title: string | null;
}

export interface RoadmapMilestone {
  /** Its place in the order the file states. */
  position: number;
  title: string;
  description: string;
  /** The live milestone on GitHub. */
  url: string;
  issues: RoadmapIssue[];
}

export interface RoadmapData {
  milestones: RoadmapMilestone[];
  /** The `## Under consideration` section of `ROADMAP.md`, as a tree. */
  consideration: Block[];
  hasConsideration: boolean;
}

/** What `/models` needs that the catalogue does not hold. */
export interface ModelsExtra {
  /** Where each provider's prices were read, from the catalogue's own source. */
  sources: Record<string, { url: string; label: string }>;
  /** Models a provider's page lists and the catalogue leaves unpriced on purpose, with the reason. */
  unpriced: { provider: string; id: string; reason: string }[];
}

/** One row of the token table: a role, the custom property that holds it, and its two values. */
export interface BrandToken {
  /** The role, as `DESIGN.md` names it. */
  role: string;
  /** The custom property `globals.css` declares. */
  variable: string;
  light: string;
  dark: string;
}

/** One file the brand page offers. */
export interface BrandFile {
  mark: 'wordmark' | 't';
  ground: 'light' | 'dark';
  format: 'svg' | 'png';
  name: string;
  /** Where the web app serves it. */
  href: string;
  bytes: number;
  /** A PNG's size in pixels; an SVG has none. */
  width: number | null;
  height: number | null;
}

/** What `/brand` is made of: the colours, the typeface, the voice, the rules and the files. */
export interface BrandData {
  tokens: BrandToken[];
  typeface: {
    family: string;
    name: string;
    mono: string;
    weights: { min: number; max: number } | null;
    license: string | null;
    packageName: string | null;
  };
  voice: string[];
  dont: string[];
  files: BrandFile[];
}

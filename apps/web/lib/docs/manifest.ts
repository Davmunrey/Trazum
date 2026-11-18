/**
 * Which documents of this repository the site publishes, and where each one
 * lives: the single list `/docs` is built from.
 *
 * ## Written once
 *
 * A document is a page on the site because it is a row of `DOCS`, and for no
 * other reason. The build script reads this file, the pages read what the
 * build wrote, and `docs.test.mjs` holds the list to the two things it has
 * to agree with: `docs/README.md`, which is where a reader of the repository
 * is told which documents exist and why, and the `docs/` directory itself.
 *
 * - A document `docs/README.md` links as documentation has a page, or is in
 *   `NOT_PUBLISHED` with its reason.
 * - A file under `docs/` is in `DOCS` or covered by `NOT_PUBLISHED`. A new
 *   document that is in neither fails the test, so nobody decides by
 *   forgetting.
 * - Each document's group is one of the sections of `docs/README.md` that
 *   links it, so the index is grouped as that file groups it.
 *
 * Plans, audits and compliance records are not published as documentation.
 * They are records of what was planned, found or promised on a date, kept in
 * the repository, and the index says they exist and links them there.
 *
 * Plain TypeScript with no imports, because the build script (a Node
 * program, not part of the bundle) reads it directly.
 */

/** Where the repository lives, and where a document's own file is. */
export const REPOSITORY = 'https://github.com/Davmunrey/Trazum';
export const BLOB = `${REPOSITORY}/blob/main/`;
export const TREE = `${REPOSITORY}/tree/main/`;

/**
 * What a reader is trying to do, in the order the index shows it. The
 * sections are `docs/README.md`'s own: the first is its table of tasks, and
 * the next four are its headings.
 */
export type DocGroup = 'start' | 'decide' | 'use' | 'extend' | 'maintain';

export const DOC_GROUPS: readonly DocGroup[] = ['start', 'use', 'decide', 'extend', 'maintain'];

/**
 * Which parts of `docs/README.md` each group stands for: the headings it
 * links its documents under, and `null` for the table of tasks at the top,
 * which links the first page of every way in. A document belongs to a group
 * when `docs/README.md` links it from one of that group's parts. "Start here"
 * is the first steps: the table, and the README, which the part that decides
 * whether to use Trazum sends a reader to first.
 */
export const README_SECTIONS: Readonly<Record<DocGroup, readonly (string | null)[]>> = {
  start: [null, 'I am deciding whether to use this'],
  use: ['I am using it'],
  decide: ['I am deciding whether to use this'],
  extend: ['I am extending it'],
  maintain: ['I am maintaining it'],
};

export interface DocEntry {
  /** The file, from the repository's root. */
  readonly path: string;
  /** The address: `/docs/<slug>`. */
  readonly slug: string;
  /** The name in the index, the sidebar and the tab. */
  readonly title: string;
  readonly group: DocGroup;
}

/**
 * The published documents. Within a group the order is the order of
 * `docs/README.md`, which is the order somebody meets them in.
 */
export const DOCS: readonly DocEntry[] = [
  // Start here.
  { path: 'README.md', slug: 'overview', title: 'Overview', group: 'start' },
  { path: 'docs/quick-start.md', slug: 'quick-start', title: 'Quick start', group: 'start' },
  { path: 'docs/setup.md', slug: 'setup', title: 'Setup and integrations', group: 'start' },

  // I am using it.
  { path: 'docs/commands.md', slug: 'commands', title: 'The command reference', group: 'use' },
  { path: 'docs/codex.md', slug: 'codex', title: 'Codex sessions', group: 'use' },
  { path: 'docs/gemini-cli.md', slug: 'gemini-cli', title: 'Gemini CLI sessions', group: 'use' },
  { path: 'docs/usage-logs.md', slug: 'usage-logs', title: 'Usage logs', group: 'use' },
  { path: 'docs/accounts.md', slug: 'accounts', title: 'Accounts', group: 'use' },
  { path: 'docs/api.md', slug: 'api', title: 'Local HTTP API', group: 'use' },
  { path: 'docs/tool-output-filter.md', slug: 'tool-output-filter', title: 'Tool-output filter', group: 'use' },
  { path: 'docs/context-efficiency.md', slug: 'context-efficiency', title: 'Efficient context instructions', group: 'use' },
  { path: 'docs/task-efficiency.md', slug: 'task-efficiency', title: 'Task efficiency', group: 'use' },
  { path: 'docs/agents.md', slug: 'agents', title: 'Agent integrations', group: 'use' },
  { path: 'docs/gateway.md', slug: 'gateway', title: 'The gateway', group: 'use' },
  { path: 'docs/ci.md', slug: 'ci', title: 'CI gates', group: 'use' },
  { path: 'docs/running.md', slug: 'running', title: 'Running it on a schedule', group: 'use' },
  { path: 'docs/deploy-n0.md', slug: 'deploy-n0', title: 'Deploying on N0', group: 'use' },
  { path: 'docs/plan-format.md', slug: 'plan-format', title: 'The plan document', group: 'use' },
  { path: 'docs/json-output.md', slug: 'json-output', title: 'JSON output', group: 'use' },
  { path: 'docs/format.md', slug: 'format', title: 'The interchange format', group: 'use' },

  // I am deciding whether to use this.
  { path: 'docs/doctrine.md', slug: 'doctrine', title: 'The doctrine', group: 'decide' },
  { path: 'docs/our-own-medicine.md', slug: 'our-own-medicine', title: 'Our own medicine', group: 'decide' },
  { path: 'docs/hardening.md', slug: 'hardening', title: 'Any input', group: 'decide' },
  { path: 'docs/done.md', slug: 'done', title: 'When a change is done', group: 'decide' },
  { path: 'docs/coverage.md', slug: 'coverage', title: 'Coverage', group: 'decide' },
  { path: 'docs/end-to-end-tests.md', slug: 'end-to-end-tests', title: 'End-to-end tests', group: 'decide' },
  { path: 'docs/mutation-testing.md', slug: 'mutation-testing', title: 'Mutation testing', group: 'decide' },
  { path: 'docs/licensing.md', slug: 'licensing', title: 'What is open, what is not', group: 'decide' },

  // I am extending it.
  { path: 'docs/authoring-rules.md', slug: 'authoring-rules', title: 'Authoring rules', group: 'extend' },
  { path: 'docs/language-maintainer.md', slug: 'language-maintainer', title: 'Maintaining a language', group: 'extend' },
  { path: 'docs/prompt-writer.md', slug: 'prompt-writer', title: 'The prompt writer', group: 'extend' },
  { path: 'CONTRIBUTING.md', slug: 'contributing', title: 'Contributing', group: 'extend' },

  // I am maintaining it.
  { path: 'docs/finops-direction.md', slug: 'finops-direction', title: 'FinOps product direction', group: 'maintain' },
  { path: 'docs/adoption-playbook.md', slug: 'adoption-playbook', title: 'Adoption playbook', group: 'maintain' },
  { path: 'docs/releasing.md', slug: 'releasing', title: 'Releasing', group: 'maintain' },
  { path: 'VERSIONING.md', slug: 'versioning', title: 'Versioning', group: 'maintain' },
];

/** Why a document the repository keeps is not a page of the site. */
export type NotPublishedKind =
  | 'plan'
  | 'audit'
  | 'compliance'
  | 'legal'
  | 'policy'
  | 'history'
  | 'index';

/**
 * Documents left out of the site, each with the reason, and linked on GitHub
 * wherever the site mentions it.
 *
 * - `plan`: a historical design record, "not setup instructions or promises
 *   of current availability" in `docs/README.md`'s own words.
 * - `audit` and `compliance`: records of what was found or promised on a
 *   date, written for an auditor.
 * - `legal`: what a contributor signs.
 * - `policy`: files GitHub itself reads by name (security reporting, support,
 *   conduct). The site links them where they are read.
 * - `history`: the changelog, the releases, the roadmap and the release
 *   history. The changelog and the roadmap are pages of the site of their own
 *   (`SITE_PAGES`, `/changelog` and `/roadmap`), built from the same files and
 *   not documents of `/docs`; the releases and the release history stay on
 *   GitHub.
 * - `index`: `docs/README.md`, which the site's `/docs` replaces.
 */
export const NOT_PUBLISHED: readonly { readonly path: string; readonly kind: NotPublishedKind }[] = [
  { path: 'docs/README.md', kind: 'index' },
  { path: 'docs/audit-rea-2026-11.md', kind: 'audit' },
  { path: 'docs/cla/CLA.md', kind: 'legal' },
  { path: 'SECURITY.md', kind: 'policy' },
  { path: 'SUPPORT.md', kind: 'policy' },
  { path: 'CODE_OF_CONDUCT.md', kind: 'policy' },
  { path: 'CHANGELOG.md', kind: 'history' },
  { path: 'RELEASES.md', kind: 'history' },
  { path: 'ROADMAP.md', kind: 'history' },
  { path: 'HISTORY.md', kind: 'history' },
];

/** Whole families of documents that are not published, matched by where they are. */
export const NOT_PUBLISHED_FAMILIES: readonly { readonly pattern: RegExp; readonly kind: NotPublishedKind }[] = [
  { pattern: /^docs\/plan-[^/]+\.md$/, kind: 'plan' },
  { pattern: /^docs\/compliance\/[^/]+\.md$/, kind: 'compliance' },
];

export type KeptId = 'plans' | 'compliance' | 'audit' | 'cla' | 'security' | 'support' | 'conduct' | 'releases';

/**
 * Files of the repository that are pages of the site of their own and not
 * documents of `/docs`: a link to one of them, without an anchor, leads to
 * the page. With an anchor it stays on GitHub, because the page draws
 * releases and sections, not every heading the file has.
 */
export const SITE_PAGES: readonly { readonly path: string; readonly href: string }[] = [
  { path: 'CHANGELOG.md', href: '/changelog' },
  { path: 'ROADMAP.md', href: '/roadmap' },
];

/**
 * Where `/docs` sends a reader for each kept-out record, on GitHub. A path,
 * and for the plans a heading of the index that lists them. `family` names
 * the count the build makes of that family, where it is a family of files
 * under `docs/`.
 */
export const KEPT: readonly { readonly id: KeptId; readonly path: string; readonly family?: NotPublishedKind }[] = [
  { id: 'plans', path: 'docs/README.md#the-arcs-as-they-were-planned', family: 'plan' },
  { id: 'compliance', path: 'docs/compliance/README.md', family: 'compliance' },
  { id: 'audit', path: 'docs/audit-rea-2026-11.md', family: 'audit' },
  { id: 'cla', path: 'docs/cla/CLA.md', family: 'legal' },
  { id: 'security', path: 'SECURITY.md' },
  { id: 'support', path: 'SUPPORT.md' },
  { id: 'conduct', path: 'CODE_OF_CONDUCT.md' },
  { id: 'releases', path: 'RELEASES.md' },
];

/** The reason a path is left out, or `null` when it is not left out. */
export function notPublishedKind(path: string): NotPublishedKind | null {
  if (DOCS.some((doc) => doc.path === path)) return null;
  const listed = NOT_PUBLISHED.find((entry) => entry.path === path);
  if (listed) return listed.kind;
  return NOT_PUBLISHED_FAMILIES.find((family) => family.pattern.test(path))?.kind ?? null;
}

/** The page a document has, if it has one. */
export function docByPath(path: string): DocEntry | undefined {
  return DOCS.find((doc) => doc.path === path);
}

export function docBySlug(slug: string): DocEntry | undefined {
  return DOCS.find((doc) => doc.slug === slug);
}

/** The address of a page, and of one heading on it. */
export function docHref(slug: string, anchor?: string): string {
  return `/docs/${slug}${anchor ? `#${anchor}` : ''}`;
}

/** The same file, in the repository. */
export function githubUrl(path: string): string {
  return `${BLOB}${path}`;
}

/** The documents of one group, in order. */
export function docsOf(group: DocGroup): readonly DocEntry[] {
  return DOCS.filter((doc) => doc.group === group);
}

/** The document before and after this one within its group, and `null` at an end. */
export function neighbours(slug: string): { previous: DocEntry | null; next: DocEntry | null } {
  const doc = docBySlug(slug);
  if (!doc) return { previous: null, next: null };
  const group = docsOf(doc.group);
  const at = group.findIndex((entry) => entry.slug === slug);
  return { previous: group[at - 1] ?? null, next: group[at + 1] ?? null };
}

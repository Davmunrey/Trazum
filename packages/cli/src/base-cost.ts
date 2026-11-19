import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import {
  PRICING_LAST_REVIEWED,
  SOURCE_EXTENSIONS,
  effectivePricing,
  extractPrompts,
  hasMarker,
  matchGlob,
  promptId,
  reviewedForModels,
} from '@trazum/core';
import type { ModelPricing, PricingCatalogue } from '@trazum/core';
import { walkIncludes, walkPrompts } from '@trazum/core/node';

import { commitOf, contentAt, filesAt, gitAvailable, pathInRepository, repositoryRoot } from './git.js';

/**
 * What a pull request does to each prompt's cost against its base branch
 * (#785): `trazum check <target> --base <ref>`.
 *
 * The base side is read out of the clone the job already has, with
 * `git show`, through `git.ts`. Nothing is fetched and nothing is sent: a
 * base commit the checkout does not hold is reported as missing, never
 * replaced by the working tree, which would compare the head with itself
 * and report every pull request as free.
 *
 * Every figure is **input tokens at the model's input price**: what the
 * prompt itself costs per call. Output is left out on purpose, because a
 * prompt edit does not set how much the model writes back, and a figure
 * that included a typed output size would carry a number nobody measured.
 *
 * A month needs a number of calls, and that number is a statement about
 * traffic. It comes from `volumes` in `trazum.config.json`, keyed by the
 * label `labels` maps to the prompt file, and from nowhere else. A prompt
 * with no stated volume is priced per call, and the report says so: a
 * month at an invented volume is the figure this product exists not to
 * print.
 */

/** One prompt, on both sides of the comparison. `null` where it is absent. */
export interface PromptPair {
  /** How the report names it: a path, or `path#name` for a marked prompt. */
  id: string;
  /** The file it lives in, as the head's walk names it. */
  file: string;
  /** True for a prompt marked inside a source file. */
  embedded: boolean;
  base: string | null;
  head: string | null;
}

/** One side of one prompt, priced. */
export interface PricedSide {
  tokens: number;
  /** The input price this side was billed at, per million tokens. */
  inputPerMTok: number;
  perCallUsd: number;
  /** `null` when nobody stated a volume for this prompt. */
  monthlyUsd: number | null;
}

export interface BaseCostRow {
  id: string;
  base: PricedSide | null;
  head: PricedSide | null;
  /** Calls a month from `volumes`, or `null`: then the row is per call only. */
  callsPerMonth: number | null;
  /** The labels whose volumes were added up for this prompt. */
  labels: string[];
  perCallChangeUsd: number;
  monthlyChangeUsd: number | null;
}

/** The price every figure was computed at, and where it came from. */
export interface BaseCostPrice {
  model: string;
  displayName: string;
  /** Who sells it, as the catalogue records it; `null` for an overlay's model with none. */
  provider: string | null;
  /** True when a local pricing overlay supplied this model's price. */
  overlaid: boolean;
  /**
   * The day this price was read: the provider's review date in the bundled
   * catalogue, or the overlay's own date. Never today's date and never a
   * date this module made up: `reviewedForModels` is the one place it comes
   * from.
   */
  readOn: string;
  /** When a promotional price applied, the last day it does. */
  promoUntil: string | null;
}

export interface BaseCostGate {
  /** The most the monthly cost may grow, from `--max-monthly-increase-usd`. */
  maxIncreaseUsd: number;
  breached: boolean;
}

export type BaseCostReport =
  | {
      status: 'compared';
      /** What the caller passed, and the commit it named. */
      ref: string;
      sha: string;
      price: BaseCostPrice;
      /** Whether the model came from `usage.model` or is Trazum's default. */
      modelFrom: 'config' | 'default';
      /** Prompts whose text differs, added or removed, in id order. */
      rows: BaseCostRow[];
      /** Prompts identical on both sides: counted, not listed. */
      unchanged: number;
      /** Over the rows with a stated volume; `null` when no row has one. */
      totals: { baseUsd: number; headUsd: number; changeUsd: number } | null;
      /** Changed rows with no stated volume, priced per call only. */
      perCallOnly: number;
      gate: BaseCostGate | null;
    }
  | {
      status: 'unavailable';
      ref: string;
      /** No git, not a repository, or a commit this checkout does not have. */
      why: 'no-git' | 'not-a-repository' | 'no-commit';
      /** A gate that was asked for and could not judge anything. */
      gate: { maxIncreaseUsd: number } | null;
    };

/** Whether a gate asked for in this report fails the run. */
export function baseGateFails(report: BaseCostReport): boolean {
  if (report.gate === null) return false;
  // A gate that could not read the base is not a pass: it judged nothing.
  if (report.status === 'unavailable') return true;
  return report.gate.breached;
}

/** The prompts one file holds: itself, or each one marked inside it. */
function promptsIn(file: string, text: string): { id: string; text: string; embedded: boolean }[] {
  const isSource = SOURCE_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
  if (!isSource) return [{ id: file, text, embedded: false }];
  if (!hasMarker(text)) return [];
  return extractPrompts(text).prompts.map((prompt) => ({
    id: promptId(file, prompt),
    text: prompt.text,
    embedded: true,
  }));
}

const toPosix = (path: string): string => path.split(sep).join('/');

/** `a/b` joined for display, the way `check` keys a path under its root. */
function joinShown(root: string, rel: string): string {
  const trimmed = root.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  if (trimmed === '' || trimmed === '.') return rel;
  return `${trimmed}/${rel}`;
}

/**
 * Reads both sides of every prompt under `target`.
 *
 * The head is the disk, walked the way `check` walks it. The base is the
 * commit, listed with `git ls-tree` and read with `git show`, and kept to
 * the files the walk would have kept (`walkIncludes`), so a file the walk
 * skips is not reported as deleted. `listed` is `--files-from`'s list, which
 * replaces the walk on both sides.
 */
export async function readBothSides(options: {
  ref: string;
  target: string;
  kind: 'file' | 'directory' | 'list';
  listed?: readonly string[];
  extensions: readonly string[];
  ignore: readonly string[];
  cwd?: string;
  readHead?: (path: string) => Promise<string>;
}): Promise<{ status: 'read'; sha: string; pairs: PromptPair[] } | { status: 'unavailable'; why: 'no-git' | 'not-a-repository' | 'no-commit' }> {
  const cwd = options.cwd ?? process.cwd();
  const readHead = options.readHead ?? ((path: string) => readFile(resolve(cwd, path), 'utf8'));

  if (!gitAvailable(cwd)) return { status: 'unavailable', why: 'no-git' };
  const root = repositoryRoot(cwd);
  if (root === null) return { status: 'unavailable', why: 'not-a-repository' };
  let sha: string | null;
  try {
    sha = commitOf(options.ref, root);
  } catch {
    return { status: 'unavailable', why: 'no-git' };
  }
  if (sha === null) return { status: 'unavailable', why: 'no-commit' };

  /** A path as the report shows it, relative to the working directory, to its repository path. */
  const repoPathOf = (shown: string): string | null => {
    const absolute = resolve(cwd, shown);
    if (absolute === resolve(root)) return '';
    return pathInRepository(root, absolute);
  };

  // Every file to look at, as the report shows it, mapped to its path in the repository.
  const files = new Map<string, string>();
  const walkOptions = { extensions: options.extensions, ignore: options.ignore };

  if (options.kind === 'file') {
    const repoPath = repoPathOf(options.target);
    if (repoPath !== null && repoPath !== '') files.set(toPosix(options.target), repoPath);
  } else if (options.kind === 'list') {
    // The list's own rule, as `check --files-from` applies it: a prompt
    // extension and no ignore pattern. Kept whether or not the file is still
    // on disk, because a deletion is half of what a base comparison is for.
    const extensions = options.extensions.map((ext) => ext.toLowerCase());
    for (const raw of options.listed ?? []) {
      const rel = raw.replace(/^\.\//, '');
      if (!extensions.some((ext) => rel.toLowerCase().endsWith(ext))) continue;
      if (options.ignore.some((pattern) => matchGlob(pattern, rel) || matchGlob(pattern, `${rel}/`))) continue;
      const repoPath = repoPathOf(rel);
      if (repoPath !== null && repoPath !== '') files.set(rel, repoPath);
    }
  } else {
    const walked = await walkPrompts(resolve(cwd, options.target), walkOptions);
    for (const rel of walked.files) {
      const shown = joinShown(options.target, rel);
      const repoPath = repoPathOf(shown);
      if (repoPath !== null) files.set(shown, repoPath);
    }
    const rootPath = repoPathOf(options.target);
    if (rootPath !== null) {
      for (const repoPath of filesAt(sha, rootPath, root) ?? []) {
        const rel = rootPath === '' ? repoPath : repoPath.slice(rootPath.length + 1);
        if (!walkIncludes(rel, walkOptions)) continue;
        const shown = joinShown(options.target, rel);
        if (!files.has(shown)) files.set(shown, repoPath);
      }
    }
  }

  const pairs = new Map<string, PromptPair>();
  for (const [shown, repoPath] of [...files.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // The base is read from the commit, and only from the commit.
    const atBase = (filesAt(sha, repoPath, root) ?? []).includes(repoPath) ? contentAt(sha, repoPath, root) : null;
    const atHead = await readHead(shown).catch(() => null);
    for (const prompt of atBase === null ? [] : promptsIn(shown, atBase)) {
      pairs.set(prompt.id, { id: prompt.id, file: shown, embedded: prompt.embedded, base: prompt.text, head: null });
    }
    for (const prompt of atHead === null ? [] : promptsIn(shown, atHead)) {
      const existing = pairs.get(prompt.id);
      if (existing !== undefined) existing.head = prompt.text;
      else pairs.set(prompt.id, { id: prompt.id, file: shown, embedded: prompt.embedded, base: null, head: prompt.text });
    }
  }
  return { status: 'read', sha, pairs: [...pairs.values()] };
}

/**
 * The calls a month stated for a prompt file, from `volumes` through `labels`.
 *
 * Every label mapping to the file is a workload sending it, so their
 * volumes add. When one of them states none, the month is not known and
 * the answer is `null`: a sum missing a workload would be an understated
 * month printed as a whole one. A prompt marked inside a source file gets
 * none, because a label maps a file and a file holding several prompts
 * does not say how often each is sent.
 */
export function volumeFor(
  pair: Pick<PromptPair, 'file' | 'embedded'>,
  labels: Readonly<Record<string, string>>,
  volumes: Readonly<Record<string, number>>,
  cwd: string = process.cwd(),
): { calls: number; labels: string[] } | null {
  if (pair.embedded) return null;
  const target = resolve(cwd, pair.file);
  const sending = Object.keys(labels)
    .filter((label) => resolve(cwd, labels[label]!) === target)
    .sort();
  if (sending.length === 0) return null;
  let calls = 0;
  for (const label of sending) {
    const stated = volumes[label];
    if (stated === undefined) return null;
    calls += stated;
  }
  return { calls, labels: sending };
}

/**
 * Prices every changed prompt on both sides, at one model and one price list.
 *
 * Both sides are priced at today's prices, from the same catalogue, so a
 * provider repricing between the base and the head cannot appear as a
 * change the pull request made.
 */
export async function priceAgainstBase(input: {
  ref: string;
  sha: string;
  pairs: readonly PromptPair[];
  count: (text: string) => Promise<number>;
  model: ModelPricing;
  modelFrom: 'config' | 'default';
  pricing: PricingCatalogue;
  volumeOf: (pair: PromptPair) => { calls: number; labels: string[] } | null;
  maxIncreaseUsd: number | null;
  on?: Date;
}): Promise<BaseCostReport> {
  const on = input.on ?? new Date();
  const model = input.model;
  let promoApplied = false;

  const side = async (text: string | null, calls: number | null): Promise<PricedSide | null> => {
    if (text === null) return null;
    const tokens = await input.count(text);
    const rates = effectivePricing(model, on, { inputTokens: tokens });
    promoApplied ||= rates.promoApplied;
    const perCallUsd = (tokens * rates.inputPerMTok) / 1_000_000;
    return {
      tokens,
      inputPerMTok: rates.inputPerMTok,
      perCallUsd,
      monthlyUsd: calls === null ? null : perCallUsd * calls,
    };
  };

  const rows: BaseCostRow[] = [];
  let unchanged = 0;
  for (const pair of [...input.pairs].sort((a, b) => a.id.localeCompare(b.id))) {
    if (pair.base === pair.head) {
      if (pair.base !== null) unchanged++;
      continue;
    }
    const volume = input.volumeOf(pair);
    const calls = volume === null ? null : volume.calls;
    const base = await side(pair.base, calls);
    const head = await side(pair.head, calls);
    const perCallChangeUsd = (head?.perCallUsd ?? 0) - (base?.perCallUsd ?? 0);
    rows.push({
      id: pair.id,
      base,
      head,
      callsPerMonth: calls,
      labels: volume?.labels ?? [],
      perCallChangeUsd,
      monthlyChangeUsd: calls === null ? null : perCallChangeUsd * calls,
    });
  }

  const monthly = rows.filter((row) => row.callsPerMonth !== null);
  const totals =
    monthly.length === 0
      ? null
      : {
          baseUsd: monthly.reduce((sum, row) => sum + (row.base?.monthlyUsd ?? 0), 0),
          headUsd: monthly.reduce((sum, row) => sum + (row.head?.monthlyUsd ?? 0), 0),
          changeUsd: monthly.reduce((sum, row) => sum + (row.monthlyChangeUsd ?? 0), 0),
        };

  const overlaid =
    input.pricing.lastReviewed !== PRICING_LAST_REVIEWED ||
    input.pricing.overriddenModels.includes(model.id) ||
    input.pricing.addedModels.includes(model.id);

  return {
    status: 'compared',
    ref: input.ref,
    sha: input.sha,
    price: {
      model: model.id,
      displayName: model.displayName,
      provider: model.provider ?? null,
      overlaid,
      readOn: reviewedForModels([model.id], input.pricing),
      promoUntil: promoApplied ? (model.promo?.until ?? null) : null,
    },
    modelFrom: input.modelFrom,
    rows,
    unchanged,
    totals,
    perCallOnly: rows.length - monthly.length,
    gate:
      input.maxIncreaseUsd === null
        ? null
        : {
            maxIncreaseUsd: input.maxIncreaseUsd,
            // A floating-point hair over the limit is not over it.
            breached: (totals?.changeUsd ?? 0) - input.maxIncreaseUsd > 1e-9,
          },
  };
}

import { normalizeForCompare } from './similarity.js';
import { estimateTokens } from './tokenizer.js';
import type { TokenCounter } from './types.js';

/**
 * The waste no single prompt can see.
 *
 * Every other analysis in this package reads one prompt. This one reads a
 * workspace, because there is a kind of caching loss that only exists *between*
 * prompts: forty prompts assembled from the same system preamble, byte-identical
 * except that one has a trailing space, another reordered two bullets, and a
 * third says "You are an assistant" where the rest say "You are an Assistant".
 *
 * Prompt caching is a byte-for-byte prefix match. Those forty prompts therefore
 * occupy forty separate cache entries and share nothing. Unify the preamble and
 * they occupy one. No amount of analysis of any one of those files can find that
 * — each is individually fine — which is what makes this worth a module rather
 * than another advisory.
 *
 * **It reports no dollar figure, and that is a finding rather than a gap.**
 *
 * The saving lives entirely in the cache hit rate: a prompt called ten times a
 * month never warms an entry of its own and always reads a shared one that
 * somebody else keeps hot. But `cacheHitRate` is an *input* to Trazum's cost
 * model, not an output — `advisories.ts` takes it from `--cache-hit-rate` and
 * applies the same value to every prompt. Under that model, splitting one prefix
 * into forty changes nothing, because the model has no term for how many distinct
 * cache entries exist.
 *
 * Pricing this would mean inventing a distribution of calls across the group,
 * which is the one thing here that only the operator knows. So the report gives
 * what it can establish — which prompts, how far the common prefix runs, and what
 * stops it being byte-identical — and refuses the number. Naming a mechanism
 * accurately beats attaching a figure to it that came from nowhere.
 */

/** Blocks are blank-line separated, the same unit `reorder.ts` moves. */
function blocksOf(text: string): string[] {
  return text.split(/\n[ \t]*\n/);
}

/**
 * Whitespace collapsed, and nothing else touched.
 *
 * Used to separate the two kinds of drift, because they are different amounts of
 * work to fix. A prefix that differs only here is a formatter away from sharing a
 * cache entry; one that differs in wording needs somebody to decide which wording
 * is right.
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The prefix length below which unifying buys nothing, and `Infinity` when there
 * is no answer.
 *
 * Lives here rather than in the CLI because it is the gate on this whole report
 * and a gate with no test is decoration. It was a private function in the CLI
 * first; a mutation run deleting the `unknown` branch survived, which is what a
 * function nothing can reach looks like from the outside.
 *
 * `unknown` and a missing minimum both yield `Infinity`, so nothing is reported.
 * That is the direction to fail: telling somebody to unify a preamble across
 * twelve files to enable caching their provider may not offer spends their
 * afternoon, and unlike a wrong number on a report nothing later corrects it.
 */
export function cacheableMinimum(
  model: { caching?: string | null; cacheMinTokens?: number | null } | undefined,
): number {
  if (!model) return Number.POSITIVE_INFINITY;
  if (model.caching === 'none' || model.caching === 'unknown') return Number.POSITIVE_INFINITY;
  return model.cacheMinTokens ?? Number.POSITIVE_INFINITY;
}

export interface PrefixCandidate {
  /** How the report names it. A path, or a path with a marked prompt's id. */
  path: string;
  text: string;
}

export interface SharedPrefix {
  /** Every prompt in the group, in the order they were given. */
  paths: string[];
  /** Blocks the group has in common, counted from the start. */
  blocks: number;
  /** Estimated tokens in that prefix, as the first prompt writes it. */
  tokens: number;
  /**
   * What stops the prefixes being byte-identical today.
   *
   * `whitespace` — collapsing runs of whitespace makes them equal, so a
   * formatter fixes it and no wording decision is needed.
   * `wording` — something else differs: capitalisation, punctuation, word order,
   * or genuinely different words. Someone has to choose.
   */
  drift: 'whitespace' | 'wording';
  /** The shared prefix as the first prompt in the group writes it. */
  sample: string;
}

export interface SharedPrefixOptions {
  /**
   * The model's cacheable minimum. A shared prefix below it buys nothing, so it
   * is not reported — the same refusal `reorder.ts` makes, for the same reason:
   * a change that recovers nothing is a diff for its own sake.
   */
  minTokens?: number;
  countTokens?: TokenCounter;
}

/**
 * Groups of prompts that could share a cache prefix and do not.
 *
 * Grouped by their **first** block, which is not a shortcut. Caching matches from
 * the beginning of the request, so two prompts whose opening paragraphs differ
 * share nothing no matter how identical the rest is — a group keyed on anything
 * later would name prompts that cannot be made to share a prefix without
 * reordering them, which is a different and far more dangerous change.
 */
export function sharedPrefixes(
  prompts: readonly PrefixCandidate[],
  options: SharedPrefixOptions = {},
): SharedPrefix[] {
  const counter = options.countTokens ?? estimateTokens;
  const minTokens = options.minTokens ?? 0;

  const byOpening = new Map<string, PrefixCandidate[]>();
  for (const prompt of prompts) {
    const blocks = blocksOf(prompt.text);
    const opening = normalizeForCompare(blocks[0] ?? '');
    // An empty opening is not a match, it is an absence. Grouping on it would
    // put every blank-led prompt in one group and report a prefix of nothing.
    if (opening === '') continue;
    const group = byOpening.get(opening);
    if (group) group.push(prompt);
    else byOpening.set(opening, [prompt]);
  }

  const found: SharedPrefix[] = [];

  for (const group of byOpening.values()) {
    if (group.length < 2) continue;

    const blockLists = group.map((prompt) => blocksOf(prompt.text));
    const first = blockLists[0];
    if (!first) continue;

    // How far the agreement runs, comparing normalised blocks position by
    // position. Stops at the first block any member disagrees on, because a
    // prefix is contiguous by definition.
    let shared = 0;
    for (let index = 0; index < first.length; index++) {
      const target = normalizeForCompare(first[index] ?? '');
      if (target === '') break;
      const all = blockLists.every((blocks) => normalizeForCompare(blocks[index] ?? '') === target);
      if (!all) break;
      shared = index + 1;
    }
    if (shared === 0) continue;

    /**
     * The raw prefixes, joined the way they were written.
     *
     * `\n\n` rather than the original separator: the separator is itself part of
     * what may differ, and reconstructing each prompt's exact bytes is not needed
     * to answer whether they agree.
     */
    const rawPrefixes = blockLists.map((blocks) => blocks.slice(0, shared).join('\n\n'));
    const sample = rawPrefixes[0] ?? '';

    // Already byte-identical: these prompts share a cache entry today and there
    // is nothing to recover. Reporting them would be noise that teaches people
    // to stop reading this section.
    if (rawPrefixes.every((prefix) => prefix === sample)) continue;

    const collapsed = rawPrefixes.map(collapseWhitespace);
    const flat = collapseWhitespace(sample);
    const drift = collapsed.every((prefix) => prefix === flat) ? 'whitespace' : 'wording';

    const tokens = counter(sample);
    if (tokens < minTokens) continue;

    found.push({
      paths: group.map((prompt) => prompt.path),
      blocks: shared,
      tokens,
      drift,
      sample,
    });
  }

  // Largest prefix first: it is the group where unifying recovers most, and the
  // ordering is a total one so the output does not depend on Map iteration.
  return found.sort(
    (a, b) => b.tokens - a.tokens || (a.paths[0] ?? '').localeCompare(b.paths[0] ?? ''),
  );
}

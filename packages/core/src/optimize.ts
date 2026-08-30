import { buildAdvisories } from './advisories.js';
import { extractChanges } from './changes.js';
import { DEFAULT_LOCALE, getMessages } from './i18n/index.js';
import type { Locale, RuleId } from './i18n/types.js';
import { BUNDLED_CATALOGUE, DEFAULT_MODEL } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import { RULES } from './rules.js';
import { computeSavings } from './savings.js';
import { join, segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { AsyncTokenCounter } from './tokenizer.js';
import { RULE_LEVELS } from './types.js';
import type {
  OptimizationResult,
  OptimizeOptions,
  RuleResult,
  Segment,
  TokenCounter,
  TokenProvenance,
  UsageProfile,
} from './types.js';

const MASK_OPEN = '\uE000';
const MASK_CLOSE = '\uE001';
const MASK_BASE = 0xe100;
/** Private-use-area slots available for masks. */
const MASK_CAPACITY = 0xf8ff - MASK_BASE;

export const DEFAULT_USAGE: UsageProfile = {
  model: DEFAULT_MODEL,
  callsPerMonth: 1000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
};

interface Masked {
  text: string;
  /** Original text of each protected segment, indexed by its mask. */
  vault: string[];
}

/**
 * Replaces every protected segment with a 3-character marker from the Unicode
 * private use area. The rules work on the masked text, so none of them can
 * touch code, URLs or template placeholders.
 */
function mask(segments: Segment[]): Masked {
  const vault: string[] = [];
  let text = '';

  for (const seg of segments) {
    if (seg.kind === 'mutable') {
      text += seg.text;
      continue;
    }
    if (vault.length >= MASK_CAPACITY) {
      // A prompt with thousands of protected blocks is left as-is rather than
      // risking a mask collision.
      text += seg.text;
      continue;
    }
    const slot = String.fromCharCode(MASK_BASE + vault.length);
    vault.push(seg.text);
    text += MASK_OPEN + slot + MASK_CLOSE;
  }

  return { text, vault };
}

/** Puts the protected content back. */
function unmask(text: string, vault: string[]): string {
  return text.replace(
    new RegExp(`${MASK_OPEN}([\\s\\S])${MASK_CLOSE}`, 'g'),
    (whole, slot: string) => {
      const index = slot.charCodeAt(0) - MASK_BASE;
      const original = vault[index];
      return original === undefined ? whole : original;
    },
  );
}

/** Distinct protected texts that must still be present after optimising. */
function distinctProtected(segments: Segment[]): string[] {
  return [...new Set(segments.filter((s) => s.kind === 'protected').map((s) => s.text))];
}

/**
 * Optimises a prompt by applying deterministic rules.
 *
 * The result is reproducible: the same input always yields the same output and
 * running it costs nothing. The optional LLM pass lives separately, in
 * `refineWithLlm`.
 */
export function optimize(prompt: string, options: OptimizeOptions = {}): OptimizationResult {
  const level = options.level ?? 'safe';
  /*
    An unknown level used to run `safe` and say nothing.

    The rule loop skips aggressive rules unless the level *is* `aggressive`, so
    every other string — a typo, a plausible-sounding `balanced` — silently
    produced safe-level results. The CLI has always refused `--level balanced`
    by name; a library caller got the quiet downgrade instead, and a report
    that says `safe` work was done at the level somebody asked for is the
    swallowed-flag defect one layer down. Nothing correct depends on the old
    behaviour: no program means `safe` by writing something else.
  */
  if (!RULE_LEVELS.includes(level)) {
    throw new Error(
      `level must be one of ${RULE_LEVELS.join(', ')} (received: ${JSON.stringify(level)})`,
    );
  }
  const locale: Locale = options.locale ?? DEFAULT_LOCALE;
  const t = getMessages(locale);
  const disabled = new Set<RuleId>(options.disableRules ?? []);
  const count: TokenCounter = options.tokenCounter ?? estimateTokens;

  const segments = segment(prompt);
  const mustSurvive = distinctProtected(segments);
  const { text: maskedOriginal, vault } = mask(segments);

  let current = maskedOriginal;
  const byRule = new Map<RuleId, RuleResult>();

  /*
    The pipeline runs to a fixed point, because one pass is not one.

    A single pass missed its own cascades: `emphasis` strips `IMPORTANT:` and
    leaves two lines equal but for a space, and `whitespace` — which would
    have collapsed that space — has already run, so `duplicate-lines` never
    sees the pair. The result was a tool that saves more when run on its own
    output, which is the writer's acceptance test failed by the tool that
    grades it. Found by a fuzzer, on 1 input in 4,000.

    The bound is a cap against oscillation, not a budget anybody expects to
    reach: pass two exists for the cascades and pass three is almost always
    the one that confirms nothing changed. A run that is still moving at the
    cap returns what it has — valid, merely short of the fixed point — and
    the idempotence property in the fuzz suite is what would make that loud.
  */
  const FIXED_POINT_PASSES = 5;
  for (let pass = 0; pass < FIXED_POINT_PASSES; pass += 1) {
    const atPassStart = current;

    for (const rule of RULES) {
      if (disabled.has(rule.id)) continue;
      if (rule.level === 'aggressive' && level !== 'aggressive') continue;

      const currentUnmasked = unmask(current, vault);
      const before = count(currentUnmasked);
      const { text: candidate, hits } = rule.apply(current);
      if (hits === 0 || candidate === current) continue;

      const candidateUnmasked = unmask(candidate, vault);

      // Safety net: if a rule made protected content disappear, that rule is
      // dropped rather than returning a broken prompt.
      const lostProtected = mustSurvive.some((text) => !candidateUnmasked.includes(text));
      if (lostProtected) continue;

      const after = count(candidateUnmasked);
      // Captured against the unmasked text on both sides, so the snippets read
      // as the author wrote them rather than showing private-use markers.
      const changes = extractChanges(currentUnmasked, candidateUnmasked);
      current = candidate;
      const copy = t.rules[rule.id];
      const existing = byRule.get(rule.id);
      if (existing === undefined) {
        byRule.set(rule.id, {
          id: rule.id,
          title: copy.title,
          rationale: copy.rationale,
          level: rule.level,
          hits,
          tokensSaved: Math.max(0, before - after),
          changes,
        });
      } else {
        // A rule that fires again in a later pass is one finding, continued:
        // its hits and saving accumulate rather than appearing as a second row.
        existing.hits += hits;
        existing.tokensSaved += Math.max(0, before - after);
        existing.changes = [...existing.changes, ...changes];
      }
    }

    if (current === atPassStart) break;
  }

  const ruleResults: RuleResult[] = [...byRule.values()];

  /*
    **Trimmed before the masks come off, not after.** `unmask(...).trim()` runs
    on the reassembled string, where a protected span is ordinary text again —
    so the trim could edit content every mask in this pipeline had just
    promised to leave alone. A prompt whose first line is indented code lost
    that indentation here, outside every guard, and the loss was invisible
    because the trim is the last thing that happens.

    It surfaced through idempotence rather than through a report: the block
    stopped looking like a block, so the next pass no longer protected it and
    the rules ate the code. The fuzzer found 54 of 1,500 corpus inputs that way.

    Trimming the masked string cannot reach a protected span, because a
    protected span is a placeholder at that point.
  */
  const optimized = unmask(current.trim(), vault);
  const tokensBefore = count(prompt);
  const tokensAfter = count(optimized);

  const usage: UsageProfile = { ...DEFAULT_USAGE, ...options.usage };
  const pricing = options.pricing ?? BUNDLED_CATALOGUE;
  const savings = computeSavings(tokensBefore, tokensAfter, usage, new Date(), pricing);
  const advisories = buildAdvisories(optimized, tokensAfter, usage, { count, locale, pricing });

  return {
    original: prompt,
    optimized,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    reductionPct: tokensBefore > 0 ? ((tokensBefore - tokensAfter) / tokensBefore) * 100 : 0,
    rules: ruleResults,
    advisories,
    savings,
    usage,
    locale,
    tokenSource: options.tokenCounter ? 'external' : 'heuristic',
    /*
     * Null even when a counter was supplied here, and that is not an oversight.
     * `optimize` takes a bare function: it can see that something other than
     * the heuristic ran and cannot see whose it was. Naming one would be an
     * invention, and `withExactTokenCounts` is where a caller that does know
     * says so.
     */
    countedBy: null,
    pricingSource: {
      lastReviewed: pricing.lastReviewed,
      overriddenModels: pricing.overriddenModels,
      addedModels: pricing.addedModels,
    },
  };
}

/**
 * Recomputes the report with an exact token counter (e.g. the official
 * token-counting endpoint).
 *
 * Only the headline numbers and the saving are recomputed. Per-rule token
 * attribution stays on the heuristic estimate: asking a remote counter once
 * per rule would multiply the calls without changing any decision.
 */
export async function withExactTokenCounts(
  result: OptimizationResult,
  counter: AsyncTokenCounter,
  pricing: PricingCatalogue = BUNDLED_CATALOGUE,
  countedBy: TokenProvenance | null = null,
): Promise<OptimizationResult> {
  // A result priced against an overlay cannot be recomputed against the bundled
  // catalogue: the token counts would come from one source and the money from
  // another, and the report would disagree with itself with nothing to show why.
  // Throwing is the only honest option — silently reverting to bundled prices is
  // the exact failure the overlay exists to prevent.
  const overlaid =
    result.pricingSource.overriddenModels.length > 0 ||
    result.pricingSource.addedModels.length > 0;
  if (overlaid && pricing === BUNDLED_CATALOGUE) {
    throw new Error(
      'This result was priced against a pricing overlay, so withExactTokenCounts ' +
        'needs the same catalogue passed as its third argument. Recomputing against ' +
        'the bundled prices would make the token counts and the costs disagree.',
    );
  }

  const [tokensBefore, tokensAfter] = await Promise.all([
    counter(result.original),
    counter(result.optimized),
  ]);

  const savings = computeSavings(tokensBefore, tokensAfter, result.usage, new Date(), pricing);
  const advisories = buildAdvisories(result.optimized, tokensAfter, result.usage, {
    locale: result.locale,
    pricing,
  });

  return {
    ...result,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    reductionPct: tokensBefore > 0 ? ((tokensBefore - tokensAfter) / tokensBefore) * 100 : 0,
    savings,
    advisories,
    tokenSource: 'external',
    /*
     * Optional and defaulting to null rather than to a guess. A caller that
     * knows whose counter it passed says so; one that does not gets `external`
     * with no claim attached, which is exactly as much as this function knows.
     */
    countedBy,
    pricingSource: {
      lastReviewed: pricing.lastReviewed,
      overriddenModels: pricing.overriddenModels,
      addedModels: pricing.addedModels,
    },
  };
}

/** Re-exports of internals useful to anyone extending the library. */
export { join, mask as maskProtected, segment, unmask as unmaskProtected };

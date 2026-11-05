/**
 * What the provider billed, beside what Trazum computed.
 *
 * The one figure nobody else gives you. Every other door here answers *what
 * did this usage cost at these rates*; the provider answers *what did we
 * charge you*, and the two are different questions that produce different
 * numbers. The gap between them is the interesting part, and until this file
 * there was nowhere to look at it.
 *
 * ## Why the two are never added
 *
 * `docs/commands.md` already states the rule for LiteLLM's `total_cost`: a
 * provider-billed figure is printed **beside** Trazum's and never merged into
 * it, because two price tables summed into one number is how a report becomes
 * quietly wrong. This file is that rule with arithmetic attached. Nothing here
 * corrects one figure with the other, and nothing here decides which is right:
 * they are two measurements of the same window, and the reader is the one
 * entitled to say which they trust.
 *
 * ## The unit, which is the trap
 *
 * `amount` is **a decimal string in the currency's lowest unit**: `"123.45"`
 * in USD is $1.2345, not $123.45. A reader of this API who takes the field for
 * dollars overstates a bill by a hundred times, and the figure looks entirely
 * plausible on a large organisation. It is divided by a hundred here, once, at
 * the end, and a test asserts the factor against the schema's own example.
 *
 * `currency` is documented as always `USD` today. It is still checked: a
 * converter that assumed it would be silently wrong the day it changes, and
 * summing two currencies into one total is the same failure as summing two
 * price tables. Anything but USD is refused rather than converted, because a
 * conversion needs a rate and inventing one is the sin this product is built
 * against.
 *
 * ## What the decomposition is for
 *
 * A difference nobody can attribute is a number that starts an argument. This
 * report can attribute most of one, when it is fetched with
 * `group_by[]=description`:
 *
 * - **`cost_type` other than `tokens`** — web search, code execution, session
 *   usage. Trazum prices web searches (since 2.7.5) and none of the rest, so
 *   what is set against this charge is the receipt's own `webSearchUsd`, and
 *   the difference between the two is billed money Trazum never claimed to
 *   cover. Named rather than blamed.
 * - **`service_tier: "batch"`** — billed at the batch tier, which Trazum
 *   prices at each model's batch rate since 2.7.4. Set against the receipt's
 *   own `batchUsd`, not taken out whole: taking out the provider's whole
 *   batch charge when Trazum's figure already holds its own batch calls
 *   understated the remainder by exactly those calls.
 *
 * What is left after both is the **remainder**, and it is the only figure here
 * worth arguing about: the same standard-tier tokens, priced two ways, or
 * usage the log never saw. A tool that folded the remainder into one of the
 * explanations would be hiding the only thing it was built to show.
 *
 * Without `group_by[]=description` none of that decomposition exists —
 * `cost_type`, `service_tier` and `model` are all `null` — and the reading
 * says so rather than reporting a remainder that is really the whole
 * difference wearing a smaller name.
 */

/**
 * What a provider charged, in the terms `reconcile` needs and no more.
 *
 * Two providers' reports read into it, and the difference between them is
 * confined to the files that read them: what the money was for, whether
 * batch can be told apart, which window, which currency.
 */
export interface BilledReading {
  /** Everything billed in the window, in dollars. */
  usd: number;
  /** Billed for something no token rate covers: web search, code execution. */
  notTokensUsd: number;
  /** Billed at the batch tier, which a catalogue rate is not the rate for. */
  batchUsd: number;
  /**
   * Whether this report can name a batch charge at all.
   *
   * Anthropic's can, once grouped by description. OpenAI's never does, so a
   * batch discount there sits inside the remainder and the reader is told.
   */
  batchSeparable: boolean;
  /**
   * Whether the report was fetched with the grouping that names each row.
   *
   * Without it nothing on a row says what the money was for, so neither
   * figure above can be separated from the total and a reconciliation can
   * only report a difference it cannot attribute.
   */
  described: boolean;
  /** The window the buckets actually cover, or `null` when there are none. */
  window: { fromMs: number; toMs: number } | null;
  /** Currencies seen that were not USD. Summing across them is refused. */
  otherCurrencies: string[];
}

/** What Anthropic charged, read from its own report. */
export interface AnthropicCostReading extends BilledReading {
  buckets: number;
  rows: number;
  /** Rows whose `amount` was not a number. Counted, never read as zero. */
  unreadableAmount: number;
  /** `has_more`: one page of several, so the billed figure is understated. */
  truncated: boolean;
  /** The input was not the JSON this endpoint returns. */
  unparseable: boolean;
}

/** Two measurements of one window, and what separates them. */
export interface Reconciliation {
  computedUsd: number;
  billedUsd: number;
  /** Billed minus computed. Positive means the provider charged more. */
  differenceUsd: number;
  /** What the provider billed for something other than tokens, and at the batch tier. */
  notTokensUsd: number;
  batchUsd: number;
  /**
   * What Trazum's own figure holds of each: web searches, and calls priced at
   * the batch rate. `null` when the receipt does not say, which is every
   * receipt before 2.7.5; the comparison then reads them as zero and says so
   * (`computedSplitKnown`).
   */
  computedWebSearchUsd: number | null;
  computedBatchUsd: number | null;
  /** Whether the receipt said what its batch calls and searches cost. */
  computedSplitKnown: boolean;
  /**
   * What neither figure explains: the same standard-tier tokens priced two
   * ways, or usage the log never saw. The only number here worth arguing
   * about, and never folded into the two above.
   */
  remainderUsd: number;
  /** `false` when the report was not grouped in a way that names its rows. */
  attributable: boolean;
  /** `false` when this provider's report cannot name a batch charge at all. */
  batchSeparable: boolean;
  /** Why the two are not comparable, when they are not. */
  refusal:
    | { reason: 'no-billed-window' }
    | { reason: 'window-not-covered'; computed: { fromMs: number; toMs: number }; billed: { fromMs: number; toMs: number } }
    | { reason: 'other-currency'; currencies: string[] }
    | null;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Read a cost report. Pure, like every measuring function here, and for the
 * same reason `anthropic-usage.ts` gives: the credential that fetches this is
 * an admin credential, and this project holds none.
 */
export function anthropicCostReport(text: string): AnthropicCostReading {
  const empty: AnthropicCostReading = {
    usd: 0,
    notTokensUsd: 0,
    batchUsd: 0,
    batchSeparable: false,
    described: false,
    window: null,
    buckets: 0,
    rows: 0,
    otherCurrencies: [],
    unreadableAmount: 0,
    truncated: false,
    unparseable: false,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: true };
  }
  const report = asObject(parsed);
  if (report === null || !Array.isArray(report.data)) return { ...empty, unparseable: true };

  /* Summed in cents and divided once, because summing a hundredth of a cent a
     thousand times and dividing each time is a different number. */
  let cents = 0;
  let notTokensCents = 0;
  let batchCents = 0;
  let described = false;
  let buckets = 0;
  let rows = 0;
  let unreadableAmount = 0;
  let fromMs: number | null = null;
  let toMs: number | null = null;
  const otherCurrencies = new Set<string>();

  for (const entry of report.data) {
    const bucket = asObject(entry);
    if (bucket === null || typeof bucket.starting_at !== 'string') continue;
    buckets += 1;

    const from = Date.parse(bucket.starting_at);
    const to = typeof bucket.ending_at === 'string' ? Date.parse(bucket.ending_at) : Number.NaN;
    if (Number.isFinite(from)) fromMs = fromMs === null ? from : Math.min(fromMs, from);
    if (Number.isFinite(to)) toMs = toMs === null ? to : Math.max(toMs, to);

    if (!Array.isArray(bucket.results)) continue;
    for (const found of bucket.results) {
      const result = asObject(found);
      if (result === null) continue;
      rows += 1;

      /* A currency this cannot sum stops it being summed at all, rather than
         being quietly added to a dollar total. */
      if (typeof result.currency === 'string' && result.currency !== 'USD') {
        otherCurrencies.add(result.currency);
      }

      const amount = typeof result.amount === 'string' ? Number(result.amount) : Number.NaN;
      if (!Number.isFinite(amount)) {
        unreadableAmount += 1;
        continue;
      }
      cents += amount;

      if (typeof result.cost_type === 'string') {
        described = true;
        if (result.cost_type !== 'tokens') notTokensCents += amount;
      }
      if (typeof result.service_tier === 'string') {
        described = true;
        if (result.service_tier === 'batch') batchCents += amount;
      }
    }
  }

  return {
    usd: cents / 100,
    notTokensUsd: notTokensCents / 100,
    batchUsd: batchCents / 100,
    batchSeparable: described,
    described,
    window: fromMs === null || toMs === null ? null : { fromMs, toMs },
    buckets,
    rows,
    otherCurrencies: [...otherCurrencies],
    unreadableAmount,
    truncated: report.has_more === true,
    unparseable: false,
  };
}

/**
 * Set what Trazum computed beside what the provider billed.
 *
 * @param computed what Trazum priced, and the window it priced.
 *
 * **The windows must line up or this refuses.** A receipt for September set
 * against a bill for August is a wrong number under a right title, which is
 * the failure this whole product is arranged against. The billed window has
 * to contain the computed one — daily buckets are wider than a receipt's span
 * by construction, so containment rather than equality is the honest test —
 * and a report that starts after the first call it is being compared with is
 * missing money nobody would see was missing.
 */
export function reconcile(
  computed: { usd: number; fromMs: number; toMs: number; batchUsd?: number; webSearchUsd?: number },
  billed: BilledReading,
): Reconciliation {
  const known = (value: number | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const computedBatchUsd = known(computed.batchUsd);
  const computedWebSearchUsd = known(computed.webSearchUsd);
  const bare = {
    computedUsd: computed.usd,
    billedUsd: billed.usd,
    differenceUsd: billed.usd - computed.usd,
    notTokensUsd: billed.notTokensUsd,
    batchUsd: billed.batchUsd,
    computedWebSearchUsd,
    computedBatchUsd,
    computedSplitKnown: computedBatchUsd !== null && computedWebSearchUsd !== null,
    remainderUsd: 0,
    attributable: billed.described,
    batchSeparable: billed.batchSeparable,
  };

  if (billed.otherCurrencies.length > 0) {
    return { ...bare, refusal: { reason: 'other-currency', currencies: billed.otherCurrencies } };
  }
  if (billed.window === null) return { ...bare, refusal: { reason: 'no-billed-window' } };
  if (billed.window.fromMs > computed.fromMs || billed.window.toMs < computed.toMs) {
    return {
      ...bare,
      refusal: {
        reason: 'window-not-covered',
        computed: { fromMs: computed.fromMs, toMs: computed.toMs },
        billed: billed.window,
      },
    };
  }

  /*
    The remainder is what is left when each of the report's own explanations
    is set against what Trazum computed for the same thing and the two
    differences are taken out: billed non-token charges against computed
    searches, billed batch against computed batch. What remains is the
    standard-tier tokens, billed against computed. It is deliberately not
    clamped at zero. A negative one is a real answer -- Trazum priced more
    than the provider charged -- and reporting it as zero would hide a stale
    rate in exactly the direction that costs somebody money.
  */
  /*
    A category is set off only where the report can name it. A report that
    cannot say which lines were batch (OpenAI's, or one not grouped by
    description) has its batch charge inside its total like Trazum's figure
    has its batch calls, and taking out Trazum's side alone would move the
    remainder by exactly those calls. The same for non-token charges.
  */
  const nonTokens = billed.described ? billed.notTokensUsd - (computedWebSearchUsd ?? 0) : 0;
  const batch = billed.batchSeparable ? billed.batchUsd - (computedBatchUsd ?? 0) : 0;
  return {
    ...bare,
    remainderUsd: bare.differenceUsd - nonTokens - batch,
    refusal: null,
  };
}

/**
 * Whether this text is a cost report rather than some other JSON.
 *
 * `amount` with `currency` beside it, in a document with buckets: the usage
 * report has neither, and a Messages response has no buckets.
 */
export function looksLikeAnthropicCost(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (!head.includes('"amount"') || !head.includes('"currency"')) return false;
  return head.includes('"starting_at"') || head.includes('"has_more"');
}

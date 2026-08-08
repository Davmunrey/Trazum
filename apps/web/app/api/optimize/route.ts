import { NextResponse } from 'next/server';

import {
  RULES,
  allowedEndpoints,
  anthropicProvider,
  getModel,
  listModels,
  openAiCompatible,
  optimize,
  providerFromEnv,
  applyRewrites,
  computeSavings,
  estimateTokens,
  refineWithLlm,
  suggestRewrites,
  reorderForCache,
  resolveEndpoint,
  resolveLocale,
  validateLlmEndpoint,
} from '@trazum/core';
import type {
  Locale,
  SuggestResult,
  LlmProvider,
  ReorderResult,
  RuleId,
  RuleLevel,
  UsageProfile,
} from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
import type { WebMessages } from '../../../lib/i18n';

export const runtime = 'nodejs';

/** Size cap: stops an open tab from taking the process down. */
const MAX_PROMPT_CHARS = 400_000;

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------

/**
 * In-memory sliding window per IP. On serverless each instance keeps its own
 * counter, so the real limit can be somewhat looser: this is a barrier against
 * accidental abuse, not a billing quota.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    // Take the chance to purge expired entries so the map cannot grow forever.
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets) {
        if (now >= value.resetAt) rateBuckets.delete(key);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  bucket.count++;
  return bucket.count > RATE_MAX_REQUESTS;
}

// --------------------------------------------------------------------------
// SSRF protection
// --------------------------------------------------------------------------

/**
 * Turns a caller-supplied endpoint into one this deployment allows.
 *
 * This used to validate the string and then pass the string on, which is the
 * same check-then-use seam that kept the CodeQL alert open inside the core: the
 * value that reached `fetch` was never the value that was checked. Worse, the
 * check could not have been sufficient anyway — the host filter reads a name,
 * and a name an attacker controls can resolve wherever they like.
 *
 * So the body no longer names a host. `resolveEndpoint` compares it to
 * `TRAZUM_ALLOWED_LLM_ENDPOINTS` and returns **the operator's entry**, which is
 * what gets fetched. When the list is empty — the default — there is nothing to
 * select and the server only ever calls what its own environment configured.
 *
 * `validateLlmEndpoint` still runs on the way in, purely so the refusal names
 * the actual problem in the reader's language instead of "not on the list".
 */
function resolveRequestedEndpoint(raw: string, t: WebMessages): { url: string } | { error: string } {
  const rejection = validateLlmEndpoint(raw, {
    allowInsecure: process.env.NODE_ENV === 'development',
  });

  switch (rejection) {
    case 'invalid-url':
    case 'credentials-in-url':
      return { error: t.api.invalidEndpointUrl };
    case 'insecure-scheme':
      return { error: t.api.endpointMustBeHttps };
    case 'private-host':
      return { error: t.api.endpointMustBePublic };
  }

  const allowed = allowedEndpoints(process.env);
  const listed = resolveEndpoint(raw, allowed);
  if (listed === null) {
    return {
      error: allowed.length === 0 ? t.api.endpointNotOffered : t.api.endpointNotAllowed(allowed),
    };
  }
  return { url: listed };
}

interface RequestBody {
  prompt?: unknown;
  level?: unknown;
  locale?: unknown;
  usage?: Partial<UsageProfile>;
  disableRules?: unknown;
  /**
   * Rearrange the prompt so its stable instructions reach the cacheable prefix.
   *
   * Opt-in over HTTP for the same reason it is opt-in on the command line, and
   * the reason is worth stating rather than leaving in the diff: every other
   * transformation this endpoint performs deletes text whose absence is local,
   * and this one *moves* text, where order carries meaning. The caller has to
   * ask, and the response carries what was declined so they can judge it.
   *
   * Nothing about it is less safe here than in the CLI — it runs on the same
   * deterministic core, sends nothing anywhere, and returns the prompt
   * byte-identical when it cannot act — but "the browser did it quietly" is not
   * a thing this endpoint should ever be able to do.
   */
  reorder?: unknown;
  /**
   * Ask the LLM for phrase-level rewrites and return them without applying any.
   *
   * Separate from `llm.enabled` because they are different questions: that one
   * rewrites the whole prompt, this one proposes phrases you can accept
   * individually. Asking for both is allowed and runs two calls.
   */
  suggest?: unknown;
  /**
   * Apply the suggestions. Honoured only on a literal `true`, like `reorder`.
   *
   * A truthy check would let `"false"` rewrite somebody's prompt, and this
   * rewrite comes from a model — which makes it the last thing that should
   * happen because a string was non-empty.
   */
  applySuggestions?: unknown;
  llm?: {
    enabled?: boolean;
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Locale for this request: what the caller asked for, falling back to the
 * browser's `Accept-Language`. Applies to the report and to this route's own
 * error messages, so a failure never arrives in a language the caller did not
 * choose.
 */
function localeOf(request: Request, body?: RequestBody): Locale {
  const requested = typeof body?.locale === 'string' ? body.locale : null;
  return resolveLocale(requested ?? request.headers.get('accept-language'));
}

/**
 * Builds the LLM provider for this request.
 *
 * Priority: whatever comes in the body (so endpoints can be tried from the
 * UI), otherwise the server's environment configuration. Keys arriving in the
 * body are used and discarded: never logged, never stored.
 */
function buildProvider(
  config: NonNullable<RequestBody['llm']>,
  /**
   * The endpoint to use, already resolved to an entry the operator listed.
   *
   * Taken as an argument rather than read back off `config` on purpose. Reading
   * `config.baseUrl` here is what made the caller's validation decorative: the
   * checked expression and the used expression were different, one function
   * apart. Now the only endpoint this function can reach is one that came off
   * the allowlist.
   */
  endpoint: string | null,
): LlmProvider | null {
  const { provider, model, apiKey } = config;

  if (provider === 'anthropic') {
    const key = apiKey || process.env.TRAZUM_LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return providerFromEnv();
    return anthropicProvider({ apiKey: key, ...(model ? { model } : {}) });
  }

  if (endpoint && model) {
    return openAiCompatible({
      baseUrl: endpoint,
      model,
      ...(apiKey || process.env.TRAZUM_LLM_API_KEY
        ? { apiKey: apiKey || process.env.TRAZUM_LLM_API_KEY! }
        : {}),
      name: 'llm',
    });
  }

  return providerFromEnv();
}

export async function POST(request: Request) {
  if (rateLimited(request)) {
    // No body has been read yet, so the header is all we have to go on.
    const t = getWebMessages(localeOf(request));
    return NextResponse.json({ error: t.api.rateLimited }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest(getWebMessages(localeOf(request)).api.invalidJson);
  }

  const locale = localeOf(request, body);
  const t = getWebMessages(locale);

  const { prompt } = body;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return badRequest(t.api.missingPrompt);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return badRequest(t.api.promptTooLong(MAX_PROMPT_CHARS.toLocaleString(t.numberLocale)));
  }

  const level: RuleLevel = body.level === 'aggressive' ? 'aggressive' : 'safe';

  const disableRules = Array.isArray(body.disableRules)
    ? body.disableRules.filter((id): id is string => typeof id === 'string')
    : [];
  const unknownRule = disableRules.find((id) => !RULES.some((r) => r.id === id));
  if (unknownRule) return badRequest(t.api.unknownRule(unknownRule));

  const usage = body.usage ?? {};
  if (usage.model && !listModels().some((m) => m.id === usage.model)) {
    return badRequest(t.api.unknownModel(usage.model));
  }

  /**
   * `applySuggestions` on its own is a request that cannot be honoured.
   *
   * Found by sending it: the response came back `200`, with a full report, no
   * `suggestions` key and the prompt untouched — the one thing the caller asked
   * for silently did not happen. That is the same failure as a misspelled field,
   * which this route already refuses for `disableRules` and `usage.model`, and
   * the CLI already refuses for the matching pair of flags. There was no reason
   * for the HTTP surface to be the lenient one.
   *
   * Only a literal `true` is refused, because only a literal `true` would have
   * been honoured. `applySuggestions: "false"` is declined either way, so it
   * asks for nothing and gets nothing — which is what it says.
   */
  if (body.applySuggestions === true && body.suggest !== true) {
    return badRequest(t.api.applyNeedsSuggest);
  }

  try {
    // Before the rules, as in the CLI: the rearrangement is decided on the
    // prompt the author wrote, which is the one they will review it against.
    const reorder: ReorderResult | null =
      body.reorder === true
        ? reorderForCache(prompt, {
            minPrefixTokens: getModel(usage.model ?? '').cacheMinTokens,
          })
        : null;

    let result = optimize(reorder?.text ?? prompt, {
      level,
      usage,
      locale,
      disableRules: disableRules as RuleId[],
    });

    // The diff the browser draws compares `original` with `optimized`. Leaving
    // `original` as the rearrangement would show only the deletions and hide
    // the one change the caller has to make a judgement about.
    if (reorder !== null && reorder.moved.length > 0) {
      result = { ...result, original: prompt };
    }

    let suggestions: SuggestResult | null = null;
    const applySuggestions = body.applySuggestions === true;

    if (body.llm?.enabled || body.suggest === true) {
      let endpoint: string | null = null;
      if (body.llm?.baseUrl) {
        const resolved = resolveRequestedEndpoint(body.llm.baseUrl, t);
        if ('error' in resolved) return badRequest(resolved.error);
        endpoint = resolved.url;
      }
      const provider = buildProvider(body.llm ?? {}, endpoint);
      if (!provider) {
        return badRequest(t.api.llmNotConfigured);
      }

      // Suggestions first, on the deterministic result. Running them after
      // `refineWithLlm` would ask the model about its own rewrite, which is a
      // different and much less useful question.
      if (body.suggest === true) {
        suggestions = await suggestRewrites(result.optimized, provider, { locale });

        // Applied only on a literal `true`, like `reorder`. The body is
        // untrusted and a truthy check would let `"false"` rewrite somebody's
        // prompt — and this rewrite comes from a model, which makes it the last
        // thing that should happen because a string was non-empty.
        if (applySuggestions && suggestions.suggestions.length > 0) {
          const rewritten = applyRewrites(result.optimized, suggestions.suggestions);
          result = {
            ...result,
            optimized: rewritten,
            tokensAfter: estimateTokens(rewritten),
          };
          result = {
            ...result,
            tokensSaved: result.tokensBefore - result.tokensAfter,
            reductionPct:
              result.tokensBefore > 0
                ? ((result.tokensBefore - result.tokensAfter) / result.tokensBefore) * 100
                : 0,
            savings: computeSavings(result.tokensBefore, result.tokensAfter, result.usage),
          };
        }
      }

      if (body.llm?.enabled) {
        result = await refineWithLlm(result, provider, { locale });
      }
    }

    // `reorder` goes in whenever it was asked for, including when nothing
    // moved: a caller reading `optimized` is reading text in an order the author
    // did not write, and must not have to infer that from the diff.
    return NextResponse.json({
      ...result,
      ...(reorder === null ? {} : { reorder }),
      // Present whenever suggestions were asked for, applied or not: a caller
      // must be able to tell "nothing was proposed" from "proposals are
      // waiting", and whether the text it is holding was rewritten.
      ...(suggestions === null ? {} : { suggestions: { ...suggestions, applied: applySuggestions } }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t.api.unexpected;
    // The failure usually comes from the external LLM, not from our code.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Metadata the UI needs to render its dropdowns. */
export async function GET() {
  return NextResponse.json({
    models: listModels(),
    llmConfiguredOnServer: providerFromEnv() !== null,
    // What the UI is allowed to offer. Empty is the default and the honest
    // answer: this server will not fetch an endpoint a visitor names.
    allowedEndpoints: allowedEndpoints(process.env),
  });
}

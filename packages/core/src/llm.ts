import { buildAdvisories } from './advisories.js';
import { getMessages } from './i18n/index.js';
import { signRequest } from './aws-sigv4.js';
import { accessToken } from './gcp-auth.js';
import type { CachedToken, ServiceAccount } from './gcp-auth.js';
import { SAFE_FETCH_INIT, checkedEndpoint } from './net.js';
import type { Locale } from './i18n/types.js';
import { computeSavings } from './savings.js';
import { segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { LlmProvider, OptimizationResult, TokenCounter } from './types.js';

/**
 * Optional LLM layer.
 *
 * The deterministic core already does the work at zero cost. This pass adds
 * the semantic compression rules cannot do — rewriting a whole sentence,
 * merging two instructions that say the same thing in different words — and
 * that is why it costs one call.
 *
 * The provider is pluggable on purpose: your own hosted model, an
 * OpenAI-compatible endpoint, the Claude API or anything else behind
 * `customProvider`.
 */

export const REFINER_SYSTEM_PROMPT = `You rewrite prompts so they cost fewer tokens without changing what they ask for.

Rules:
- Preserve exactly the same task, constraints, output format and success criteria.
- Copy verbatim, without changing a single character: code blocks, URLs, template placeholders ({{x}}, \${x}, {x}) and XML/HTML tags.
- Do not summarise and do not drop requirements. When in doubt about whether something is a requirement, keep it.
- Remove redundancy, padding and repetition. Merge duplicated instructions.
- Keep the original language of the prompt.
- Return ONLY the rewritten prompt. No explanations, no commentary, no code fences wrapping the answer.`;

export interface RefineOptions {
  /**
   * Minimum fraction of tokens the result must keep (0-1). Below this
   * threshold the model is assumed to have summarised rather than compressed,
   * and the candidate is rejected. Defaults to 0.25.
   */
  minRetainRatio?: number;
  tokenCounter?: TokenCounter;
  /** Language of the rejection reason. Defaults to the result's locale. */
  locale?: Locale;
}

/** Strips code fences if the model wrapped its answer despite being asked not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^(?:```|~~~)[a-zA-Z]*\n([\s\S]*?)\n?(?:```|~~~)$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/**
 * Runs the already-optimised prompt through the LLM and accepts the result
 * only if it passes the safety checks.
 *
 * It never returns a prompt worse than the deterministic one: if the candidate
 * loses protected content, grows in tokens or shrinks suspiciously, it is
 * discarded and the previous result stands.
 */
export async function refineWithLlm(
  result: OptimizationResult,
  provider: LlmProvider,
  options: RefineOptions = {},
): Promise<OptimizationResult> {
  const count = options.tokenCounter ?? estimateTokens;
  const minRetainRatio = options.minRetainRatio ?? 0.25;
  const locale = options.locale ?? result.locale;
  const t = getMessages(locale);

  const raw = await provider.complete({
    system: REFINER_SYSTEM_PROMPT,
    user: result.optimized,
  });
  const candidate = stripCodeFence(raw);
  const tokensBefore = result.tokensAfter;
  const tokensAfter = count(candidate);

  const base = {
    provider: provider.name,
    model: provider.model,
    candidate,
    tokensBefore,
    tokensAfter,
  };

  const reject = (rejectedReason: string): OptimizationResult => ({
    ...result,
    llm: { ...base, applied: false, rejectedReason },
  });

  if (!candidate.trim()) {
    return reject(t.llm.emptyResponse());
  }

  // Protected content has to still be there, character for character.
  const mustSurvive = [
    ...new Set(
      segment(result.optimized)
        .filter((s) => s.kind === 'protected')
        .map((s) => s.text),
    ),
  ];
  const lost = mustSurvive.filter((text) => !candidate.includes(text));
  if (lost.length > 0) {
    return reject(t.llm.protectedContentAltered(lost.length));
  }

  if (tokensAfter >= tokensBefore) {
    return reject(t.llm.notShorter(tokensAfter, tokensBefore));
  }

  if (tokensAfter < tokensBefore * minRetainRatio) {
    return reject(t.llm.suspiciousShrink(Math.round((tokensAfter / tokensBefore) * 100)));
  }

  const finalTokensBefore = result.tokensBefore;
  const savings = computeSavings(finalTokensBefore, tokensAfter, result.usage);
  const advisories = buildAdvisories(candidate, tokensAfter, result.usage, { count, locale });

  return {
    ...result,
    optimized: candidate,
    tokensAfter,
    tokensSaved: finalTokensBefore - tokensAfter,
    reductionPct:
      finalTokensBefore > 0 ? ((finalTokensBefore - tokensAfter) / finalTokensBefore) * 100 : 0,
    savings,
    advisories,
    llm: { ...base, applied: true },
  };
}

// --------------------------------------------------------------------------
// Bundled providers
// --------------------------------------------------------------------------

export interface OpenAiCompatibleOptions {
  /** Base URL, without `/chat/completions`. E.g. `https://llm.example.com/v1` */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Extra headers, in case your gateway requires its own. */
  headers?: Record<string, string>;
  /** Name shown in the report. */
  name?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /**
   * Allow http and private hosts — localhost, the RFC1918 ranges, the cloud
   * metadata address.
   *
   * **Only when the operator chose the URL.** That is the whole distinction. An
   * endpoint from `TRAZUM_LLM_BASE_URL` is somebody configuring their own
   * machine, and pointing it at `http://localhost:11434` for Ollama is the
   * documented normal case. An endpoint arriving in an HTTP request body is a
   * stranger naming a host for this server to fetch, which is server-side
   * request forgery whatever else it is called.
   */
  allowInsecure?: boolean;
}

/**
 * The endpoint check lives in `net.ts`, beside the validator and beside the
 * `fetch` options every server-side call here carries.
 *
 * At construction rather than at call time, so a provider that can never work
 * does not exist to be handed around.
 *
 * The web route already validates a body-supplied URL before it gets here, and
 * that stays — it turns the reason code into a sentence in the reader's
 * language. This is the second lock, at the boundary. `openAiCompatible` is an
 * exported library function, so "the caller checks" is a promise about every
 * future caller, including ones outside this repository.
 */

/**
 * Any endpoint speaking OpenAI's `/chat/completions` format. Covers vLLM,
 * Ollama, OpenRouter, LM Studio, Together and most internal gateways.
 */
export function openAiCompatible(options: OpenAiCompatibleOptions): LlmProvider {
  const {
    baseUrl,
    apiKey,
    model,
    headers = {},
    name = 'openai-compatible',
    maxTokens = 8192,
    fetchImpl = fetch,
    allowInsecure = false,
  } = options;

  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name });

  return {
    name,
    model,
    async complete({ system, user }) {
      const res = await fetchImpl(`${endpoint}/chat/completions`, {
        ...SAFE_FETCH_INIT,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...headers,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Provider "${name}" responded ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error(`Unexpected response from "${name}": choices[0].message.content not found`);
      }
      return content;
    },
  };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /** See `OpenAiCompatibleOptions.allowInsecure`: only when you chose the URL. */
  allowInsecure?: boolean;
}

/** The Claude API directly, via `/v1/messages`. */
export function anthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const {
    apiKey,
    model = 'claude-opus-5',
    baseUrl = 'https://api.anthropic.com',
    maxTokens = 8192,
    fetchImpl = fetch,
    allowInsecure = false,
  } = options;

  // The same door, one along. This one has a safe default, which is exactly why
  // it is easy to forget that the option overriding it is a network target.
  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name: 'anthropic' });

  return {
    name: 'anthropic',
    model,
    async complete({ system, user }) {
      const res = await fetchImpl(`${endpoint}/v1/messages`, {
        ...SAFE_FETCH_INIT,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`The Claude API responded ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        stop_reason?: string;
      };
      if (data.stop_reason === 'refusal') {
        throw new Error('The Claude API declined the request (stop_reason: refusal).');
      }
      const text = data.content?.find((b) => b.type === 'text')?.text;
      if (typeof text !== 'string') {
        throw new Error('Unexpected response from the Claude API: no text block.');
      }
      return text;
    },
  };
}

/**
 * Reads an answer out of Google's `generateContent` response, or refuses.
 *
 * Shared by `geminiProvider` and `vertexProvider`, which speak to the same API
 * behind different credentials. Two copies of "is this answer complete" is one
 * copy too many: the whole point of these checks is that three of Google's
 * failure modes arrive as HTTP 200, and a second copy is a second place for one
 * of them to be forgotten.
 *
 * `label` names the surface in the error, because "Gemini refused" and "Vertex
 * refused" send somebody to different consoles.
 */
function readGeminiAnswer(payload: unknown, label: string): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };

  const blocked = data.promptFeedback?.blockReason;
  if (blocked) {
    throw new Error(`${label} blocked the prompt (${blocked}).`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Unexpected response from ${label}: no candidates.`);
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    // Refused rather than returned. A truncated rewrite is the failure this
    // whole package is built to avoid: it reads as an answer.
    throw new Error(`${label} stopped at the token limit — the answer is incomplete.`);
  }
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    throw new Error(`${label} declined the request (${candidate.finishReason}).`);
  }

  const text = candidate.content?.parts?.map((part) => part.text ?? '').join('');
  if (!text) {
    throw new Error(`Unexpected response from ${label}: no text in the candidate.`);
  }
  return text;
}

export interface GeminiProviderOptions {
  apiKey: string;
  /** Default: `gemini-2.5-pro`. */
  model?: string;
  /** Default: Google's public endpoint. */
  baseUrl?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  /** See `OpenAiCompatibleOptions.allowInsecure`: only when you chose the URL. */
  allowInsecure?: boolean;
}

/**
 * Gemini directly, via `generateContent`.
 *
 * The one provider on the list that needs its own function rather than the
 * OpenAI-compatible path. Everything else — Groq, Together, Fireworks,
 * DeepInfra, Cerebras, SiliconFlow, OpenRouter, LiteLLM — speaks the OpenAI
 * shape, so `openAiCompatibleProvider` with a base URL is the whole
 * integration. Google's is a different document: the system prompt is
 * `systemInstruction` rather than a message, turns are `contents` with `parts`,
 * and the answer is the first candidate's parts joined.
 *
 * Three failure modes that are not HTTP errors, and each has bitten somebody:
 *
 * - **A safety block returns 200.** `promptFeedback.blockReason` arrives with no
 *   candidates at all, so reading `candidates[0]` gives `undefined` and the
 *   caller sees "no text" for what is actually a refusal.
 * - **`finishReason: MAX_TOKENS` also returns 200**, with a truncated answer.
 *   For a rewrite pass that is worse than an error: the text looks like a
 *   result and is half a result.
 * - **Parts can be empty.** A candidate with no text part is a valid document
 *   and not a valid answer.
 *
 * The key goes in a header, not the query string. Google's own examples put it
 * in `?key=`, which puts a credential in every proxy log and referrer between
 * here and there.
 */
export function geminiProvider(options: GeminiProviderOptions): LlmProvider {
  const {
    apiKey,
    model = 'gemini-2.5-pro',
    baseUrl = 'https://generativelanguage.googleapis.com',
    maxTokens = 8192,
    fetchImpl = fetch,
    allowInsecure = false,
  } = options;

  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name: 'gemini' });

  return {
    name: 'gemini',
    model,
    async complete({ system, user }) {
      const res = await fetchImpl(
        `${endpoint}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          ...SAFE_FETCH_INIT,
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`The Gemini API responded ${res.status}: ${await res.text()}`);
      }
      return readGeminiAnswer(await res.json(), 'The Gemini API');
    },
  };
}

export interface BedrockProviderOptions {
  /** e.g. `anthropic.claude-sonnet-4-5-20250929-v1:0`. */
  model: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For temporary credentials from STS or an instance role. */
  sessionToken?: string;
  maxTokens?: number;
  /** Override the host. Defaults to the regional Bedrock runtime endpoint. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  allowInsecure?: boolean;
  /** Injectable for tests; the signature is a function of the clock. */
  now?: () => Date;
}

/**
 * Amazon Bedrock, through **Converse** rather than `InvokeModel`.
 *
 * That choice is the whole reason this is one provider instead of six.
 * `InvokeModel` takes a body in each model family's own shape — Anthropic's
 * `messages` with `anthropic_version`, Meta's `prompt`, Amazon's
 * `inputText` — so supporting "Bedrock" through it means supporting each vendor
 * separately and getting a 400 for every model nobody thought about. `Converse`
 * is Bedrock's unified surface: one request shape, one response shape, every
 * model that supports it.
 *
 * Signed with SigV4 by hand — see `aws-sigv4.ts` for why there is no SDK here
 * and what the tests do and do not prove.
 *
 * `stopReason: 'max_tokens'` throws, for the same reason it does on Gemini: a
 * truncated rewrite reads exactly like a finished one, and that is the failure
 * this package exists to refuse.
 */
export function bedrockProvider(options: BedrockProviderOptions): LlmProvider {
  const {
    model,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    maxTokens = 8192,
    baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`,
    fetchImpl = fetch,
    allowInsecure = false,
    now = () => new Date(),
  } = options;

  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name: 'bedrock' });
  const host = new URL(endpoint).host;

  return {
    name: 'bedrock',
    model,
    async complete({ system, user }) {
      /**
       * Bedrock model ids contain a colon — `anthropic.claude-v2:1` — and AWS's
       * own URLs carry it unencoded, which RFC 3986 permits in a path segment.
       *
       * The comment that used to sit here claimed `encodeURIComponent` leaves it
       * alone. It does not: it produces `%3A`. The signature would still have
       * matched, because the same string is signed and sent — but the request
       * would have gone to a path AWS does not document, and whether its router
       * normalises `%3A` back to `:` is not something this repository can find
       * out from here. A test asserting the path exactly is what surfaced it.
       *
       * So: encode, then put the colon back. `/` stays encoded, which is the one
       * character that would change the shape of the path rather than a
       * character in it.
       */
      const path = `/model/${encodeURIComponent(model).replace(/%3A/g, ':')}/converse`;
      const body = JSON.stringify({
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: user }] }],
        inferenceConfig: { maxTokens, temperature: 0 },
      });

      const signed = await signRequest({
        method: 'POST',
        path,
        host,
        region,
        service: 'bedrock',
        body,
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
        now: now(),
      });

      const res = await fetchImpl(`${endpoint}${path}`, {
        ...SAFE_FETCH_INIT,
        method: 'POST',
        headers: { ...signed, 'content-type': 'application/json' },
        body,
      });

      if (!res.ok) {
        throw new Error(`Bedrock responded ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
        stopReason?: string;
      };

      if (data.stopReason === 'max_tokens') {
        throw new Error('Bedrock stopped at the token limit — the answer is incomplete.');
      }
      if (data.stopReason === 'content_filtered') {
        throw new Error('Bedrock filtered the response (stopReason: content_filtered).');
      }

      const text = data.output?.message?.content?.map((part) => part.text ?? '').join('');
      if (!text) {
        throw new Error('Unexpected response from Bedrock: no text in the message.');
      }
      return text;
    },
  };
}

export interface VertexProviderOptions {
  /** The parsed contents of a service-account JSON key. */
  serviceAccount: ServiceAccount;
  project: string;
  /** e.g. `us-central1`. `global` is also valid for some models. */
  location: string;
  /** Default: `gemini-2.5-pro`. */
  model?: string;
  /** Default: `google`. `anthropic` for Claude on Vertex. */
  publisher?: string;
  maxTokens?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  allowInsecure?: boolean;
  now?: () => Date;
}

/**
 * Gemini through Vertex AI, with a service account instead of an API key.
 *
 * Vertex will not take an API key, which is the whole difference from
 * `geminiProvider`: the credential is a signed assertion traded for an access
 * token that lasts an hour. `gcp-auth.ts` does that, caches the token, and
 * explains why there is no SDK.
 *
 * The response shape is Gemini's, so the same three HTTP-200 failures apply and
 * are refused the same way — a blocked prompt, a truncated answer, an empty
 * candidate. The parsing is shared with `geminiProvider` rather than copied,
 * because two copies of "is this answer complete" is one copy too many.
 */
export function vertexProvider(options: VertexProviderOptions): LlmProvider {
  const {
    serviceAccount,
    project,
    location,
    model = 'gemini-2.5-pro',
    publisher = 'google',
    maxTokens = 8192,
    baseUrl = location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${location}-aiplatform.googleapis.com`,
    fetchImpl = fetch,
    allowInsecure = false,
    now = () => new Date(),
  } = options;

  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name: 'vertex' });
  // One cache per provider instance, so two providers in one process do not
  // share a token — and neither leaks into the other's requests.
  const cache: { current: CachedToken | null } = { current: null };

  return {
    name: 'vertex',
    model,
    async complete({ system, user }) {
      const token = await accessToken(serviceAccount, { fetchImpl, now, cache });

      const path =
        `/v1/projects/${encodeURIComponent(project)}` +
        `/locations/${encodeURIComponent(location)}` +
        `/publishers/${encodeURIComponent(publisher)}` +
        `/models/${encodeURIComponent(model)}:generateContent`;

      const res = await fetchImpl(`${endpoint}${path}`, {
        ...SAFE_FETCH_INIT,
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
        }),
      });

      if (!res.ok) {
        throw new Error(`Vertex responded ${res.status}: ${await res.text()}`);
      }
      return readGeminiAnswer(await res.json(), 'Vertex');
    },
  };
}

export interface CustomProviderOptions {
  name: string;
  model: string;
  /** Builds the HTTP request from the system and user prompts. */
  request(input: { system: string; user: string }): { url: string; init: RequestInit };
  /** Extracts the text from the already-parsed response body. */
  extract(body: unknown): string;
  fetchImpl?: typeof fetch;
}

/**
 * Escape hatch: if your endpoint speaks none of the formats above, you define
 * how the request is built and how the response is read, and everything else
 * keeps working the same.
 */
export function customProvider(options: CustomProviderOptions): LlmProvider {
  const { name, model, request, extract, fetchImpl = fetch } = options;
  return {
    name,
    model,
    async complete(input) {
      const { url, init } = request(input);
      // The caller built this request themselves, so the URL is theirs to choose
      // — but the redirect default is not something they opted into, and it is
      // the one that turns any endpoint into a hop. Overridable, since a custom
      // provider may genuinely need to follow one.
      const res = await fetchImpl(url, { ...SAFE_FETCH_INIT, ...init });
      if (!res.ok) {
        throw new Error(`Provider "${name}" responded ${res.status}: ${await res.text()}`);
      }
      return extract(await res.json());
    },
  };
}

/**
 * Builds a provider from environment variables.
 *
 *   TRAZUM_LLM_PROVIDER  openai | anthropic   (default: openai)
 *   TRAZUM_LLM_BASE_URL  base URL of the endpoint
 *   TRAZUM_LLM_API_KEY   key, when one is needed
 *   TRAZUM_LLM_MODEL     model identifier
 *
 * Returns `null` when the configuration is incomplete, so the tool keeps
 * working in deterministic mode instead of failing.
 */
export function providerFromEnv(
  env: Record<string, string | undefined> = process.env,
): LlmProvider | null {
  const kind = (env.TRAZUM_LLM_PROVIDER ?? 'openai').toLowerCase();
  const apiKey = env.TRAZUM_LLM_API_KEY;
  const model = env.TRAZUM_LLM_MODEL;
  const baseUrl = env.TRAZUM_LLM_BASE_URL;

  // Trusted because it came from the environment: the operator configuring
  // their own machine, not a stranger naming a host for this server to fetch.
  // `http://localhost:11434` for Ollama is the normal case here, and the
  // documentation promises it works.
  if (kind === 'anthropic') {
    if (!apiKey) return null;
    return anthropicProvider({
      apiKey,
      allowInsecure: true,
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  if (kind === 'gemini' || kind === 'google') {
    // Same shape as the Anthropic branch: a key is enough, because the endpoint
    // has a working default and the model does too.
    if (!apiKey) return null;
    return geminiProvider({
      apiKey,
      allowInsecure: true,
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  if (!baseUrl || !model) return null;
  return openAiCompatible({
    baseUrl,
    allowInsecure: true,
    model,
    ...(apiKey ? { apiKey } : {}),
    name: env.TRAZUM_LLM_NAME ?? 'llm',
  });
}

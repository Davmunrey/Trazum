import type { ModelPricing } from './types.js';

/**
 * Where a prompt is actually going.
 *
 * Trazum priced one vendor, so defaulting to Claude cost nothing. Pricing seven
 * made that default a **wrong number**: `trazum check src/prompts.ts` billed a
 * file that calls OpenAI against Claude Opus 5 and said so with a straight face.
 * The fix is not a better default — it is reading what the code already says.
 *
 * Everything here is **evidence-first**. A detection that cannot name what it
 * saw is a guess wearing a result's clothes, and this feeds a command used as a
 * CI gate. Every answer carries the line it came from, so a wrong one is
 * arguable rather than mysterious.
 *
 * **It declines when the file points two ways.** A module importing both
 * `openai` and `@anthropic-ai/sdk` is a module Trazum cannot price without
 * picking a side, and picking silently is how somebody budgets against the wrong
 * provider for a month. The conflict is reported and the caller falls back to
 * whatever they configured.
 *
 * Detection sits **between config and defaults** in the usual layering: a flag
 * beats config, config beats detection, detection beats the built-in default.
 * Reading the code is better than assuming, and worse than being told.
 */

export type EvidenceKind =
  /** `model: 'gpt-5'` — names the model outright, so nothing beats it. */
  | 'model-literal'
  /** `from 'openai'` — names the provider but not which model. */
  | 'sdk-import'
  /** `https://api.deepseek.com` — a base URL pinned in the source. */
  | 'base-url'
  /** `// trazum:prompt name model=gpt-5` — the author said so directly. */
  | 'marker';

export interface Evidence {
  kind: EvidenceKind;
  /** The text that produced it, so the reader can go and look. */
  detail: string;
  /** 1-based line, when it came from a specific place in the file. */
  line?: number;
  provider?: string;
  model?: string;
}

export interface Detection {
  /** The provider, or null when nothing was found or the file disagreed. */
  provider: string | null;
  /** The exact model, when something named one. */
  model: string | null;
  /** What was found, strongest first. Empty when nothing was. */
  evidence: Evidence[];
  /**
   * Evidence pointing somewhere other than the answer.
   *
   * Non-empty means the file names more than one provider, and `provider` is
   * null: two answers is not a weaker version of one answer.
   */
  conflicts: Evidence[];
}

/**
 * How each provider announces itself in source.
 *
 * Data rather than branches, so adding a provider is a row. Matched as plain
 * substrings on a lowercased copy — no regex, because this runs over files a
 * contributor supplies and the pattern-goes-quadratic lesson has been paid for
 * three times this week already.
 *
 * A quoted package name will also match the same string appearing in a prompt's
 * own text. That is accepted rather than fixed: an import is the *weakest* kind
 * of evidence here, so a model literal or a base URL overrides it, and the
 * alternative — enumerating every import spelling in two languages — is how the
 * single-quoted `require` form came to be missing.
 */
const SIGNATURES: Array<{ provider: string; imports: string[]; urls: string[] }> = [
  {
    provider: 'anthropic',
    imports: ['@anthropic-ai/sdk', 'anthropic-sdk', 'from anthropic', 'import anthropic'],
    urls: ['api.anthropic.com'],
  },
  {
    provider: 'openai',
    // The quoted package name covers `from 'openai'`, `require("openai")` and
    // every other JS spelling without enumerating them — which is how the
    // single-quoted `require` form got missed. The bare Python forms need their
    // own entries because Python does not quote its imports.
    imports: ["'openai'", '"openai"', 'from openai', 'import openai'],
    urls: ['api.openai.com'],
  },
  {
    provider: 'google',
    imports: [
      '@google/genai',
      '@google/generative-ai',
      'google.generativeai',
      'from google import genai',
    ],
    urls: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
  },
  {
    provider: 'moonshot',
    imports: ['moonshot'],
    urls: ['api.moonshot.cn', 'api.moonshot.ai'],
  },
  {
    provider: 'deepseek',
    imports: ['deepseek'],
    urls: ['api.deepseek.com'],
  },
  { provider: 'xai', imports: ['@ai-sdk/xai', 'xai-sdk'], urls: ['api.x.ai'] },
  { provider: 'mistral', imports: ['@mistralai/mistralai', 'from mistralai'], urls: ['api.mistral.ai'] },
];

/**
 * 1-based line lookup, built once per file.
 *
 * The obvious version counts newlines from zero on every call, which is
 * quadratic in the number of matches — 36 seconds on a file repeating a model
 * id. That is the third time this week the same shape has appeared, and the
 * second time I have written it after fixing it in `extract.ts`; the difference
 * here is that matches arrive out of order across the signature loop, so a
 * forward-only counter does not work and this is a binary search instead.
 */
function lineIndex(source: string): (offset: number) => number {
  const newlines: number[] = [];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') newlines.push(i);

  return (offset) => {
    let low = 0;
    let high = newlines.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (newlines[mid]! < offset) low = mid + 1;
      else high = mid;
    }
    return low + 1;
  };
}

/**
 * Model names written as string literals next to a `model` key.
 *
 * Bounded deliberately: `model` then up to a few characters of punctuation and
 * whitespace, then a quoted value. A looser search would match the word "model"
 * in a prompt's own text and price the prompt against something it merely
 * mentions.
 */
function modelLiterals(
  source: string,
  known: ModelPricing[],
  lineAt: (offset: number) => number,
): Evidence[] {
  const found: Evidence[] = [];
  const haystack = source.toLowerCase();

  for (const model of known) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(model.id.toLowerCase(), from);
      if (at === -1) break;
      from = at + model.id.length;

      // It has to be a quoted value: a model id in prose is a mention, not a
      // call. Checking the character either side is enough and costs nothing.
      const before = source[at - 1];
      const after = source[at + model.id.length];
      const quoted =
        (before === "'" || before === '"' || before === '`') &&
        (after === "'" || after === '"' || after === '`');
      if (!quoted) continue;

      found.push({
        kind: 'model-literal',
        detail: model.id,
        line: lineAt(at),
        provider: model.provider,
        model: model.id,
      });
    }
  }
  return found;
}

/** `model=gpt-5` on a `trazum:prompt` marker line. */
function markerModels(
  source: string,
  known: ModelPricing[],
  lineAt: (offset: number) => number,
): Evidence[] {
  const found: Evidence[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf('trazum:prompt', from);
    if (at === -1) break;
    from = at + 13;

    const lineEnd = source.indexOf('\n', at);
    const rest = source.slice(from, lineEnd === -1 ? source.length : lineEnd);
    const key = rest.indexOf('model=');
    if (key === -1) continue;

    const value = rest.slice(key + 6).trim().split(/[\s>]/)[0] ?? '';
    const model = known.find((m) => m.id === value);
    if (!model) continue;

    found.push({
      kind: 'marker',
      detail: `model=${value}`,
      line: lineAt(at),
      provider: model.provider,
      model: model.id,
    });
  }
  return found;
}

export interface DetectOptions {
  /** The catalogue to recognise model names from. */
  models?: ModelPricing[];
}

/**
 * Works out which provider a source file talks to, and says why.
 *
 * Returns `provider: null` both when nothing was found and when the file named
 * more than one — the caller cannot act on either, and `conflicts` distinguishes
 * them for the reader.
 */
export function detectFromSource(source: string, options: DetectOptions = {}): Detection {
  const known = options.models ?? [];
  const haystack = source.toLowerCase();
  const lineAt = lineIndex(source);

  const evidence: Evidence[] = [
    // Strongest first: the author naming a model beats the code naming one,
    // which beats the code naming only a provider.
    ...markerModels(source, known, lineAt),
    ...modelLiterals(source, known, lineAt),
  ];

  for (const signature of SIGNATURES) {
    for (const needle of signature.imports) {
      const at = haystack.indexOf(needle.toLowerCase());
      if (at === -1) continue;
      evidence.push({
        kind: 'sdk-import',
        detail: needle,
        line: lineAt(at),
        provider: signature.provider,
      });
      break;
    }
    for (const url of signature.urls) {
      const at = haystack.indexOf(url);
      if (at === -1) continue;
      evidence.push({
        kind: 'base-url',
        detail: url,
        line: lineAt(at),
        provider: signature.provider,
      });
      break;
    }
  }

  if (evidence.length === 0) {
    return { provider: null, model: null, evidence: [], conflicts: [] };
  }

  // A stronger kind overrides a weaker one; only equals can disagree.
  //
  // Getting this wrong the first time broke the most common non-OpenAI setup
  // there is. Moonshot, DeepSeek, xAI, Groq and Together all ship an
  // OpenAI-compatible endpoint, so their documented usage is the OpenAI SDK
  // pointed at a different `base_url`. Treating that as a contradiction —
  // "this file says both openai and deepseek" — would refuse to price a
  // perfectly ordinary DeepSeek client. The base URL is the specific fact and
  // the SDK import is the generic one, so the URL wins rather than ties.
  //
  // Likewise a `model=` on the marker is the author stating the answer, which
  // cannot be contradicted by an import they wrote for another reason.
  const RANK: Record<EvidenceKind, number> = {
    marker: 3,
    'model-literal': 2,
    'base-url': 1,
    'sdk-import': 0,
  };
  const ranked = [...evidence].sort((a, b) => RANK[b.kind] - RANK[a.kind]);
  const best = ranked[0]!;
  const topRank = RANK[best.kind];

  // Only evidence of the same strength can conflict. Anything weaker is
  // context, not contradiction.
  const conflicts = ranked.filter(
    (e) => RANK[e.kind] === topRank && e.provider !== undefined && e.provider !== best.provider,
  );

  if (conflicts.length > 0) {
    return { provider: null, model: null, evidence: ranked, conflicts };
  }

  return {
    provider: best.provider ?? null,
    // A model only comes from something that named one, and only from the
    // winning provider: an import tells us who, never which of their models.
    model: ranked.find((e) => e.model !== undefined && e.provider === best.provider)?.model ?? null,
    evidence: ranked,
    conflicts: [],
  };
}

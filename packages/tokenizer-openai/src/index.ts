import { Tiktoken, getEncodingNameForModel } from 'js-tiktoken/lite';
import type { TiktokenBPE, TiktokenModel } from 'js-tiktoken/lite';

/**
 * OpenAI's own tokenizer, as a counter Trazum can be handed.
 *
 * ## Why this is a separate package
 *
 * `@trazum/core` declares no dependencies and this one unpacks to twenty-two
 * megabytes of byte-pair ranks. The zero-dependency promise is load-bearing for
 * the CI case the whole product is built around -- **a gate that pulls a
 * twenty-megabyte table into every build is a gate teams turn off** -- so the
 * only shape that improves the absolute figures without spending that promise
 * is a package somebody installs on purpose.
 *
 * Nothing in `@trazum/core` imports this. The core keeps working exactly as it
 * does today when this is not installed, and the counter is passed in through
 * the `TokenCounter` seam that has been there since the beginning.
 *
 * ## What it refuses
 *
 * **A model it does not have the encoding for.** Not a nearby encoding, not the
 * newest one, not a default. `gpt-5-codex` and `gpt-5.5` are both refused today
 * because the rank tables in this package's dependency do not name them, and a
 * count produced by guessing which table to use would be the same fault as
 * pricing a model nobody has read a rate for -- with the added harm that the
 * figure would be labelled *exact*.
 *
 * **It does not claim to know whose a model is.** This package holds encodings,
 * not a catalogue. A Claude model refuses here as `unknown-model` rather than
 * as *wrong family*, because deciding which provider owns an id is the pricing
 * catalogue's job and asserting it from a rank table would be a second source
 * of truth about something already held in one place.
 *
 * ## Why `js-tiktoken/lite`, and not the package's main entry
 *
 * The main entry inlines every rank table into one file, which is 5.6 MB with a
 * single line 2.3 million characters long. Socket's scanner reads that as
 * **90% likely obfuscated** and flagged it on the pull request that added this
 * package, which is a fair reading of the shape even though the content is a
 * byte-pair vocabulary rather than hidden code.
 *
 * `lite` separates the two. The executable code it loads is `chunk-*.js`, whose
 * longest line is 160 characters and which reads as ordinary source, and the
 * ranks arrive as data from a separate module chosen by encoding. So the answer
 * to *is this obfuscated* stops being a judgement about a heuristic and becomes
 * a property of the file: `security.test.js` asserts the line length of what is
 * loaded, and the vocabulary is data that no longer sits in the same file as
 * the code.
 *
 * It is also simply less work: one table is parsed instead of six, and only the
 * one the model actually uses.
 *
 * ## What the number is, exactly
 *
 * The token count **of the text**, which is what Trazum measures everywhere
 * else and therefore what makes this comparable with the heuristic it replaces.
 * It is not the token count of a chat request: an API call wraps each message
 * in role markers and primes the reply, and those tokens are the envelope's
 * rather than the prompt's. A reader billing from this should know the envelope
 * is not in it, which is why the sentence is here rather than in a footnote.
 */

/** Why a model cannot be counted here. */
export type CounterRefusal = {
  reason: 'unknown-encoding';
  model: string;
  /**
   * The encodings this package does hold, so a refusal names what is missing
   * rather than only that something is.
   */
  known: readonly string[];
};

export type CounterResult =
  | {
      ok: true;
      /** Tokens in the text, by OpenAI's own byte-pair encoding. */
      count: (text: string) => number;
      /** Which rank table produced the count, as provenance. */
      encoding: string;
      model: string;
    }
  | { ok: false; refusal: CounterRefusal };

/**
 * The rank tables this package can load.
 *
 * Listed rather than derived, because a refusal that cannot say what it does
 * hold sends somebody to read this file to find out.
 */
export const KNOWN_ENCODINGS = Object.freeze([
  'o200k_base',
  'cl100k_base',
  'p50k_base',
  'p50k_edit',
  'r50k_base',
  'gpt2',
] as const);

type KnownEncoding = (typeof KNOWN_ENCODINGS)[number];

const isKnown = (name: string): name is KnownEncoding =>
  (KNOWN_ENCODINGS as readonly string[]).includes(name);

/*
 * One table per encoding, built on first use and kept.
 *
 * Loading `o200k_base` parses a table of two hundred thousand ranks, and a
 * caller counting a directory would otherwise pay that per file. The cache is
 * keyed by encoding rather than by model, because several models share one.
 */
const loaded = new Map<KnownEncoding, Tiktoken>();

/**
 * The rank tables, each behind its own module.
 *
 * Written as a literal map rather than a template string, because a dynamic
 * specifier built at runtime is a specifier no bundler and no reader can
 * follow -- and because it keeps `KNOWN_ENCODINGS` and what can actually be
 * loaded in one place instead of two that agree by convention.
 */
const RANKS: Readonly<Record<KnownEncoding, () => Promise<{ default: TiktokenBPE }>>> =
  Object.freeze({
    o200k_base: () => import('js-tiktoken/ranks/o200k_base'),
    cl100k_base: () => import('js-tiktoken/ranks/cl100k_base'),
    p50k_base: () => import('js-tiktoken/ranks/p50k_base'),
    p50k_edit: () => import('js-tiktoken/ranks/p50k_edit'),
    r50k_base: () => import('js-tiktoken/ranks/r50k_base'),
    gpt2: () => import('js-tiktoken/ranks/gpt2'),
  });

/*
 * The dependency types this argument as a union of the model ids it knows,
 * which is narrower than what it does at runtime: it throws on anything else,
 * and throwing is exactly the behaviour this package is built on. A caller here
 * is passing a model id read out of somebody's usage log, so the cast is the
 * honest shape -- the alternative is a type that says unknown models cannot
 * reach a function whose entire purpose is refusing them.
 */
const nameFor = (model: string): string => getEncodingNameForModel(model as TiktokenModel);

async function encodingFor(name: KnownEncoding): Promise<Tiktoken> {
  const held = loaded.get(name);
  if (held !== undefined) return held;
  const built = new Tiktoken((await RANKS[name]()).default);
  loaded.set(name, built);
  return built;
}

/**
 * A counter for one model, or a refusal naming what is missing.
 *
 * Per model rather than one counter for everything, because the encoding is a
 * property of the model and a counter that took the model per call would let a
 * caller mix two families' counts into one total without noticing.
 *
 * Asynchronous because the rank table is loaded on demand: only the one the
 * model actually uses is ever parsed, rather than six at import time. The
 * counter it hands back is synchronous, which is what a caller counting a
 * directory needs -- the cost is paid once, when the encoding is chosen.
 *
 * `canCount` stays synchronous for the same reason: answering *could this be
 * counted* needs the name mapping and not the table.
 */
export async function openaiCounter(model: string): Promise<CounterResult> {
  let name: string;
  try {
    name = nameFor(model);
  } catch {
    /*
     * The dependency refuses a model it has no rule for, including models
     * OpenAI has shipped since its rank tables were written. That refusal is
     * kept rather than papered over with a default: the newest encoding is a
     * reasonable guess and a guess is exactly what the word `exact` must never
     * cover.
     */
    return { ok: false, refusal: { reason: 'unknown-encoding', model, known: KNOWN_ENCODINGS } };
  }

  if (!isKnown(name)) {
    // A rule pointing at a table this package does not list. Refused for the
    // same reason, rather than attempted and thrown from inside `count`.
    return { ok: false, refusal: { reason: 'unknown-encoding', model, known: KNOWN_ENCODINGS } };
  }

  const encoding = await encodingFor(name);
  return {
    ok: true,
    count: (text: string) => encoding.encode(text).length,
    encoding: name,
    model,
  };
}

/**
 * Whether this package can count a model, without building the table.
 *
 * For a caller deciding what to say before it decides what to do -- a report
 * naming which models it counted exactly, say -- so asking does not cost the
 * parse of a two-hundred-thousand-rank table.
 */
export function canCount(model: string): boolean {
  try {
    return isKnown(nameFor(model));
  } catch {
    return false;
  }
}

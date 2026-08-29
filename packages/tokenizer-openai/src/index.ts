import { getEncoding, getEncodingNameForModel } from 'js-tiktoken';
import type { Tiktoken, TiktokenModel } from 'js-tiktoken';

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

/*
 * The dependency types this argument as a union of the model ids it knows,
 * which is narrower than what it does at runtime: it throws on anything else,
 * and throwing is exactly the behaviour this package is built on. A caller here
 * is passing a model id read out of somebody's usage log, so the cast is the
 * honest shape -- the alternative is a type that says unknown models cannot
 * reach a function whose entire purpose is refusing them.
 */
const nameFor = (model: string): string => getEncodingNameForModel(model as TiktokenModel);

function encodingFor(name: KnownEncoding): Tiktoken {
  const held = loaded.get(name);
  if (held !== undefined) return held;
  const built = getEncoding(name);
  loaded.set(name, built);
  return built;
}

/**
 * A counter for one model, or a refusal naming what is missing.
 *
 * Per model rather than one counter for everything, because the encoding is a
 * property of the model and a counter that took the model per call would let a
 * caller mix two families' counts into one total without noticing.
 */
export function openaiCounter(model: string): CounterResult {
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

  const encoding = encodingFor(name);
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

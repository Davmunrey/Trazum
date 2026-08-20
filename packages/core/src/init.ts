/**
 * The first five minutes, decided without touching a disk.
 *
 * Everything since 1.41 raised the ceiling. This lowers the floor: from
 * `npx @trazum/cli` to a finding worth money, without reading a page of
 * documentation. Twenty-one commands is a wall to somebody who has none of
 * them yet, and that wall is why a good tool gets closed inside a minute.
 *
 * **The proposal is a document, not a side effect.** What `init` would write
 * is decided here, from observations the CLI collected, and returned as a
 * value. So every rule below is testable without a filesystem, and `--dry-run`
 * is the same code path minus the write rather than a second implementation
 * that drifts from the first.
 *
 * **A key with no evidence is not written.** A generated config full of
 * guessed thresholds is a config nobody trusts and everybody deletes — and it
 * is worse than an empty one, because it looks like a decision somebody made.
 * Every key that lands carries the observation that justified it; every key
 * that does not carries what would settle it. Both are typed values, because a
 * first run that explains itself only in prose cannot be checked by a test.
 *
 * **Measurement is not policy.** A log says what your traffic *was* — how many
 * calls, which model, how long the outputs ran. Those are measurements and
 * this file writes them. A budget says what your traffic *may cost*, which no
 * log can answer: picking "the measured month plus twenty per cent" would be
 * this tool inventing a threshold and then grading somebody against it. So
 * `spend` is always declined, and the measured figure is handed over so the
 * person who *can* set a budget has the number in front of them.
 */

import { DEFAULT_EXTENSIONS } from './config-schema.js';
import type { TrazumConfig } from './config-schema.js';
import type { Detection, EvidenceKind } from './detect.js';
import type { HostEnvironment } from './host.js';
import { billLevers } from './levers.js';
import type { SliceLevers } from './levers.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageProfileReport } from './usage.js';
import type { Locale } from './i18n/index.js';

/** A source file that was read, and what `detectFromSource` made of it. */
export interface ProviderSighting {
  file: string;
  detection: Detection;
}

/**
 * Something that might hold usage, found lying around.
 *
 * `where` is a path for the file kinds and the **name** of an environment
 * variable for a credential — never its value. That rule has held since the
 * connector shipped in 1.41 and it holds here: a first-run summary is the
 * single most likely thing somebody pastes into a chat window.
 */
export interface UsageSighting {
  kind: 'log-file' | 'log-directory' | 'store' | 'connector-credential';
  where: string;
  /** The provider this source belongs to, when the sighting names one. */
  provider: string | null;
}

/** Everything the CLI saw, handed over as data. */
export interface InitObservations {
  host: HostEnvironment;
  /** Every source file read, strongest evidence first within each file. */
  sightings: ProviderSighting[];
  /** Prompt files the walk found. */
  promptFiles: string[];
  /** Usage sources found. Empty is a real answer and is reported as one. */
  usage: UsageSighting[];
  /**
   * The profile of a usage source that was found **and** parsed.
   *
   * Null covers two different situations and the proposal keeps them apart:
   * nothing was found, or something was found and could not be read. The
   * caller says which by what it puts in `usage`.
   */
  measured: UsageProfileReport | null;
  /** The locale the environment asked for, when it asked for one. */
  locale: Locale | null;
  /** A config already sitting in the working directory. */
  existing: { path: string; config: TrazumConfig } | null;
}

/** Every config key `init` is allowed to have an opinion about. */
export type InitKey =
  | 'locale'
  | 'extensions'
  | 'usage.model'
  | 'usage.callsPerMonth'
  | 'usage.avgOutputTokens'
  | 'usage.cacheHitRate'
  | 'usage.batchEligible'
  | 'labels'
  | 'spend.maxUsd';

/** Why a key was written, in a shape a test can assert on. */
export type InitJustification =
  | { key: 'locale'; value: Locale; from: 'environment' }
  | { key: 'extensions'; value: string[]; from: 'walk'; files: number }
  | {
      key: 'usage.model';
      value: string;
      from: 'measured';
      /** Share of the measured bill this model carries, 0-1. */
      share: number;
    }
  | {
      key: 'usage.model';
      value: string;
      from: 'source';
      file: string;
      line: number;
      evidence: EvidenceKind;
    }
  | { key: 'usage.callsPerMonth'; value: number; from: 'measured'; calls: number; days: number }
  | {
      key: 'usage.avgOutputTokens';
      value: number;
      from: 'measured';
      outputTokens: number;
      calls: number;
    }
  | {
      key: 'usage.cacheHitRate';
      value: number;
      from: 'measured';
      cacheReadTokens: number;
      inputTokens: number;
    };

/**
 * Why a key was left out, and what would settle it.
 *
 * A refusal never arrives bare — the rule the guard established in 1.45, here
 * applied to a file rather than to a call. "No provider written" with nothing
 * after it is indistinguishable from a bug.
 */
export type InitDecline =
  | { key: 'usage.model'; why: 'no-evidence' }
  | { key: 'usage.model'; why: 'conflicting-evidence'; files: string[] }
  | { key: 'usage.model'; why: 'provider-only'; provider: string; file: string }
  | { key: 'usage.callsPerMonth'; why: 'nothing-measured' }
  | { key: 'usage.callsPerMonth'; why: 'window-too-short'; days: number; calls: number }
  | { key: 'usage.callsPerMonth'; why: 'undated-calls'; undated: number; calls: number }
  | { key: 'usage.avgOutputTokens'; why: 'nothing-measured' }
  | { key: 'usage.cacheHitRate'; why: 'nothing-measured' }
  | { key: 'usage.cacheHitRate'; why: 'not-recorded' }
  | { key: 'usage.batchEligible'; why: 'only-you-know' }
  | { key: 'labels'; why: 'unprovable'; labels: number }
  | { key: 'spend.maxUsd'; why: 'a-budget-is-a-policy'; measuredUsd: number | null; days: number | null };

/**
 * The single most valuable thing the first run found, with its arithmetic.
 *
 * One finding, not a ranked table. `doctor` and `plan` exist for the table,
 * and a first run that opens with fourteen rows has told somebody nothing —
 * they came to find out whether this is worth an afternoon.
 */
export interface InitHeadline {
  slice: SliceLevers;
  /** Which lever the figure is. `route+batch` is computed, never summed. */
  lever: 'route' | 'batch' | 'route+batch';
  savingUsd: number;
  /** Always measured. Nothing in a headline rests on a call that never happened. */
  provenance: 'measured';
  /** Days of measurement behind it, so the figure has a unit a reader can check. */
  days: number;
}

export type NoHeadline =
  | 'nothing-measured'
  | 'nothing-could-be-priced'
  | 'no-lever-clears-the-floor';

export interface InitProposal {
  schemaVersion: 1;
  /** Exactly the keys that were justified, and nothing else. */
  config: TrazumConfig;
  justified: InitJustification[];
  declined: InitDecline[];
  headline: InitHeadline | null;
  /** Set when `headline` is null, so "nothing found" is never bare. */
  noHeadline: NoHeadline | null;
  /**
   * The config already there, and which of its keys this proposal would
   * change. Named before anything is written: an `init` that silently replaces
   * a config somebody tuned is the worst possible first impression.
   */
  overwrites: { path: string; keys: InitKey[] } | null;
}

/** A month, for turning a measured span into a rate. */
const DAYS_PER_MONTH = 30;

/**
 * The shortest measured span that may be stated as a monthly rate.
 *
 * Four weeks, so every weekday appears the same number of times. Three days of
 * traffic multiplied by ten is a forecast wearing a measurement's clothes, and
 * this repository has refused that since the series shipped in 1.40.
 */
export const MIN_RATE_DAYS = 28;

/** The share of the bill a headline must clear to be worth being the headline. */
export const HEADLINE_FLOOR_SHARE = 0.01;

/** Days between two `YYYY-MM-DD` days, inclusive of both. */
function spanDays(first: string, last: string): number {
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The extensions actually present among the prompt files found. */
function extensionsOf(files: string[]): string[] {
  const seen = new Set<string>();
  for (const file of files) {
    const dot = file.lastIndexOf('.');
    const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    if (dot > slash + 1) seen.add(file.slice(dot).toLowerCase());
  }
  return [...seen].sort();
}

/**
 * The one model a config may name, from what was measured.
 *
 * A log spread across four models has no single answer, and writing the
 * largest of the four would silently price every prompt in the repository
 * against a model most of them never touch. The threshold is a majority: past
 * half the bill, "this is what you use" is a fair sentence.
 */
function dominantModel(report: UsageProfileReport): { model: string; share: number } | null {
  if (report.total.totalUsd <= 0 || report.byModel.length === 0) return null;
  const top = report.byModel[0];
  if (top === undefined) return null;
  const share = top.breakdown.totalUsd / report.total.totalUsd;
  return share > 0.5 ? { model: top.model, share } : null;
}

export interface InitOptions {
  catalogue: PricingCatalogue;
  on?: Date;
}

export function proposeInit(
  observations: InitObservations,
  options: InitOptions,
): InitProposal {
  const { catalogue, on = new Date() } = options;
  const { measured } = observations;
  const justified: InitJustification[] = [];
  const declined: InitDecline[] = [];
  const config: TrazumConfig = {};

  // --- locale -------------------------------------------------------------
  if (observations.locale !== null) {
    config.locale = observations.locale;
    justified.push({ key: 'locale', value: observations.locale, from: 'environment' });
  }

  // --- extensions ---------------------------------------------------------
  //
  // Only when the walk found something the defaults do not already cover.
  // Writing `[".txt", ".md", ".prompt", ".tmpl"]` back into a config is a key
  // that changes nothing and has to be maintained forever.
  const extensions = extensionsOf(observations.promptFiles);
  if (extensions.length > 0 && extensions.some((e) => !DEFAULT_EXTENSIONS.includes(e))) {
    config.extensions = extensions;
    justified.push({
      key: 'extensions',
      value: extensions,
      from: 'walk',
      files: observations.promptFiles.length,
    });
  }

  // --- usage.model --------------------------------------------------------
  //
  // Measured beats detected, and it is not close. An import says which SDK
  // somebody installed; a log says which model was billed. When there is no
  // log, a literal in the source will do — but a *provider* with no model is
  // declined rather than filled in from that provider's default. `where` may
  // print a provider default because a reader can see it is a guess; a config
  // file cannot, because six weeks later it reads as a decision.
  const dominant = measured === null ? null : dominantModel(measured);
  const modelSighting = observations.sightings.find(
    (s) => s.detection.model !== null && s.detection.conflicts.length === 0,
  );
  const conflicting = observations.sightings.filter((s) => s.detection.conflicts.length > 0);
  const providerOnly = observations.sightings.find(
    (s) => s.detection.provider !== null && s.detection.model === null && s.detection.conflicts.length === 0,
  );

  if (dominant !== null) {
    config.usage = { ...config.usage, model: dominant.model };
    justified.push({
      key: 'usage.model',
      value: dominant.model,
      from: 'measured',
      share: dominant.share,
    });
  } else if (modelSighting !== undefined) {
    const evidence =
      modelSighting.detection.evidence.find((e) => e.model !== undefined) ??
      modelSighting.detection.evidence[0];
    config.usage = { ...config.usage, model: modelSighting.detection.model as string };
    justified.push({
      key: 'usage.model',
      value: modelSighting.detection.model as string,
      from: 'source',
      file: modelSighting.file,
      line: evidence?.line ?? 0,
      evidence: evidence?.kind ?? 'model-literal',
    });
  } else if (conflicting.length > 0) {
    declined.push({
      key: 'usage.model',
      why: 'conflicting-evidence',
      files: conflicting.map((s) => s.file),
    });
  } else if (providerOnly !== undefined) {
    declined.push({
      key: 'usage.model',
      why: 'provider-only',
      provider: providerOnly.detection.provider as string,
      file: providerOnly.file,
    });
  } else {
    declined.push({ key: 'usage.model', why: 'no-evidence' });
  }

  // --- the measured span, which three keys below depend on ----------------
  const dated = measured?.spendByDay ?? [];
  const first = dated[0];
  const last = dated[dated.length - 1];
  const days = first === undefined || last === undefined ? 0 : spanDays(first.day, last.day);
  const datedCalls = dated.reduce((sum, d) => sum + d.calls, 0);
  const undated = measured === null ? 0 : Math.max(0, measured.total.calls - datedCalls);

  // --- usage.callsPerMonth ------------------------------------------------
  //
  // Three separate refusals, and they are not the same refusal. No log is one
  // situation; a log covering four days is another; a log whose records carry
  // no clock is a third — and that last one is the one that would go wrong
  // quietly, because the calls are all *there*, they simply cannot be placed
  // in time. Dividing them by a span they were never proven to fall inside is
  // how a rate comes out too high and nobody can see why.
  if (measured === null) {
    declined.push({ key: 'usage.callsPerMonth', why: 'nothing-measured' });
  } else if (undated > 0) {
    declined.push({
      key: 'usage.callsPerMonth',
      why: 'undated-calls',
      undated,
      calls: measured.total.calls,
    });
  } else if (days < MIN_RATE_DAYS) {
    declined.push({
      key: 'usage.callsPerMonth',
      why: 'window-too-short',
      days,
      calls: measured.total.calls,
    });
  } else {
    const perMonth = Math.round((measured.total.calls / days) * DAYS_PER_MONTH);
    config.usage = { ...config.usage, callsPerMonth: perMonth };
    justified.push({
      key: 'usage.callsPerMonth',
      value: perMonth,
      from: 'measured',
      calls: measured.total.calls,
      days,
    });
  }

  // --- usage.avgOutputTokens ----------------------------------------------
  //
  // An average of what happened, not a forecast of what will — so unlike the
  // rate above it needs no minimum span. One day of real calls gives a real
  // average of those calls.
  if (measured === null || measured.total.calls === 0) {
    declined.push({ key: 'usage.avgOutputTokens', why: 'nothing-measured' });
  } else {
    const avg = Math.round(measured.total.outputTokens / measured.total.calls);
    config.usage = { ...config.usage, avgOutputTokens: avg };
    justified.push({
      key: 'usage.avgOutputTokens',
      value: avg,
      from: 'measured',
      outputTokens: measured.total.outputTokens,
      calls: measured.total.calls,
    });
  }

  // --- usage.cacheHitRate -------------------------------------------------
  //
  // **Not recorded is not not-happened.** A log with no cache fields at all
  // does not prove a hit rate of zero — it proves the exporter did not write
  // the column. Writing 0 there would tell every later caching advisory that
  // caching is doing nothing, which is a finding invented out of a missing
  // field.
  if (measured === null) {
    declined.push({ key: 'usage.cacheHitRate', why: 'nothing-measured' });
  } else {
    const read = measured.total.cacheReadTokens;
    const written = measured.total.cacheWriteTokens;
    const input = measured.total.inputTokens;
    if (read === 0 && written === 0) {
      declined.push({ key: 'usage.cacheHitRate', why: 'not-recorded' });
    } else {
      const denominator = read + input;
      const rate = denominator === 0 ? 0 : Math.round((read / denominator) * 100) / 100;
      config.usage = { ...config.usage, cacheHitRate: rate };
      justified.push({
        key: 'usage.cacheHitRate',
        value: rate,
        from: 'measured',
        cacheReadTokens: read,
        inputTokens: input,
      });
    }
  }

  // --- usage.batchEligible ------------------------------------------------
  //
  // Never written, in either direction. Whether the work tolerates a batch
  // window is a fact about a product decision, and no log records it. A
  // default of `false` would quietly delete the batch lever from every report
  // this config touches; `true` would offer a saving on latency somebody never
  // agreed to give up.
  declined.push({ key: 'usage.batchEligible', why: 'only-you-know' });

  // --- labels -------------------------------------------------------------
  //
  // Mapping a log label to a prompt file is a claim about which file produced
  // which calls, and a directory walk cannot prove one. A wrong entry here is
  // worse than a missing one: `profile` would go and read the wrong file and
  // explain a cache verdict with the wrong prompt's structure, confidently.
  const labels = measured?.byLabel.length ?? 0;
  if (labels > 0) declined.push({ key: 'labels', why: 'unprovable', labels });

  // --- spend --------------------------------------------------------------
  //
  // The measured figure is handed over, and the threshold is not invented.
  declined.push({
    key: 'spend.maxUsd',
    why: 'a-budget-is-a-policy',
    measuredUsd: measured === null ? null : measured.total.totalUsd,
    days: measured === null ? null : days,
  });

  // --- the headline -------------------------------------------------------
  let headline: InitHeadline | null = null;
  let noHeadline: NoHeadline | null = null;

  if (measured === null) {
    noHeadline = 'nothing-measured';
  } else if (measured.total.totalUsd <= 0) {
    noHeadline = 'nothing-could-be-priced';
  } else {
    const levers = billLevers(measured, { catalogue, on, minShare: HEADLINE_FLOOR_SHARE });
    const top = levers.slices[0];
    if (top === undefined || top.combinedUsd <= 0) {
      noHeadline = 'no-lever-clears-the-floor';
    } else {
      headline = {
        slice: top,
        lever:
          top.route !== null && top.batch !== null
            ? 'route+batch'
            : top.route !== null
              ? 'route'
              : 'batch',
        savingUsd: top.combinedUsd,
        provenance: 'measured',
        days,
      };
    }
  }

  // --- what this would overwrite ------------------------------------------
  let overwrites: InitProposal['overwrites'] = null;
  if (observations.existing !== null) {
    const already = observations.existing.config;
    const keys: InitKey[] = [];
    if (config.locale !== undefined && already.locale !== undefined) keys.push('locale');
    if (config.extensions !== undefined && already.extensions !== undefined) keys.push('extensions');
    for (const k of ['model', 'callsPerMonth', 'avgOutputTokens', 'cacheHitRate'] as const) {
      if (config.usage?.[k] !== undefined && already.usage?.[k] !== undefined) {
        keys.push(`usage.${k}` as InitKey);
      }
    }
    overwrites = { path: observations.existing.path, keys };
  }

  return { schemaVersion: 1, config, justified, declined, headline, noHeadline, overwrites };
}

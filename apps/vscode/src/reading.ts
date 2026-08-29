/**
 * What the editor shows, computed with no editor in sight.
 *
 * Every figure the extension puts on screen is produced here, from text and a
 * config and nothing else — no `vscode` import, no filesystem, no clock, no
 * network. `extension.ts` is a wire: it hands this function a string and a
 * config, and renders what comes back.
 *
 * **That split is the whole design, and it is not a style preference.** A VS
 * Code extension is normally tested by downloading a copy of VS Code and
 * driving it, which is a network dependency, a version to keep up with, and a
 * test suite that cannot run on a machine with no display. Every judgement
 * worth checking lives in this file instead, and `reading.test.js` checks it
 * with `node --test` and nothing else. The shim is held to having no judgement
 * in it by a guard rather than by good intentions.
 *
 * **What this refuses to do**, from the arc that scheduled it: send the buffer
 * anywhere, in any form, ever. An extension that uploaded a prompt to price it
 * would be the exact inversion of this product, so the refusal is a test
 * (`refusals.test.js`) and not a paragraph.
 */

import {
  MAX_INPUT_CHARS,
  bandFor,
  budgetFor,
  estimateTokens,
  formatUsd,
  optimize,
} from '@trazum/core';
import type { ResolvedBudget, TrazumConfig } from '@trazum/core';

/** Why there is no reading, when there is none. */
export type NoReading =
  /** The document is empty: zero tokens is a fact, not a finding. */
  | 'empty'
  /** Past the prompt ceiling the rest of the product refuses at. */
  | 'too-large'
  /** The file is not one the config scopes, so nothing here is about it. */
  | 'not-a-prompt';

/** Where a prompt sits against the budget that covers it. */
export interface BudgetPosition {
  /** The glob that matched, so the number is arguable rather than mysterious. */
  readonly pattern: string;
  readonly maxTokens: number;
  /** Share of the budget used, clamped at nothing: 1 is exactly at the limit. */
  readonly share: number;
  readonly over: boolean;
}

/** Everything the editor is allowed to display, and nothing it is not. */
export interface Reading {
  readonly tokens: number;
  /**
   * The published error band for this text, as a percentage.
   *
   * Carried on every reading because the number above is an estimate, and a
   * token count shown without one reads as exact. The status bar states it.
   */
  readonly bandPct: number;
  readonly budget: BudgetPosition | null;
  /**
   * Tokens the deterministic rules would recover, measured by running them.
   *
   * **`null` is not zero, and here the difference is the whole point.** Zero
   * means the rules ran and found nothing, which is the common case on prose
   * somebody already wrote well. `null` means they have not run yet: `read` is
   * called on every keystroke and `optimize` walks every rule over the whole
   * document, so the expensive half waits for the typing to stop. A status bar
   * that showed "0 recoverable" while the measurement was still pending would
   * be telling the reader the prompt is already tight, which nobody has
   * checked.
   */
  readonly recoverable: number | null;
}

/** A reading, or the reason there is not one. */
export type Result = { readonly kind: 'reading'; readonly reading: Reading } | {
  readonly kind: 'none';
  readonly reason: NoReading;
};

export interface ReadOptions {
  /** The document's path relative to the project root, for budget matching. */
  readonly path: string;
  /** The project config, or an empty object when none was found. */
  readonly config: TrazumConfig;
}

/**
 * Whether this file is one the project treats as a prompt.
 *
 * Exported because the shim needs the same answer to decide whether to show
 * anything at all, and two copies of an extension list is how the CLI's own
 * walk went wrong once already.
 */
export function isPrompt(path: string, config: TrazumConfig): boolean {
  const extensions = config.extensions ?? ['.txt', '.md'];
  return extensions.some((extension) => path.endsWith(extension));
}

/**
 * The reading for one document.
 *
 * Pure: the same text and config give the same answer, on any machine, with
 * the network unplugged.
 */
export function read(text: string, options: ReadOptions): Result {
  if (!isPrompt(options.path, options.config)) return { kind: 'none', reason: 'not-a-prompt' };
  if (text.trim() === '') return { kind: 'none', reason: 'empty' };

  /*
    The same ceiling the CLI refuses at, imported rather than repeated. An
    editor calls this on every keystroke, so a prompt past the ceiling has to
    refuse quickly rather than run the rules over a megabyte of text each time
    somebody types a character.
  */
  if (text.length > MAX_INPUT_CHARS) return { kind: 'none', reason: 'too-large' };

  const tokens = estimateTokens(text);
  const resolved: ResolvedBudget | null = budgetFor(options.path, options.config.budgets);

  return {
    kind: 'reading',
    reading: {
      tokens,
      bandPct: bandFor(text),
      recoverable: null,
      budget:
        resolved === null
          ? null
          : {
              pattern: resolved.pattern,
              maxTokens: resolved.maxTokens,
              /*
                Division by a budget of zero would be Infinity, and a status bar
                reading "Infinity%" is worse than one reading nothing. The
                config parser already refuses a budget that is not positive, so
                this is the belt to that brace rather than a second opinion.
              */
              share: resolved.maxTokens > 0 ? tokens / resolved.maxTokens : 0,
              over: tokens > resolved.maxTokens,
            },
    },
  };
}

/**
 * The status bar line.
 *
 * Separate from `read` so the numbers can be checked without the wording, and
 * the wording without recomputing the numbers. Nothing here computes anything:
 * every value comes off the reading it was handed.
 */
export function statusText(reading: Reading): string {
  const count = `${reading.tokens.toLocaleString('en-US')} tokens`;
  if (reading.budget === null) return count;
  return `${count} / ${reading.budget.maxTokens.toLocaleString('en-US')}`;
}

/**
 * The hover, which is where the qualifications go.
 *
 * The status bar has room for a number and the tooltip has room for what the
 * number means, so the band, the pattern the budget came from and what the
 * rules would recover live here rather than being dropped.
 */
export function detailText(reading: Reading): string {
  const lines = [`Estimated ${reading.tokens.toLocaleString('en-US')} tokens, ±${reading.bandPct}%.`];

  if (reading.budget !== null) {
    const share = Math.round(reading.budget.share * 100);
    lines.push(
      reading.budget.over
        ? `Over the ${reading.budget.maxTokens.toLocaleString('en-US')}-token budget from "${reading.budget.pattern}".`
        : `${share}% of the ${reading.budget.maxTokens.toLocaleString('en-US')}-token budget from "${reading.budget.pattern}".`,
    );
  }

  if (reading.recoverable === null) {
    lines.push('The rules have not been run on this text yet.');
  } else if (reading.recoverable > 0) {
    lines.push(`The rules would recover about ${reading.recoverable.toLocaleString('en-US')} tokens.`);
  } else {
    lines.push('The rules found nothing to trim.');
  }

  return lines.join('\n');
}

/**
 * What the rules actually recover, measured by running them.
 *
 * Split out from `read` because it is the expensive half: `optimize` walks
 * every rule over the text, and an editor calling that on every keystroke is
 * an editor that stutters. The shim runs this on a pause, not on a change,
 * and `read` stays cheap enough to run on both.
 */
export function measureRecoverable(text: string): number {
  if (text.trim() === '' || text.length > MAX_INPUT_CHARS) return 0;
  return optimize(text).tokensSaved;
}

/**
 * A monthly figure, only where the config actually declares a workload.
 *
 * Returns null rather than a number whenever the config has not said what this
 * prompt costs to run — no default call volume, no assumed model. A monthly
 * saving invented from defaults is a number nobody can justify, and this
 * product's one unforgivable sin is inventing one.
 */
export function monthlyUsd(text: string, config: TrazumConfig): string | null {
  const usage = config.usage;
  if (usage?.model === undefined || usage.callsPerMonth === undefined) return null;

  const { savings } = optimize(text, { usage: { ...usage, model: usage.model } });
  return formatUsd(savings.perMonth.before.totalUsd);
}

import { getModel } from './pricing.js';
import { segment } from './segment.js';

/**
 * Exports a before/after pair as a suite somebody else's harness can run.
 *
 * `trazum eval` answers "does the model still say the same thing?" — semantic
 * agreement, measured against the model's own variance. That is the question
 * Trazum is qualified to ask, and it is not the question a team actually needs
 * answered before shipping. *Their* question is whether the classifier still
 * hits 94%, whether the JSON still parses, whether the refusal rate moved. Those
 * are assertions about their task, and Trazum has no business inventing them.
 *
 * So this hands over the part it *can* build correctly — a suite in which the
 * only variable is the prompt, with both versions and every case already wired
 * — and leaves the assertions where they belong.
 *
 * ## Why JSON rather than YAML
 *
 * promptfoo reads `promptfooconfig.json` as readily as the YAML. This package
 * has no dependencies and is not going to acquire a YAML emitter, and a
 * hand-rolled one would be a quoting bug waiting for the first prompt
 * containing a colon, a tab, or a line ending in a space. `JSON.stringify`
 * escapes everything correctly, and JSON is a subset of YAML, so the file can
 * be renamed if somebody prefers.
 */

export interface PromptfooExport {
  /** The config, ready for `JSON.stringify`. */
  config: Record<string, unknown>;
  /** Things the reader has to know before trusting the run. */
  warnings: PromptfooWarning[];
}

export type PromptfooWarning =
  /** `${x}` or `{x}`: promptfoo substitutes `{{x}}` and will leave these alone. */
  | { kind: 'unsupported-placeholder'; detail: string }
  /** More than one distinct placeholder, and one value per case to fill them. */
  | { kind: 'multiple-placeholders'; detail: string }
  /** The provider has no promptfoo id here, so the model string is a guess. */
  | { kind: 'unmapped-provider'; detail: string }
  /** No placeholder at all: the case is appended, as `trazum eval` does. */
  | { kind: 'appended-input'; detail: string };

export interface PromptfooOptions {
  /** Model id from Trazum's catalogue, mapped to a promptfoo provider. */
  model?: string;
  /** Rule level used to produce the optimised prompt, for the label. */
  level?: string;
}

/** The variable a prompt with no `{{placeholder}}` gets. */
const APPENDED_VAR = 'input';

/**
 * promptfoo names providers `<vendor>:<model>`. Only the two vendors whose
 * shape is certain are mapped; anything else is emitted as-is with a warning,
 * because a wrong provider id fails at run time with a message about the
 * harness rather than about this file.
 */
function providerId(modelId: string | undefined): { id: string; warning: string | null } {
  if (modelId === undefined) return { id: 'openai:gpt-4o-mini', warning: null };
  const model = getModel(modelId);
  switch (model.provider) {
    case 'anthropic':
      return { id: `anthropic:messages:${model.id}`, warning: null };
    case 'openai':
      return { id: `openai:${model.id}`, warning: null };
    default:
      return {
        id: model.id,
        warning: `${model.provider ?? 'this provider'} has no known promptfoo id; "${model.id}" is a guess`,
      };
  }
}

/** Placeholders in the prompt, in order of appearance, deduplicated. */
function placeholdersIn(prompt: string): string[] {
  const found = segment(prompt)
    .filter((piece) => piece.kind === 'protected' && piece.protection === 'placeholder')
    .map((piece) => piece.text);
  return [...new Set(found)];
}

/** `{{query}}` → `query`, or null when promptfoo would not substitute it. */
function varNameOf(placeholder: string): string | null {
  const match = /^\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}$/.exec(placeholder);
  return match?.[1] ?? null;
}


/**
 * Whether the prompt demands JSON output.
 *
 * Defined narrowly and checkably: a fenced block tagged `json`, or an untagged
 * fenced block whose body parses as JSON. Nothing about the surrounding prose,
 * because "return JSON" in a sentence is a phrase, and a phrase is where
 * guessing starts.
 *
 * The first version of this asked `findRestatedFormat`, which was the wrong
 * question wearing a convenient shape. That function answers "is this prompt
 * wasting tokens restating its own schema?" — so a prompt demanding JSON
 * *cleanly* got no assertion while a wasteful one did, which is exactly
 * backwards.
 */
function asksForJson(prompt: string): boolean {
  const fenced = /^[ \t]*(?:```|~~~)([A-Za-z0-9]*)[ \t]*\n([\s\S]*?)^[ \t]*(?:```|~~~)/gm;

  let match: RegExpExecArray | null;
  while ((match = fenced.exec(prompt)) !== null) {
    const lang = (match[1] ?? '').toLowerCase();
    const body = (match[2] ?? '').trim();
    if (/^jsonc?5?$/.test(lang)) return true;
    if (lang !== '' ) continue;
    if (!body.startsWith('{') && !body.startsWith('[')) continue;
    try {
      JSON.parse(body);
      return true;
    } catch {
      // An untagged block of something else. Not our business.
    }
  }
  return false;
}

export function toPromptfoo(
  original: string,
  optimized: string,
  cases: readonly string[],
  options: PromptfooOptions = {},
): PromptfooExport {
  const warnings: PromptfooWarning[] = [];

  const placeholders = placeholdersIn(original);
  const supported = placeholders.map(varNameOf);

  // The variable the cases fill. `trazum eval` substitutes the *first*
  // placeholder and appends when there is none; promptfoo is driven the same
  // way so the two commands are testing the same prompt.
  let variable = APPENDED_VAR;
  let originalTemplate = original;
  let optimizedTemplate = optimized;

  if (placeholders.length === 0) {
    variable = APPENDED_VAR;
    originalTemplate = `${original.trimEnd()}\n\n{{${APPENDED_VAR}}}`;
    optimizedTemplate = `${optimized.trimEnd()}\n\n{{${APPENDED_VAR}}}`;
    warnings.push({
      kind: 'appended-input',
      detail:
        'This prompt has no placeholder, so each case is appended at the end — the same ' +
        'thing `trazum eval` does. If the prompt is meant to be a template, add ' +
        '{{a_variable}} and export again.',
    });
  } else {
    const first = supported[0] ?? null;
    if (first === null) {
      warnings.push({
        kind: 'unsupported-placeholder',
        detail:
          `promptfoo substitutes {{name}}; this prompt uses ${placeholders[0]}, which it will ` +
          'leave untouched. Every case would run against the literal template.',
      });
      variable = APPENDED_VAR;
    } else {
      variable = first;
    }

    const distinct = placeholders.length;
    if (distinct > 1) {
      warnings.push({
        kind: 'multiple-placeholders',
        detail:
          `The prompt has ${distinct} placeholders (${placeholders.join(', ')}) and the case ` +
          `file supplies one value each, which fills ${placeholders[0]} only. Give the others ` +
          'defaults in `defaultTest.vars`, or the run tests a prompt nobody sends.',
      });
    }
  }

  const { id, warning } = providerId(options.model);
  if (warning !== null) warnings.push({ kind: 'unmapped-provider', detail: warning });

  // The one assertion Trazum can make without guessing at the task: if the
  // prompt asks for JSON, both versions still have to produce it. Everything
  // else — accuracy, refusal rate, format specifics — is the team's to write,
  // and inventing it here would be a tool with opinions about somebody else's
  // product.
  const assertions = asksForJson(original) ? [{ type: 'is-json' }] : [];

  const label = options.level ? `after (trazum, ${options.level})` : 'after (trazum)';

  return {
    config: {
      description:
        'Generated by trazum. The only difference between the two prompts is the ' +
        'optimisation — same provider, same cases, same everything else.\n\n' +
        'The assertions are yours to write: `trazum eval` already answers "does the model ' +
        'still say the same thing", and this suite exists for the question it cannot ask — ' +
        'whether your accuracy, your format and your refusal rate survived. Add them under ' +
        '`defaultTest.assert` or per test.\n\n' +
        'Docs: https://www.promptfoo.dev/docs/configuration/expected-outputs/',
      prompts: [
        { label: 'before', raw: originalTemplate },
        { label, raw: optimizedTemplate },
      ],
      providers: [id],
      ...(assertions.length > 0 ? { defaultTest: { assert: assertions } } : {}),
      tests: cases.map((input) => ({ vars: { [variable]: input } })),
    },
    warnings,
  };
}

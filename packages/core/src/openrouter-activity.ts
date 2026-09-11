/**
 * OpenRouter's activity report, read as a usage log.
 *
 * The eighth converter, and the third that reads a provider rather than a
 * tool in front of one. OpenRouter is the one provider Trazum already has a
 * price list for by construction: `openrouter.ts` turns its public model
 * catalogue into a pricing overlay, keyed by the same slugs this report
 * carries. So a row here is priceable the moment the overlay is loaded, for
 * hundreds of models the bundled table never typed.
 *
 * ## Derived from the published schema
 *
 * `GET /api/v1/activity` needs a **management key** and answers the last
 * thirty completed UTC days, one row per model per endpoint per day:
 * `date` (`YYYY-MM-DD`), `model` (slug), `model_permaslug` (slug with
 * version), `endpoint_id`, `provider_name`, `usage` (cost in USD),
 * `byok_usage_inference` (BYOK cost in USD), `requests`, `prompt_tokens`,
 * `completion_tokens`, `reasoning_tokens`, and `workspace_id` when the
 * request said `group_by=workspace`. The schema's own example is the
 * fixture.
 *
 * It takes the answer and never the key, for the reason `anthropic-usage.ts`
 * gives: a management key manages the account, and this project holds no
 * provider credential.
 *
 * ## Two figures that are never added
 *
 * `usage` is what OpenRouter charged, in dollars, and it is carried out of
 * this conversion **beside** Trazum's catalogue-priced total, never merged
 * into it — the rule `docs/commands.md` states for LiteLLM's `spend`. They
 * are two measurements of the same rows; a reader is entitled to both and to
 * the gap. `byok_usage_inference` is what an upstream provider charged on the
 * operator's own key through OpenRouter, and is carried separately for the
 * same reason.
 *
 * ## What the record says, and what it declines to say
 *
 * The record is `prompt_tokens` and `completion_tokens` under the model's
 * slug, at the day's start. `model` rather than `model_permaslug`, because
 * the slug is what the pricing overlay is keyed by and a versioned slug
 * would price nothing until somebody mapped it.
 *
 * `reasoning_tokens` are counted and **not added** to the completion count.
 * The schema does not say whether `completion_tokens` already includes
 * them, and adding them if it does would charge reasoning twice on the
 * models where it is the largest line. They are reported so the operator
 * can see the count and settle the question against their own invoice.
 *
 * `endpoint_id` and `provider_name` are read by nothing that reaches the
 * output: a row is priced by model, and which provider served it is what
 * `usage` already reflects. `workspace_id` is read only through a mapping
 * the operator writes, exact match, and unlike Anthropic's a `null` here has
 * one meaning only — the request did not group by workspace.
 */

/** One workspace, and the label the operator gives it. Exact match. */
export interface OpenrouterWorkspaceLabel {
  workspace: string;
  label: string;
}

export interface OpenrouterActivityRecord {
  model: string;
  ts: string;
  label?: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenrouterActivityConversion {
  records: OpenrouterActivityRecord[];
  /** Rows that became records. */
  rows: number;
  /** `requests`, summed. A row is a day's aggregate, not a call. */
  requests: number;
  /** What OpenRouter charged, summed, in dollars. Never merged into Trazum's total. */
  reportedUsageUsd: number;
  /** What upstream providers charged on the operator's own keys, summed. */
  byokUsd: number;
  /** `reasoning_tokens`, summed, and deliberately not added to any record. */
  reasoningTokens: number;
  /** Rows with no model slug, which nothing can price. */
  unnamedModel: number;
  /** Rows whose date was not a `YYYY-MM-DD` day. */
  undatedRows: number;
  /** Distinct days seen, so a reader knows how much of the thirty this is. */
  days: number;
  labelledByWorkspace: number;
  unruledWorkspace: number;
  /** Rules were given and no row carried a workspace id. */
  workspaceNotGrouped: boolean;
  /** The input was not the JSON this endpoint returns. */
  unparseable: number;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function openrouterActivityRecords(
  text: string,
  options: { label?: string; labelByWorkspace?: readonly OpenrouterWorkspaceLabel[] } = {},
): OpenrouterActivityConversion {
  const empty: OpenrouterActivityConversion = {
    records: [],
    rows: 0,
    requests: 0,
    reportedUsageUsd: 0,
    byokUsd: 0,
    reasoningTokens: 0,
    unnamedModel: 0,
    undatedRows: 0,
    days: 0,
    labelledByWorkspace: 0,
    unruledWorkspace: 0,
    workspaceNotGrouped: false,
    unparseable: 0,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: 1 };
  }
  const report = asObject(parsed);
  if (report === null || !Array.isArray(report.data)) return { ...empty, unparseable: 1 };

  const rules = options.labelByWorkspace;
  const records: OpenrouterActivityRecord[] = [];
  const days = new Set<string>();
  let rows = 0;
  let requests = 0;
  let reportedUsageUsd = 0;
  let byokUsd = 0;
  let reasoningTokens = 0;
  let unnamedModel = 0;
  let undatedRows = 0;
  let labelledByWorkspace = 0;
  let unruledWorkspace = 0;
  let anyWorkspace = false;

  for (const found of report.data) {
    const row = asObject(found);
    if (row === null) continue;

    /* The two billed figures are summed over every row, refused or not: a
       refused row was still charged for, and a total that left it out would
       be understated in the direction nobody questions. */
    reportedUsageUsd += count(row.usage);
    byokUsd += count(row.byok_usage_inference);
    requests += count(row.requests);
    reasoningTokens += count(row.reasoning_tokens);

    if (typeof row.date !== 'string' || !DAY.test(row.date)) {
      undatedRows += 1;
      continue;
    }
    if (typeof row.model !== 'string' || row.model === '') {
      unnamedModel += 1;
      continue;
    }
    days.add(row.date);

    let label = options.label;
    if (rules !== undefined) {
      const workspace = typeof row.workspace_id === 'string' ? row.workspace_id : null;
      if (workspace !== null) {
        anyWorkspace = true;
        const named = rules.find((rule) => rule.workspace === workspace);
        if (named !== undefined) {
          label = named.label;
          labelledByWorkspace += 1;
        } else {
          unruledWorkspace += 1;
        }
      }
    }

    records.push({
      model: row.model,
      ts: `${row.date}T00:00:00.000Z`,
      ...(label === undefined ? {} : { label }),
      usage: {
        prompt_tokens: count(row.prompt_tokens),
        completion_tokens: count(row.completion_tokens),
      },
    });
    rows += 1;
  }

  return {
    records,
    rows,
    requests,
    reportedUsageUsd,
    byokUsd,
    reasoningTokens,
    unnamedModel,
    undatedRows,
    days: days.size,
    labelledByWorkspace,
    unruledWorkspace,
    workspaceNotGrouped: rules !== undefined && !anyWorkspace,
    unparseable: 0,
  };
}

/**
 * Whether this text is an OpenRouter activity report. `model_permaslug`
 * belongs to no other document, and `byok_usage_inference` likewise.
 */
export function looksLikeOpenrouterActivity(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  return head.includes('"model_permaslug"') || head.includes('"byok_usage_inference"');
}

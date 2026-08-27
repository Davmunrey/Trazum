/**
 * LangSmith's run export, read as a usage log.
 *
 * The fifth converter in the pattern `from-claude-code` started: a pure
 * function turns one tool's export into Trazum's usage-log records, and every
 * door prices it from there. LangSmith is the tracing product most LangChain
 * teams already run, so the export exists before Trazum does.
 *
 * **The format is derived, not guessed.** Every field below is `RunBase` and
 * `Run` in `python/langsmith/schemas.py` in langchain-ai/langsmith-sdk. A
 * converter written from memory of an API is a converter that silently
 * mis-reads somebody's bill.
 *
 * ## A run is not a call, and that is the whole difficulty
 *
 * LangSmith records a **run**, and a trace is a tree of them: chains, tools and
 * retrievers alongside the model calls. Only `run_type: "llm"` carries token
 * counts, and summing the tree would count the same tokens once per level. So
 * everything else is skipped and **counted out loud** — a converter that
 * quietly dropped two thirds of a file would look like one that read it.
 *
 * ## The model, and why it is refused rather than inferred
 *
 * There is no model column. The name lives in `extra.metadata.ls_model_name`,
 * or in the invocation parameters the SDK records beside it, and a run whose
 * metadata carries neither cannot be priced. The obvious guess is the run's
 * own `name` — LangChain names them after the class, `ChatOpenAI`, which is a
 * client and not a model. Pricing a call by the class that made it would be a
 * figure attributed to something it does not describe, which is the fault this
 * repository keeps finding in itself. Such a run is counted in `unnamedModel`
 * and dropped.
 *
 * ## What deliberately does not cross
 *
 * `inputs` and `outputs` are the prompt and the completion, on every single
 * run. **Neither is read.** `extra.metadata` is read for two named keys and
 * nothing else, because it is a free-form bag the operator fills and the next
 * thing they put in it might be a credential. The converter names the fields
 * it takes and takes nothing else, and a fixture plants a marker in each and
 * greps the whole output.
 *
 * ## What it refuses to invent
 *
 * There is no cache-token split. `prompt_cost_details` looks like one and is
 * not: it is LangSmith's own priced breakdown in dollars, computed from
 * LangSmith's price table. It never enters a record, and neither does
 * `total_cost` — `reportedCostUsd` returns it on its own, the way
 * `from-litellm` keeps the gateway's arithmetic apart from Trazum's. Two price
 * tables, two figures; merging them is how a report becomes quietly wrong.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface LangsmithRecord {
  model: string;
  ts?: string;
  label?: string;
  session?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LangsmithConversion {
  records: LangsmithRecord[];
  /** Runs that were model calls and converted. */
  rows: number;
  /**
   * Runs that were not model calls: chains, tools, retrievers, prompts.
   *
   * Counted rather than ignored. They are most of a LangSmith export, and a
   * reader who converted a thousand runs into three hundred records is owed
   * the reason.
   */
  notModelCalls: number;
  /** Model calls whose metadata named no model: counted, never guessed. */
  unnamedModel: number;
  /** Model calls carrying no token counts at all. */
  noTokens: number;
  /**
   * LangSmith's own cost total, in dollars, or null when no run reported one.
   *
   * Kept apart from anything Trazum computes and never merged into a record.
   * Null is an absence, not a total of nothing.
   */
  reportedCostUsd: number | null;
  /** Lines or documents that did not parse as JSON at all. */
  unparseable: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const asCount = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

const asName = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** `extra.metadata`, which is where LangSmith documents everything user-set. */
function metadataOf(run: Record<string, unknown>): Record<string, unknown> | null {
  const extra = asObject(run.extra);
  return extra === null ? asObject(run.metadata) : (asObject(extra.metadata) ?? asObject(run.metadata));
}

/**
 * The model, from the two named places it is recorded and nowhere else.
 *
 * `ls_model_name` is what the SDK writes; `model` and `model_name` are what a
 * team writes by hand when they set metadata themselves. The run's `name` is
 * deliberately not consulted: LangChain names a run after the client class,
 * and `ChatOpenAI` is not a model anybody can price.
 */
function modelOf(run: Record<string, unknown>): string | null {
  const metadata = metadataOf(run);
  if (metadata !== null) {
    for (const key of ['ls_model_name', 'model_name', 'model']) {
      const found = asName(metadata[key]);
      if (found !== null) return found;
    }
    // The invocation parameters, where the SDK also records it.
    const params = asObject(metadata.invocation_params);
    if (params !== null) {
      for (const key of ['model', 'model_name']) {
        const found = asName(params[key]);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

/**
 * The label, from the tags a team already puts on its traces.
 *
 * `tags` is LangSmith's own list and the first entry wins, because a workload
 * has one name in a bill. Then the two metadata keys a team would plausibly
 * name a workload by. Never joined, never invented.
 */
function labelOf(run: Record<string, unknown>): string | undefined {
  if (Array.isArray(run.tags)) {
    for (const tag of run.tags) {
      const found = asName(tag);
      if (found !== null) return found;
    }
  }
  const metadata = metadataOf(run);
  if (metadata !== null) {
    for (const key of ['label', 'workload']) {
      const found = asName(metadata[key]);
      if (found !== null) return found;
    }
  }
  return undefined;
}

/** The run's start time as an ISO instant, or undefined. */
function timeOf(run: Record<string, unknown>): string | undefined {
  const raw = run.start_time ?? run.startTime;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/**
 * The token counts, from the two shapes LangSmith has written them in.
 *
 * `prompt_tokens` and `completion_tokens` sit on the run; newer exports also
 * carry a nested `usage_metadata` with `input_tokens` and `output_tokens`.
 * Both are read because both are in the wild, and an export from last year is
 * still somebody's bill.
 */
function tokensOf(run: Record<string, unknown>): { input?: number; output?: number } {
  const nested = asObject(run.usage_metadata);
  return {
    input: asCount(run.prompt_tokens) ?? asCount(nested?.input_tokens),
    output: asCount(run.completion_tokens) ?? asCount(nested?.output_tokens),
  };
}

/**
 * Convert a LangSmith run export.
 *
 * Accepts a JSON array of runs, a single run, `{ runs: [...] }` as the list
 * endpoint returns it, or newline-delimited runs. Pure over its input.
 */
export function langsmithRecords(text: string): LangsmithConversion {
  const out: LangsmithConversion = {
    records: [],
    rows: 0,
    notModelCalls: 0,
    unnamedModel: 0,
    noTokens: 0,
    reportedCostUsd: null,
    unparseable: 0,
  };

  const runs: unknown[] = [];
  const whole = tryParse(text);
  if (whole !== undefined) {
    if (Array.isArray(whole)) runs.push(...whole);
    else {
      const doc = asObject(whole);
      if (doc !== null && Array.isArray(doc.runs)) runs.push(...doc.runs);
      else if (doc !== null) runs.push(doc);
    }
  } else {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      const parsed = tryParse(line);
      if (parsed === undefined) out.unparseable += 1;
      else if (Array.isArray(parsed)) runs.push(...parsed);
      else runs.push(parsed);
    }
  }

  let cost = 0;
  let sawCost = false;

  for (const raw of runs) {
    const run = asObject(raw);
    if (run === null) continue;

    /*
      A run is only a call when LangSmith says it is one. The tree carries
      chains, tools, retrievers and prompts alongside the model calls, and the
      parent chain of an llm run repeats its child's tokens: summing the tree
      would bill the same tokens once per level. `run_type` is the field that
      settles it, and a run with no run_type at all is not a run.
    */
    const type = asName(run.run_type);
    if (type === null) continue;
    if (type !== 'llm') {
      out.notModelCalls += 1;
      continue;
    }

    out.rows += 1;

    const reported = asCount(run.total_cost);
    if (reported !== undefined) {
      cost += reported;
      sawCost = true;
    }

    const model = modelOf(run);
    if (model === null) {
      out.unnamedModel += 1;
      continue;
    }

    const { input, output } = tokensOf(run);
    if (input === undefined && output === undefined) {
      out.noTokens += 1;
      continue;
    }
    if (input === 0 && output === 0) out.noTokens += 1;

    const ts = timeOf(run);
    const label = labelOf(run);
    /*
      The trace is the conversation and the run id is one call. `trace_id`
      spans the calls a single request made, which is the identity Trazum's
      conversation findings need; answering them from `id` would report every
      call as a conversation of one.
    */
    const session = asName(run.trace_id);

    out.records.push({
      model,
      ...(ts !== undefined ? { ts } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(session !== null ? { session } : {}),
      usage: { input_tokens: input ?? 0, output_tokens: output ?? 0 },
    });
  }

  // Rounded because these are dollars summed in floating point, and a total
  // printed to eight decimal places reads as a precision nobody has.
  if (sawCost) out.reportedCostUsd = Math.round(cost * 1e6) / 1e6;

  return out;
}

/**
 * Whether a file looks like a LangSmith run export, by shape.
 *
 * Deliberately narrow: `run_type` beside one of the trace fields only
 * LangSmith writes. A looser test would claim a Helicone export or a LiteLLM
 * spend log — both carry `prompt_tokens` — and refuse it in this file's words
 * instead of letting the code that can read it try.
 */
export function looksLikeLangsmith(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (!head.includes('"run_type"')) return false;
  return (
    head.includes('"trace_id"') ||
    head.includes('"dotted_order"') ||
    head.includes('"start_time"') ||
    head.includes('"session_id"')
  );
}

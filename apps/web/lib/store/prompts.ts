/**
 * Saved prompts, and every version of each one.
 *
 * Three decisions shape this file, and all three are easier to argue for now
 * than to change later.
 *
 * **Versions are append-only.** Saving over a prompt writes a new row; nothing
 * ever updates a version. A history you can edit is not a history, and the
 * question this feature exists to answer — *what did we change, and did it get
 * more expensive?* — is unanswerable the moment a row can be rewritten.
 *
 * **Token counts are not stored.** They are recomputed from the text on the way
 * out, which is the opposite of what a cache-minded reading suggests. The reason
 * is that the history is a chart: two versions saved a year apart, priced by two
 * different estimators, produce a line that moves when nothing about the prompts
 * did. Recomputing every version with today's estimator is slower and is the only
 * way the comparison means anything.
 *
 * **Ownership is a predicate, never a check.** Every method takes `ownerId` and
 * every driver puts it *in the query*. Fetching a row and then comparing its
 * owner is the same check-then-use seam that kept a CodeQL alert open in the
 * core, and here it is one forgotten `if` away from handing somebody else's
 * library to whoever guesses a UUID.
 */

export interface PromptRecord {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
  /** When the newest version was written. */
  updatedAt: Date;
}

export interface PromptVersionRecord {
  id: string;
  promptId: string;
  /** 1, 2, 3… within this prompt. Not a global counter. */
  version: number;
  text: string;
  /** Why this change, in the author's words. Optional and often absent. */
  note: string | null;
  /** Who saved it. The owner today; a teammate once teams exist. */
  authorId: string;
  createdAt: Date;
}

/** A prompt with enough about its history to render a list row. */
export interface PromptSummary extends PromptRecord {
  versionCount: number;
  /** The newest version's text, so a list can show a preview and a token count. */
  latestText: string;
}

export interface PromptWithHistory extends PromptRecord {
  /** Newest first, which is the order the page reads them in. */
  versions: PromptVersionRecord[];
}

/**
 * What `addVersion` did.
 *
 * `unchanged` is a real outcome and not an error: pressing Save twice on text
 * nobody edited must not put two identical rows in the history. Reported rather
 * than swallowed, so the UI can say "no changes to save" instead of implying it
 * wrote something.
 */
export type AddVersionResult =
  | { status: 'saved'; version: PromptVersionRecord }
  | { status: 'unchanged'; version: PromptVersionRecord }
  | { status: 'not-found' }
  | { status: 'too-many-versions' };

/**
 * Ceilings, because a signed-in account is a write credential.
 *
 * Every one of these is refused loudly rather than trimmed silently. Pruning the
 * oldest version to make room would quietly delete the record somebody kept the
 * prompt for.
 */
export const MAX_PROMPTS_PER_OWNER = 200;
export const MAX_VERSIONS_PER_PROMPT = 500;
export const MAX_PROMPT_TEXT_CHARS = 100_000;
export const MAX_PROMPT_NAME_CHARS = 120;
export const MAX_NOTE_CHARS = 500;

/**
 * One prompt, as the deployment-wide overview sees it.
 *
 * Carries the text because a token count has to be computed from it, and
 * carries the owner's login because the overview's whole job is saying *whose*
 * prompt is the expensive one. It does **not** leave this layer: the admin API
 * turns it into counts and never sends the text to a browser.
 */
export interface PromptCensusEntry {
  id: string;
  name: string;
  ownerId: string;
  ownerLogin: string;
  latestText: string;
  versionCount: number;
  updatedAt: Date;
}

export interface PromptCensus {
  entries: PromptCensusEntry[];
  /** Every prompt in the deployment, including those beyond the cap. */
  totalPrompts: number;
  /** Distinct accounts holding at least one prompt. */
  totalAccounts: number;
}

/**
 * How many prompts one overview will read the text of.
 *
 * A cap, because the overview computes a real token count per prompt and that
 * means holding every prompt's text in memory at once. When it bites, the API
 * says so — `truncated: true` and both numbers — rather than quietly reporting a
 * total that covers part of the deployment.
 */
export const CENSUS_LIMIT = 500;

export interface PromptStore {
  listPrompts(ownerId: string): Promise<PromptSummary[]>;

  /** `null` when the owner is already at `MAX_PROMPTS_PER_OWNER`. */
  createPrompt(input: {
    ownerId: string;
    name: string;
    text: string;
    note: string | null;
    now: Date;
  }): Promise<PromptRecord | null>;

  /** Scoped to the owner in the query. A wrong owner is indistinguishable from a wrong id. */
  getPrompt(id: string, ownerId: string): Promise<PromptWithHistory | null>;

  addVersion(input: {
    promptId: string;
    ownerId: string;
    authorId: string;
    text: string;
    note: string | null;
    now: Date;
  }): Promise<AddVersionResult>;

  /** `false` when no prompt with that id belongs to this owner. */
  renamePrompt(id: string, ownerId: string, name: string, now: Date): Promise<boolean>;

  /** Takes the versions with it. `false` when there was nothing of theirs to delete. */
  deletePrompt(id: string, ownerId: string): Promise<boolean>;

}

/**
 * Reading across accounts. A separate interface, deliberately.
 *
 * `census` was briefly a method on `PromptStore` with a comment calling itself
 * "the documented hole" in the rule that every lookup binds an owner — and the
 * guard written to enforce that rule immediately failed on it, which was the
 * guard being right. A rule with a documented exception inside it is a rule
 * somebody adds a second exception to.
 *
 * So it lives here instead, the same way `ShareStore.findShare` does: the two
 * places in Trazum that read something without an owner are the two places that
 * are not `PromptStore`, and "every `PromptStore` lookup binds an owner" stays a
 * true sentence rather than a mostly-true one.
 *
 * Nothing reaches this without passing `adminSource`, and `TRAZUM_ADMINS` is
 * empty by default, so on an ordinary deployment nothing can call it at all.
 */
export interface AdminStore {
  census(limit: number): Promise<PromptCensus>;
}

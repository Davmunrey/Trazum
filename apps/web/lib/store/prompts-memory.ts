import { randomUUID } from 'node:crypto';

import {
  MAX_PROMPTS_PER_OWNER,
  MAX_VERSIONS_PER_PROMPT,
} from './prompts';
import type { AdminStore, PromptCensus } from './prompts';
import type {
  AddVersionResult,
  PromptRecord,
  PromptStore,
  PromptSummary,
  PromptVersionRecord,
  PromptWithHistory,
} from './prompts';

/**
 * The prompt library in a Map.
 *
 * Held to the same suite as the Postgres driver, and written to fail the same
 * way it does — including the parts that look like the database's job. The
 * per-owner name uniqueness is enforced here as well as by a constraint there,
 * because a memory deployment that silently allowed two prompts called "triage"
 * would be a different product from the Postgres one.
 */
/**
 * The prompt tables, and the two capabilities that read them.
 *
 * One factory rather than two, because the deployment overview and the prompt
 * library share the same maps and there is no honest way for the overview to
 * reach them from outside. They stay two *interfaces* — `PromptStore` binds an
 * owner in every lookup, `AdminStore` does not — which is the distinction worth
 * keeping. Sharing the storage is not the same as sharing the rule.
 */
export function promptTablesInMemory(): {
  prompts: PromptStore;
  /**
   * @param loginOf how to name an owner. Injected because the accounts live in
   * a different map owned by a different module, and this one has no business
   * reading the user table. Falls back to the id so an overview is never blank.
   */
  adminFor(loginOf: (ownerId: string) => string): AdminStore;
} {
  const promptRows = new Map<string, PromptRecord>();
  const versions = new Map<string, PromptVersionRecord[]>();

  /** The rows this owner may see. The only way rows are ever selected. */
  const ownedBy = (ownerId: string) =>
    [...promptRows.values()].filter((prompt) => prompt.ownerId === ownerId);

  /**
   * A prompt, but only if it is theirs.
   *
   * Every method goes through this rather than through `prompts.get`. Fetching
   * first and comparing the owner afterwards is one forgotten `if` away from
   * handing a stranger's library to whoever guesses a UUID, and the shape that
   * cannot forget is the one that never holds the row in the first place.
   */
  const owned = (id: string, ownerId: string): PromptRecord | null => {
    const prompt = promptRows.get(id);
    return prompt && prompt.ownerId === ownerId ? prompt : null;
  };

  const newestFirst = (promptId: string) =>
    [...(versions.get(promptId) ?? [])].sort((a, b) => b.version - a.version);

  const prompts: PromptStore = {
    async listPrompts(ownerId: string): Promise<PromptSummary[]> {
      return ownedBy(ownerId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((prompt) => {
          const history = newestFirst(prompt.id);
          return {
            ...prompt,
            versionCount: history.length,
            latestText: history[0]?.text ?? '',
          };
        });
    },

    async createPrompt({ ownerId, name, text, note, now }): Promise<PromptRecord | null> {
      if (ownedBy(ownerId).length >= MAX_PROMPTS_PER_OWNER) return null;
      if (ownedBy(ownerId).some((prompt) => prompt.name === name)) return null;

      const prompt: PromptRecord = {
        id: randomUUID(),
        ownerId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      promptRows.set(prompt.id, prompt);

      // Created with version 1 rather than empty. A prompt with no versions has
      // no text, and every reader of this store would need a branch for it.
      versions.set(prompt.id, [
        {
          id: randomUUID(),
          promptId: prompt.id,
          version: 1,
          text,
          note,
          authorId: ownerId,
          createdAt: now,
        },
      ]);

      return prompt;
    },

    async getPrompt(id: string, ownerId: string): Promise<PromptWithHistory | null> {
      const prompt = owned(id, ownerId);
      if (!prompt) return null;
      return { ...prompt, versions: newestFirst(id) };
    },

    async addVersion({ promptId, ownerId, authorId, text, note, now }): Promise<AddVersionResult> {
      const prompt = owned(promptId, ownerId);
      if (!prompt) return { status: 'not-found' };

      const history = newestFirst(promptId);
      const latest = history[0];

      // Saving text nobody edited is not a change. Two identical rows in a
      // history is noise in the one view that exists to show what moved.
      if (latest && latest.text === text) return { status: 'unchanged', version: latest };

      if (history.length >= MAX_VERSIONS_PER_PROMPT) return { status: 'too-many-versions' };

      const version: PromptVersionRecord = {
        id: randomUUID(),
        promptId,
        version: (latest?.version ?? 0) + 1,
        text,
        note,
        authorId,
        createdAt: now,
      };

      versions.set(promptId, [...(versions.get(promptId) ?? []), version]);
      promptRows.set(promptId, { ...prompt, updatedAt: now });
      return { status: 'saved', version };
    },

    async renamePrompt(id: string, ownerId: string, name: string, now: Date): Promise<boolean> {
      const prompt = owned(id, ownerId);
      if (!prompt) return false;
      // Their own other prompts, not everyone's: the constraint is per owner.
      if (ownedBy(ownerId).some((other) => other.id !== id && other.name === name)) return false;

      promptRows.set(id, { ...prompt, name, updatedAt: now });
      return true;
    },

    async deletePrompt(id: string, ownerId: string): Promise<boolean> {
      if (!owned(id, ownerId)) return false;
      promptRows.delete(id);
      /**
       * The cascade the schema declares, done by hand.
       *
       * Unkillable by this repository's suite, and said out loud rather than
       * left as a green tick: removing this line changes nothing any caller can
       * observe, because the prompt it belonged to is already gone and ids are
       * UUIDs, so nothing will ever ask for it again. What it changes is that
       * the text of a deleted prompt stays in memory for the life of the
       * process — which is not a correctness bug and is exactly the kind of
       * thing somebody deletes during a cleanup because no test complained.
       */
      versions.delete(id);
      return true;
    },
  };

  return {
    prompts,
    adminFor: (loginOf) => adminInMemory(() => promptRows.values(), newestFirst, loginOf),
  };
}

/** The library alone, for callers that have no business with the overview. */
export function promptsInMemory(): PromptStore {
  return promptTablesInMemory().prompts;
}

/**
 * The deployment-wide read, in memory.
 *
 * Takes the same maps the prompt store holds, handed in rather than reached for:
 * this is a different capability with a different guard, and giving it its own
 * factory keeps that visible at the call site in `memory.ts`.
 */
export function adminInMemory(
  prompts: () => Iterable<{ id: string; ownerId: string; name: string; updatedAt: Date }>,
  versionsOf: (promptId: string) => { text: string }[],
  loginOf: (ownerId: string) => string,
): AdminStore {
  return {
    async census(limit: number): Promise<PromptCensus> {
      const all = [...prompts()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return {
        // Sliced after sorting, so a truncated census is the most recently
        // touched prompts rather than an arbitrary subset.
        entries: all.slice(0, limit).map((prompt) => {
          const history = versionsOf(prompt.id);
          return {
            id: prompt.id,
            name: prompt.name,
            ownerId: prompt.ownerId,
            ownerLogin: loginOf(prompt.ownerId),
            latestText: history[0]?.text ?? '',
            versionCount: history.length,
            updatedAt: prompt.updatedAt,
          };
        }),
        // Counted over everything, not over the slice: a total that silently
        // described only the first five hundred would be the exact mistake the
        // cap exists to make visible.
        totalPrompts: all.length,
        totalAccounts: new Set(all.map((prompt) => prompt.ownerId)).size,
      };
    },
  };
}

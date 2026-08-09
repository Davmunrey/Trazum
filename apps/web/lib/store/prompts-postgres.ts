import { randomUUID } from 'node:crypto';

import { MAX_PROMPTS_PER_OWNER, MAX_VERSIONS_PER_PROMPT } from './prompts';
import type { AdminStore, PromptCensus } from './prompts';
import type {
  AddVersionResult,
  PromptRecord,
  PromptStore,
  PromptSummary,
  PromptVersionRecord,
  PromptWithHistory,
} from './prompts';
import type { SqlClient } from './postgres';

/**
 * The prompt library, against any Postgres.
 *
 * Every statement carries `owner_id` in its `where` clause. Not as belt and
 * braces over a check in JavaScript — instead of one. A query that cannot
 * select another owner's row is a property of the query; a comparison after the
 * fetch is a property of whoever remembered to write it.
 *
 * The same honesty as the accounts driver applies: this SQL is asserted against
 * a recording tagged template, not against a database. That catches a mistyped
 * column and a value bound in the wrong place, and cannot catch SQL Postgres
 * would reject.
 */

type Row = Record<string, unknown>;

const asDate = (value: unknown) => new Date(value as string);
const asText = (value: unknown) => (value === null || value === undefined ? null : String(value));

function toPrompt(row: Row): PromptRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function toVersion(row: Row): PromptVersionRecord {
  return {
    id: String(row.id),
    promptId: String(row.prompt_id),
    version: Number(row.version),
    text: String(row.text),
    note: asText(row.note),
    authorId: String(row.author_id),
    createdAt: asDate(row.created_at),
  };
}

export function promptsInPostgres(sql: SqlClient): PromptStore {
  return {
    async listPrompts(ownerId: string): Promise<PromptSummary[]> {
      // One statement rather than one per prompt: a list of two hundred prompts
      // should not be two hundred round trips. `distinct on` gives Postgres the
      // newest version per prompt directly.
      const rows = await sql<Row>`
        select
          p.id, p.owner_id, p.name, p.created_at, p.updated_at,
          coalesce(counts.version_count, 0) as version_count,
          coalesce(latest.text, '')         as latest_text
        from trazum_prompts p
        left join lateral (
          select count(*) as version_count
          from trazum_prompt_versions v
          where v.prompt_id = p.id
        ) counts on true
        left join lateral (
          select v.text
          from trazum_prompt_versions v
          where v.prompt_id = p.id
          order by v.version desc
          limit 1
        ) latest on true
        where p.owner_id = ${ownerId}
        order by p.updated_at desc
      `;

      return rows.map((row) => ({
        ...toPrompt(row),
        versionCount: Number(row.version_count),
        latestText: String(row.latest_text),
      }));
    },

    async createPrompt({ ownerId, name, text, note, now }): Promise<PromptRecord | null> {
      const [count] = await sql<Row>`
        select count(*) as total from trazum_prompts where owner_id = ${ownerId}
      `;
      if (Number(count?.total ?? 0) >= MAX_PROMPTS_PER_OWNER) return null;

      const id = randomUUID();
      // `do nothing` rather than letting the unique constraint throw: a name the
      // owner already used is an ordinary answer to give a form, not an
      // exception to catch by matching on a driver's error string.
      const rows = await sql<Row>`
        insert into trazum_prompts (id, owner_id, name, created_at, updated_at)
        values (${id}, ${ownerId}, ${name}, ${now}, ${now})
        on conflict (owner_id, name) do nothing
        returning id, owner_id, name, created_at, updated_at
      `;

      const row = rows[0];
      if (!row) return null;

      await sql`
        insert into trazum_prompt_versions
          (id, prompt_id, version, text, note, author_id, created_at)
        values (${randomUUID()}, ${id}, 1, ${text}, ${note}, ${ownerId}, ${now})
      `;

      return toPrompt(row);
    },

    async getPrompt(id: string, ownerId: string): Promise<PromptWithHistory | null> {
      const prompts = await sql<Row>`
        select id, owner_id, name, created_at, updated_at
        from trazum_prompts
        where id = ${id} and owner_id = ${ownerId}
      `;
      const prompt = prompts[0];
      if (!prompt) return null;

      // Safe to select by `prompt_id` alone: the statement above already proved
      // this prompt is theirs, and it did so in the query rather than after it.
      const versions = await sql<Row>`
        select id, prompt_id, version, text, note, author_id, created_at
        from trazum_prompt_versions
        where prompt_id = ${id}
        order by version desc
      `;

      return { ...toPrompt(prompt), versions: versions.map(toVersion) };
    },

    async addVersion({ promptId, ownerId, authorId, text, note, now }): Promise<AddVersionResult> {
      // The owner predicate and the newest version in one statement, so there is
      // no moment where the code holds a prompt it has not yet proved is theirs.
      const rows = await sql<Row>`
        select
          v.id, v.prompt_id, v.version, v.text, v.note, v.author_id, v.created_at,
          (select count(*) from trazum_prompt_versions w where w.prompt_id = p.id) as version_count
        from trazum_prompts p
        left join lateral (
          select * from trazum_prompt_versions v
          where v.prompt_id = p.id
          order by v.version desc
          limit 1
        ) v on true
        where p.id = ${promptId} and p.owner_id = ${ownerId}
      `;

      const row = rows[0];
      if (!row) return { status: 'not-found' };

      const latest = row.id ? toVersion(row) : null;
      if (latest && latest.text === text) return { status: 'unchanged', version: latest };
      if (Number(row.version_count ?? 0) >= MAX_VERSIONS_PER_PROMPT) {
        return { status: 'too-many-versions' };
      }

      const next = (latest?.version ?? 0) + 1;
      const inserted = await sql<Row>`
        insert into trazum_prompt_versions
          (id, prompt_id, version, text, note, author_id, created_at)
        values (${randomUUID()}, ${promptId}, ${next}, ${text}, ${note}, ${authorId}, ${now})
        returning id, prompt_id, version, text, note, author_id, created_at
      `;

      await sql`update trazum_prompts set updated_at = ${now} where id = ${promptId}`;

      const version = inserted[0];
      if (!version) throw new Error('trazum: version insert returned no row');
      return { status: 'saved', version: toVersion(version) };
    },

    async renamePrompt(id: string, ownerId: string, name: string, now: Date): Promise<boolean> {
      const rows = await sql<Row>`
        update trazum_prompts
        set name = ${name}, updated_at = ${now}
        where id = ${id} and owner_id = ${ownerId}
          and not exists (
            select 1 from trazum_prompts other
            where other.owner_id = ${ownerId} and other.name = ${name} and other.id <> ${id}
          )
        returning id
      `;
      return rows.length > 0;
    },

    async deletePrompt(id: string, ownerId: string): Promise<boolean> {
      // The versions go with it through `on delete cascade` in the schema, which
      // is why there is no second statement here — and why the schema test
      // asserts the cascade rather than trusting this comment.
      const rows = await sql<Row>`
        delete from trazum_prompts where id = ${id} and owner_id = ${ownerId} returning id
      `;
      return rows.length > 0;
    },
  };
}

/** The deployment-wide read, against Postgres. Its own factory, like the memory one. */
export function adminInPostgres(sql: SqlClient): AdminStore {
  return {
    async census(limit: number): Promise<PromptCensus> {
      // The totals come from their own statement rather than from the length of
      // the list below. Counting the rows that were returned would report the
      // cap as the size of the deployment, which is the one number this method
      // exists to be honest about.
      const [totals] = await sql<Row>`
        select count(*) as prompts, count(distinct owner_id) as accounts
        from trazum_prompts
      `;

      const rows = await sql<Row>`
        select
          p.id, p.name, p.owner_id, p.updated_at,
          u.login as owner_login,
          coalesce(latest.text, '')        as latest_text,
          coalesce(counts.version_count, 0) as version_count
        from trazum_prompts p
        join trazum_users u on u.id = p.owner_id
        left join lateral (
          select v.text from trazum_prompt_versions v
          where v.prompt_id = p.id order by v.version desc limit 1
        ) latest on true
        left join lateral (
          select count(*) as version_count from trazum_prompt_versions v
          where v.prompt_id = p.id
        ) counts on true
        order by p.updated_at desc
        limit ${limit}
      `;

      return {
        entries: rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          ownerId: String(row.owner_id),
          ownerLogin: String(row.owner_login),
          latestText: String(row.latest_text),
          versionCount: Number(row.version_count),
          updatedAt: new Date(row.updated_at as string),
        })),
        totalPrompts: Number(totals?.prompts ?? 0),
        totalAccounts: Number(totals?.accounts ?? 0),
      };
    },
  };
}

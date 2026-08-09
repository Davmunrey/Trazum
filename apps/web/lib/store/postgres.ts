import { randomUUID } from 'node:crypto';

import { promptsInPostgres } from './prompts-postgres';
import { sharesInPostgres } from './shares-postgres';
import type { NewUser, SessionRecord, Store, UserRecord } from './types';

/**
 * The same store, against any Postgres.
 *
 * Any Postgres, not one vendor's: the driver speaks plain SQL over a connection
 * string, so Supabase, Neon, RDS and a container on your laptop are the same
 * deployment. `db/001_accounts.sql` is the whole schema.
 *
 * Every statement is a tagged template, so every interpolation is a bound
 * parameter and not string concatenation. That is worth stating rather than
 * assuming, because it is the one property that makes the `login` and `name`
 * fields — which arrive from a third party and are echoed into the UI — safe to
 * put in a query at all.
 */

/**
 * The shape this driver uses from `postgres`.
 *
 * Declared here rather than imported so the module type-checks without the
 * package present, and so the tests can pass a recorder in its place. The tests
 * do exactly that: they run the real driver against a fake tagged template and
 * assert on the SQL and the bound values.
 *
 * Be honest about what that can and cannot catch. It catches a column renamed
 * on one side only, a value bound in the wrong order, and an `on conflict`
 * clause that would overwrite `created_at`. It cannot catch SQL that Postgres
 * would reject, because nothing here parses SQL — that is what applying
 * `001_accounts.sql` to a real database checks, and it is a step a human has to
 * take.
 */
export interface SqlClient {
  <T = Row>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  end?(): Promise<void>;
}

type Row = Record<string, unknown>;

function toUser(row: Row): UserRecord {
  return {
    id: String(row.id),
    provider: 'github',
    providerId: String(row.provider_id),
    login: String(row.login),
    name: row.name === null || row.name === undefined ? null : String(row.name),
    avatarUrl:
      row.avatar_url === null || row.avatar_url === undefined ? null : String(row.avatar_url),
    createdAt: new Date(row.created_at as string),
  };
}

export function postgresStore(sql: SqlClient): Store {
  return {
    kind: 'postgres',
    ephemeral: false,
    prompts: promptsInPostgres(sql),
    shares: sharesInPostgres(sql),

    async upsertUser(input: NewUser, now: Date): Promise<UserRecord> {
      // `created_at` is absent from the update list on purpose: a sign-in that
      // renames the account must not also reset the day it joined. `excluded`
      // holds the row we tried to insert, so listing it would do exactly that.
      const rows = await sql<Row>`
        insert into trazum_users (id, provider, provider_id, login, name, avatar_url, created_at)
        values (${randomUUID()}, ${input.provider}, ${input.providerId},
                ${input.login}, ${input.name}, ${input.avatarUrl}, ${now})
        on conflict (provider, provider_id) do update set
          login      = excluded.login,
          name       = excluded.name,
          avatar_url = excluded.avatar_url
        returning id, provider, provider_id, login, name, avatar_url, created_at
      `;

      const row = rows[0];
      if (!row) {
        // `returning` on an upsert always yields a row; if it did not, the
        // caller is about to mint a session for a user id that does not exist.
        throw new Error('trazum: upsert returned no row');
      }
      return toUser(row);
    },

    async createSession(session: SessionRecord): Promise<void> {
      await sql`
        insert into trazum_sessions (token_hash, user_id, created_at, expires_at)
        values (${session.tokenHash}, ${session.userId}, ${session.createdAt}, ${session.expiresAt})
      `;
    },

    async findSession(tokenHash: string, now: Date) {
      // Expiry is checked in SQL rather than in JavaScript so the database's
      // answer and ours cannot differ, and so an expired row never travels.
      const rows = await sql<Row>`
        select
          s.token_hash,
          s.user_id,
          s.created_at as session_created_at,
          s.expires_at,
          u.id,
          u.provider_id,
          u.login,
          u.name,
          u.avatar_url,
          u.created_at
        from trazum_sessions s
        join trazum_users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.expires_at > ${now}
      `;

      const row = rows[0];
      if (!row) {
        // Nothing matched: either unknown, or known and expired. Delete on the
        // way out so an abandoned session does not sit in the table forever.
        // Unconditional because the select cannot tell us which case it was,
        // and deleting a token_hash that was never there costs nothing.
        await sql`delete from trazum_sessions where token_hash = ${tokenHash} and expires_at <= ${now}`;
        return null;
      }

      return {
        session: {
          tokenHash: String(row.token_hash),
          userId: String(row.user_id),
          createdAt: new Date(row.session_created_at as string),
          expiresAt: new Date(row.expires_at as string),
        },
        user: toUser(row),
      };
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await sql`delete from trazum_sessions where token_hash = ${tokenHash}`;
    },

    async deleteSessionsForUser(userId: string): Promise<void> {
      await sql`delete from trazum_sessions where user_id = ${userId}`;
    },

    async close(): Promise<void> {
      await sql.end?.();
    },
  };
}

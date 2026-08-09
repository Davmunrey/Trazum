import { MAX_SHARES_PER_OWNER } from './shares';
import type { ShareRecord, ShareSettings, ShareStore, ShareSummary } from './shares';
import { sharePreview } from './shares-memory';
import type { SqlClient } from './postgres';

/**
 * Share links, against any Postgres.
 *
 * `findShare` is the one query in this application that deliberately does not
 * bind an owner — an anonymous reader has no owner to be. Everything else here
 * does, and the split lives in the interface rather than in a comment so the
 * exception is visible at the type level.
 */

type Row = Record<string, unknown>;

function toShare(row: Row): ShareRecord {
  return {
    token: String(row.token),
    ownerId: String(row.owner_id),
    ownerLogin: String(row.owner_login),
    beforeText: String(row.before_text),
    afterText: String(row.after_text),
    // Parsed defensively rather than cast. The column is canonicalised on write,
    // but a row can also arrive from a migration, a restore or somebody's psql
    // session, and a settings object with a missing field would reach the core
    // as `undefined` and be blamed on the core.
    settings: row.settings as ShareSettings,
    createdAt: new Date(row.created_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
  };
}

export function sharesInPostgres(sql: SqlClient): ShareStore {
  return {
    async createShare(input): Promise<ShareRecord | null> {
      const [count] = await sql<Row>`
        select count(*) as total from trazum_shares where owner_id = ${input.ownerId}
      `;
      if (Number(count?.total ?? 0) >= MAX_SHARES_PER_OWNER) return null;

      const rows = await sql<Row>`
        insert into trazum_shares
          (token, owner_id, owner_login, before_text, after_text, settings, created_at, expires_at)
        values (${input.token}, ${input.ownerId}, ${input.ownerLogin}, ${input.beforeText},
                ${input.afterText}, ${JSON.stringify(input.settings)}::jsonb,
                ${input.now}, ${input.expiresAt})
        returning token, owner_id, owner_login, before_text, after_text, settings, created_at, expires_at
      `;

      const row = rows[0];
      if (!row) throw new Error('trazum: share insert returned no row');
      return toShare(row);
    },

    async findShare(token: string, now: Date): Promise<ShareRecord | null> {
      // Expiry in SQL, so the database's answer and ours cannot differ, and so
      // an expired row never travels. `is null` first: a link with no expiry.
      const rows = await sql<Row>`
        select token, owner_id, owner_login, before_text, after_text, settings, created_at, expires_at
        from trazum_shares
        where token = ${token} and (expires_at is null or expires_at > ${now})
      `;
      return rows[0] ? toShare(rows[0]) : null;
    },

    async listShares(ownerId: string, now: Date): Promise<ShareSummary[]> {
      const rows = await sql<Row>`
        select token, before_text, created_at, expires_at
        from trazum_shares
        where owner_id = ${ownerId} and (expires_at is null or expires_at > ${now})
        order by created_at desc
      `;

      return rows.map((row) => ({
        token: String(row.token),
        createdAt: new Date(row.created_at as string),
        expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
        preview: sharePreview(String(row.before_text)),
      }));
    },

    async revokeShare(token: string, ownerId: string): Promise<boolean> {
      const rows = await sql<Row>`
        delete from trazum_shares where token = ${token} and owner_id = ${ownerId} returning token
      `;
      return rows.length > 0;
    },
  };
}

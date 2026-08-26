import { randomUUID } from 'node:crypto';

import { promptTablesInMemory } from './prompts-memory';
import { sharesInMemory } from './shares-memory';
import type { NewUser, SessionRecord, Store, UserRecord } from './types';

/**
 * The default store: everything in a Map, nothing on disk.
 *
 * Not a test double. It is what an unconfigured deployment runs on, and it is
 * the reason `TRAZUM_DATABASE_URL` is optional rather than required — Trazum
 * without a database is the tool it has always been, plus a sign-in that works
 * until the process restarts. `ephemeral` says so out loud so the UI can too.
 *
 * It is also the driver the store tests run against, which is deliberate: the
 * Postgres driver is held to the same suite (see `postgres.test.mjs`), so the
 * two cannot quietly diverge on the questions that matter — expiry, rename,
 * and what a second sign-in does to the first one's session.
 */
export function memoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();

  /** `(provider, providerId)` — the key the provider guarantees is stable. */
  const key = (provider: string, providerId: string) => `${provider}:${providerId}`;
  const byProvider = new Map<string, string>();

  // Both read the same maps; only one of them binds an owner. Built together
  // because there is no honest way for the overview to reach them from outside.
  const tables = promptTablesInMemory();
  const shareTable = sharesInMemory();

  return {
    kind: 'memory',
    ephemeral: true,
    prompts: tables.prompts,
    shares: shareTable.shares,
    admin: tables.adminFor((ownerId) => users.get(ownerId)?.login ?? ownerId),

    async upsertUser(input: NewUser, now: Date): Promise<UserRecord> {
      const existingId = byProvider.get(key(input.provider, input.providerId));
      const existing = existingId ? users.get(existingId) : undefined;

      // `createdAt` is kept from the original row on purpose: a rename upstream
      // must not make a two-year-old account look like it joined today.
      const record: UserRecord = {
        id: existing?.id ?? randomUUID(),
        provider: input.provider,
        providerId: input.providerId,
        login: input.login,
        name: input.name,
        avatarUrl: input.avatarUrl,
        createdAt: existing?.createdAt ?? now,
      };

      users.set(record.id, record);
      byProvider.set(key(record.provider, record.providerId), record.id);
      return record;
    },

    async createSession(session: SessionRecord): Promise<void> {
      sessions.set(session.tokenHash, { ...session });
    },

    async findSession(tokenHash: string, now: Date) {
      const session = sessions.get(tokenHash);
      if (!session) return null;

      // `<=` rather than `<`: a session whose expiry is exactly now is over.
      if (session.expiresAt.getTime() <= now.getTime()) {
        sessions.delete(tokenHash);
        return null;
      }

      const user = users.get(session.userId);
      // A session whose user is gone is not a session. Reachable only if a user
      // is deleted without their sessions, which `deleteSessionsForUser` exists
      // to prevent — this is the belt to that pair of braces.
      if (!user) {
        sessions.delete(tokenHash);
        return null;
      }

      return { session: { ...session }, user: { ...user } };
    },

    async deleteSession(tokenHash: string): Promise<void> {
      sessions.delete(tokenHash);
    },

    async deleteSessionsForUser(userId: string): Promise<void> {
      for (const [hash, session] of sessions) {
        if (session.userId === userId) sessions.delete(hash);
      }
    },

    async deleteExpiredSessions(now: Date): Promise<number> {
      let gone = 0;
      for (const [hash, session] of sessions) {
        // `<=` rather than `<`, matching `findSession`: a session whose expiry
        // is exactly now is over, and the two must agree or a row is dead to
        // one and alive to the other.
        if (session.expiresAt.getTime() <= now.getTime()) {
          sessions.delete(hash);
          gone += 1;
        }
      }
      return gone;
    },

    async deleteUser(userId: string): Promise<boolean> {
      const user = users.get(userId);
      if (!user) return false;

      /**
       * The cascade Postgres gets from its foreign keys, written out.
       *
       * Every one of these is a `references trazum_users (id) on delete
       * cascade` over there, which is why the test for this runs against both
       * drivers: the version that is one `delete` in SQL is five statements
       * here, and five is where one gets forgotten.
       */
      tables.purgeOwner(userId);
      shareTable.purgeOwner(userId);
      for (const [hash, session] of sessions) {
        if (session.userId === userId) sessions.delete(hash);
      }

      // The provider index last, and by the key the row itself carries rather
      // than by a key rebuilt from arguments: a user who renamed upstream has a
      // login that no longer derives the entry that points at them.
      byProvider.delete(key(user.provider, user.providerId));
      users.delete(userId);
      return true;
    },

    async close(): Promise<void> {},
  };
}

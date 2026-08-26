/**
 * What Trazum needs to remember between requests, and nothing else.
 *
 * Until now the web app remembered nothing: every request carried its own
 * prompt, computed an answer and forgot both. Accounts change that, so this
 * file exists to keep the change small and reviewable — one interface, one
 * table per concept, and two drivers that have to satisfy the same tests.
 *
 * Three rules the drivers are held to, because they are the ones a leak turns
 * on:
 *
 * 1. **Session tokens are never stored.** Only their SHA-256. A dump of the
 *    `sessions` table is a list of hashes, not a list of live logins.
 * 2. **The provider's access token is never stored at all.** It is exchanged,
 *    used once to read the account's name, and dropped. Trazum cannot act on
 *    anyone's GitHub account because it does not keep the means to.
 * 3. **`now` is an argument.** Expiry is decided by the caller's clock, which
 *    is what makes it testable without waiting a month.
 */

import type { AdminStore, PromptStore } from './prompts';
import type { ShareStore } from './shares';

/** Identity providers this deployment can authenticate against. */
export type AuthProvider = 'github';

export interface UserRecord {
  /** Ours, not the provider's. A UUID, stable across provider renames. */
  id: string;
  provider: AuthProvider;
  /**
   * The provider's immutable id for the account, as a string.
   *
   * GitHub's numeric id, not the login: logins are renameable and reusable, so
   * keying on one would hand a released username the previous holder's saved
   * prompts.
   */
  providerId: string;
  /** Display handle. Refreshed on every sign-in, so a rename follows through. */
  login: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

/** The fields a sign-in supplies; `id` and `createdAt` belong to the store. */
export interface NewUser {
  provider: AuthProvider;
  providerId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface SessionRecord {
  /** SHA-256 of the cookie value, hex. The cookie value itself is never here. */
  tokenHash: string;
  userId: string;
  createdAt: Date;
  /** Absolute expiry. Enforced server-side; the cookie's Max-Age is a courtesy. */
  expiresAt: Date;
}

export interface Store {
  readonly kind: 'memory' | 'postgres';

  /**
   * The prompt library.
   *
   * A nested namespace rather than fifteen more methods on this interface. The
   * two halves have nothing to say to each other — accounts answer *who is
   * asking*, prompts answer *what did they save* — and flattening them would
   * make every driver a single file that nobody reads to the end of.
   */
  readonly prompts: PromptStore;

  /**
   * Share links.
   *
   * Its own namespace rather than more methods on `prompts`, because it obeys a
   * different rule. Every `PromptStore` lookup binds an owner; `findShare`
   * deliberately does not, since an anonymous reader has no owner to be. Keeping
   * them apart is what lets "every lookup binds an owner" stay a true statement
   * about `PromptStore` instead of a mostly-true one.
   */
  readonly shares: ShareStore;

  /**
   * Reading across accounts, for the deployment overview.
   *
   * Third namespace rather than a method on `prompts`, and the split is the
   * point: `PromptStore` binds an owner in every lookup, and an exception living
   * inside it is an exception somebody adds a second one beside. Guarded by
   * `adminSource`, which refuses unless `TRAZUM_ADMINS` names the caller — and
   * that variable is empty by default.
   */
  readonly admin: AdminStore;

  /**
   * True when everything in here dies with the process.
   *
   * Surfaced rather than hidden. A memory store behind two serverless instances
   * signs people out at random, and the honest place to say so is the same
   * place that knows it — see `/api/auth/session`, which reports it to the UI.
   */
  readonly ephemeral: boolean;

  /**
   * Insert or refresh the account behind `(provider, providerId)`.
   *
   * Refresh, not insert-if-absent: a login, display name or avatar that changed
   * upstream should change here too, and the sign-in is the only moment we are
   * told about it.
   */
  upsertUser(input: NewUser, now: Date): Promise<UserRecord>;

  createSession(session: SessionRecord): Promise<void>;

  /**
   * The session and its owner, or `null` when there is no such session or it
   * has expired.
   *
   * An expired session is deleted on the way out. That covers the row somebody
   * comes back and presents; `deleteExpiredSessions` covers the ones nobody
   * ever comes back for.
   */
  findSession(tokenHash: string, now: Date): Promise<{ session: SessionRecord; user: UserRecord } | null>;

  deleteSession(tokenHash: string): Promise<void>;

  /** Drop every session belonging to a user. Sign out everywhere. */
  deleteSessionsForUser(userId: string): Promise<void>;

  /**
   * Drop every session that has expired, and say how many went.
   *
   * `findSession` only reaps the row it was handed, so a session that expires
   * and is never presented again sits in the table for ever. That is not a way
   * in: the lookup excludes anything past `expires_at`, so a dead row cannot
   * authenticate anybody. It is unbounded growth in a table whose rows are all
   * dead weight after thirty days.
   *
   * The count is returned so a test can prove the sweep happened. Nothing in
   * the app reads it and no response ever carries it.
   */
  deleteExpiredSessions(now: Date): Promise<number>;

  /**
   * Delete a user and everything that belongs to them.
   *
   * Immediate and irreversible. In Postgres the work is done by the foreign
   * keys: `trazum_sessions`, `trazum_prompts` and `trazum_shares` all reference
   * `trazum_users (id) on delete cascade`, and `trazum_prompt_versions`
   * cascades from `trazum_prompts`. The memory driver has no such machinery and
   * walks the same graph by hand, which is why the test for this runs against
   * both drivers rather than the one that is convenient.
   *
   * **Shared links go with it.** `/c/<token>` rows live in `trazum_shares` and
   * somebody's colleague may be holding one. Keeping them would mean keeping
   * the deleted person's prompt text and their denormalised `owner_login`,
   * which is not a deletion.
   *
   * Returns false when no such user existed, so a caller can tell a delete from
   * a no-op. No route ever passes that difference on to a browser.
   */
  deleteUser(userId: string): Promise<boolean>;

  /** Release connections. A no-op for the memory driver. */
  close(): Promise<void>;
}

import { MAX_SHARES_PER_OWNER, SHARE_PREVIEW_CHARS } from './shares';
import type { ShareRecord, ShareStore, ShareSummary } from './shares';

/** A preview that identifies a link without reproducing the prompt in a list. */
export function sharePreview(beforeText: string): string {
  return beforeText.replace(/\s+/g, ' ').trim().slice(0, SHARE_PREVIEW_CHARS);
}

/**
 * The in-memory shares table, and the one operation that is not a `ShareStore`
 * method.
 *
 * `purgeOwner` is returned beside the store rather than added to it because
 * `ShareStore`'s methods are the ones a request can reach, and every one of
 * them either binds an owner or is `findShare`, which is documented as the
 * deliberate exception. Deleting an account is not a request against a share;
 * it is the account table reaching in. Postgres does this with a foreign key
 * and needs no method at all, so putting one on the interface would add
 * reachable surface for a driver that does not want it.
 *
 * It takes no `now`: an expired share is still a row, and a deletion that left
 * the expired ones behind would leave the deleted person's prompt text in the
 * table. `listShares` filters by `now` and is exactly the wrong tool here.
 */
export function sharesInMemory(): { shares: ShareStore; purgeOwner(ownerId: string): number } {
  const shares = new Map<string, ShareRecord>();

  const live = (share: ShareRecord, now: Date) =>
    share.expiresAt === null || share.expiresAt.getTime() > now.getTime();

  const store: ShareStore = {
    async createShare(input): Promise<ShareRecord | null> {
      const mine = [...shares.values()].filter((s) => s.ownerId === input.ownerId);
      if (mine.length >= MAX_SHARES_PER_OWNER) return null;

      // The token is minted by the caller, not here: it is a credential, and the
      // one place that knows how to make one should be the auth module that
      // already does it for sessions.
      const record: ShareRecord = {
        token: input.token,
        ownerId: input.ownerId,
        ownerLogin: input.ownerLogin,
        beforeText: input.beforeText,
        afterText: input.afterText,
        settings: input.settings,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      };
      shares.set(record.token, record);
      return record;
    },

    async findShare(token: string, now: Date): Promise<ShareRecord | null> {
      const share = shares.get(token);
      if (!share) return null;

      // Expired is indistinguishable from absent, on purpose. "This link has
      // expired" tells a stranger the token was real, which is one bit more
      // than they had.
      if (!live(share, now)) {
        shares.delete(token);
        return null;
      }

      return { ...share };
    },

    async listShares(ownerId: string, now: Date): Promise<ShareSummary[]> {
      return [...shares.values()]
        .filter((share) => share.ownerId === ownerId && live(share, now))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((share) => ({
          token: share.token,
          createdAt: share.createdAt,
          expiresAt: share.expiresAt,
          preview: sharePreview(share.beforeText),
        }));
    },

    async revokeShare(token: string, ownerId: string): Promise<boolean> {
      const share = shares.get(token);
      if (!share || share.ownerId !== ownerId) return false;
      shares.delete(token);
      return true;
    },
  };

  return {
    shares: store,
    purgeOwner(ownerId: string): number {
      let gone = 0;
      for (const [token, share] of shares) {
        // No `now` in this condition, deliberately. An expired share is still a
        // row holding somebody's prompt text and their login.
        if (share.ownerId === ownerId) {
          shares.delete(token);
          gone += 1;
        }
      }
      return gone;
    },
  };
}

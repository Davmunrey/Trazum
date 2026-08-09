import { MAX_SHARES_PER_OWNER, SHARE_PREVIEW_CHARS } from './shares';
import type { ShareRecord, ShareStore, ShareSummary } from './shares';

/** A preview that identifies a link without reproducing the prompt in a list. */
export function sharePreview(beforeText: string): string {
  return beforeText.replace(/\s+/g, ' ').trim().slice(0, SHARE_PREVIEW_CHARS);
}

export function sharesInMemory(): ShareStore {
  const shares = new Map<string, ShareRecord>();

  const live = (share: ShareRecord, now: Date) =>
    share.expiresAt === null || share.expiresAt.getTime() > now.getTime();

  return {
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
}

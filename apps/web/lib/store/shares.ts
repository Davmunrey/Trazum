/**
 * Share links: a comparison anyone holding the URL can read.
 *
 * The security model is different from everything else in this store, and the
 * difference is the whole design. A saved prompt is *private and authenticated*
 * — the owner predicate is in every query. A share link is a **bearer
 * capability**: whoever has the URL can read it, signed in or not, because that
 * is what "send this to a colleague" means.
 *
 * That makes three things load-bearing:
 *
 * 1. **The token is the secret.** 32 bytes from the CSPRNG, and it is stored in
 *    the clear — unlike a session token, hashing it would protect nothing,
 *    because the row it points at is itself the secret. A leaked database gives
 *    up the prompts whether or not it also gives up the tokens.
 * 2. **Reading is a read.** The anonymous endpoint performs no writes at all —
 *    no view counter, no last-seen timestamp. An unauthenticated request that
 *    can cause a write is a lever, and counting views is not worth being one.
 * 3. **Links expire and can be revoked.** A capability with no way to withdraw
 *    it is a permanent publication, which is not what anyone means by "share".
 *
 * Nothing derived is stored. A share holds the two prompts and the settings, and
 * the comparison is recomputed on every view — the same reasoning as the prompt
 * library's token counts, and for the same payoff: a link opened next year is
 * priced by next year's rules rather than by a snapshot that has quietly stopped
 * being true.
 */

/** The knobs a comparison was run with. Canonicalised on write, never free-form. */
export interface ShareSettings {
  level: 'safe' | 'aggressive';
  optimizeBoth: boolean;
  disableRules: string[];
  model: string;
  callsPerMonth: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  batchEligible: boolean;
}

export interface ShareRecord {
  /** The capability. Also the primary key — there is no other id. */
  token: string;
  ownerId: string;
  /** The login of whoever created it, denormalised so a view needs one query. */
  ownerLogin: string;
  beforeText: string;
  afterText: string;
  settings: ShareSettings;
  createdAt: Date;
  /** `null` means it never expires, which has to be asked for explicitly. */
  expiresAt: Date | null;
}

/** A row in the owner's "links you have made" list. Never carries the prompts. */
export interface ShareSummary {
  token: string;
  createdAt: Date;
  expiresAt: Date | null;
  /** First line-ish of the *before* prompt, so a list is identifiable. */
  preview: string;
}

/**
 * How long a link lives.
 *
 * Thirty days by default, and the default is the argument. A link that never
 * expires is a permanent publication of a prompt, created by somebody who was
 * thinking about the next ten minutes. `never` exists because some links really
 * are meant to be permanent — but it has to be chosen.
 */
export const SHARE_TTL_DAYS = { '7': 7, '30': 30, '90': 90, never: null } as const;
export type ShareTtl = keyof typeof SHARE_TTL_DAYS;
export const DEFAULT_SHARE_TTL: ShareTtl = '30';

export const MAX_SHARES_PER_OWNER = 100;
export const SHARE_PREVIEW_CHARS = 120;

export interface ShareStore {
  /** `null` when the owner is at `MAX_SHARES_PER_OWNER`. */
  createShare(input: {
    /**
     * Minted by the caller, not by the store.
     *
     * It is a credential, and the module that already knows how to mint one —
     * the same CSPRNG helper sessions use — is the right place for it. A store
     * that invents its own would be a second implementation of the only thing
     * standing between a stranger and somebody's prompt.
     */
    token: string;
    ownerId: string;
    ownerLogin: string;
    beforeText: string;
    afterText: string;
    settings: ShareSettings;
    now: Date;
    expiresAt: Date | null;
  }): Promise<ShareRecord | null>;

  /**
   * By token, for anyone at all. Expired is the same as absent.
   *
   * The only method here that does not take an owner, and deliberately so: an
   * anonymous reader has no owner to be. That is exactly why it is a separate
   * interface from `PromptStore` rather than another method on it — so the rule
   * "every lookup binds an owner" stays true where it is supposed to be true.
   */
  findShare(token: string, now: Date): Promise<ShareRecord | null>;

  listShares(ownerId: string, now: Date): Promise<ShareSummary[]>;

  /** Scoped to the owner. Revoking somebody else's link is not a thing. */
  revokeShare(token: string, ownerId: string): Promise<boolean>;
}

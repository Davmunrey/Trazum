import type { UserRecord } from '../store/types';

/**
 * Who can see the whole deployment, and how they are named.
 *
 * There is no organisation model in Trazum and this file is the decision not to
 * invent one. A self-hosted instance *is* the team — one deployment per group of
 * people who share prompts — so "the org" is "this deployment", and an admin is
 * somebody the operator listed in `TRAZUM_ADMINS` when they started it.
 *
 * The alternative was reading GitHub organisation membership, which would mean
 * asking for the `read:org` scope on every sign-in so that a handful of
 * deployments could skip an environment variable. Sign-in asks for `read:user`
 * and nothing else, and keeping that true is worth more than the convenience.
 *
 * Empty or unset means **there is no admin dashboard**: the route 404s, the link
 * is absent, and nothing aggregates anybody's data. That is the default.
 */

export interface AdminList {
  /** GitHub numeric ids. Stable across renames. */
  ids: string[];
  /** GitHub logins, lowercased. Convenient, and see the warning below. */
  logins: string[];
  get enabled(): boolean;
}

/**
 * Parse `TRAZUM_ADMINS`: a comma-separated list of logins, numeric ids, or both.
 *
 * An all-digits entry is read as a numeric id and everything else as a login,
 * and the difference matters more than it looks.
 *
 * **A GitHub login is renameable and, once released, reusable.** An admin list
 * naming `octocat` grants this deployment's whole overview to whoever holds that
 * login *today* — which, if the original holder renamed and somebody else
 * claimed the freed name, is a stranger. A numeric id cannot be transferred, so
 * an operator who wants the list to keep meaning what it meant should use ids.
 *
 * Logins are still supported because they are what an operator actually knows,
 * and refusing them would mean the feature goes unconfigured. The hazard is
 * documented rather than designed away, and `adminSource` reports which kind
 * matched so the dashboard can say so on screen.
 */
export function adminList(env: NodeJS.ProcessEnv = process.env): AdminList {
  const raw = env.TRAZUM_ADMINS ?? '';
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const ids = entries.filter((entry) => /^\d+$/.test(entry));
  const logins = entries
    .filter((entry) => !/^\d+$/.test(entry))
    // Lowercased on both sides of the comparison: GitHub logins are
    // case-insensitive, and an operator who typed `OctoCat` meant `octocat`.
    .map((entry) => entry.toLowerCase());

  return {
    ids,
    logins,
    get enabled() {
      return ids.length > 0 || logins.length > 0;
    },
  };
}

export type AdminSource = 'id' | 'login' | null;

/**
 * Is this user an admin, and on the strength of what?
 *
 * The id is checked first, so a deployment that lists both forms for the same
 * person is reported as the stronger of the two.
 */
export function adminSource(user: UserRecord, list: AdminList): AdminSource {
  if (list.ids.includes(user.providerId)) return 'id';
  if (list.logins.includes(user.login.toLowerCase())) return 'login';
  return null;
}

export function isAdmin(user: UserRecord, list: AdminList): boolean {
  return adminSource(user, list) !== null;
}

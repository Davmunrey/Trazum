import { adminList } from '../admin/config';

/**
 * Who may sign in to this deployment.
 *
 * Until now the answer was any GitHub account at all. A deployment that
 * switched accounts on to share prompts inside a team was also a free prompt
 * store for the internet, up to the per-account caps, with the operator's
 * database paying for it. That is not a choice an operator made; it was the
 * absence of one.
 *
 * So sign-in is closed unless the operator opens it, in one of two ways:
 *
 * - `TRAZUM_ALLOWED_USERS`: GitHub logins or numeric ids, comma-separated,
 *   read by the same parser as `TRAZUM_ADMINS` and with the same warning
 *   (a login can be renamed and reclaimed; an id cannot). Admins are always
 *   allowed: an admin who could not sign in would be a list of nobody.
 * - `TRAZUM_OPEN_SIGNUP=1`: any GitHub account, said out loud.
 *
 * Checked on every sign-in, not only the first, so taking somebody off the
 * list takes effect at their next sign-in rather than never.
 */

export type SignInPolicy =
  | { open: true }
  | { open: false; ids: string[]; logins: string[] };

export function signInPolicy(env: NodeJS.ProcessEnv = process.env): SignInPolicy {
  if (env.TRAZUM_OPEN_SIGNUP?.trim() === '1') return { open: true };
  const allowed = adminList({ ...env, TRAZUM_ADMINS: env.TRAZUM_ALLOWED_USERS ?? '' });
  const admins = adminList(env);
  return {
    open: false,
    ids: [...new Set([...allowed.ids, ...admins.ids])],
    logins: [...new Set([...allowed.logins, ...admins.logins])],
  };
}

/** Nobody could sign in: closed, and no one listed. */
export function nobodyMaySignIn(policy: SignInPolicy): boolean {
  return !policy.open && policy.ids.length === 0 && policy.logins.length === 0;
}

export function maySignIn(identity: { providerId: string; login: string }, policy: SignInPolicy): boolean {
  if (policy.open) return true;
  return policy.ids.includes(identity.providerId) || policy.logins.includes(identity.login.toLowerCase());
}

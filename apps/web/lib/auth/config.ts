/**
 * Whether this deployment has accounts at all, and on whose terms.
 *
 * Accounts are opt-in. With no GitHub app configured, `authConfig` reports
 * disabled, the sign-in routes refuse, the header renders no button, and Trazum
 * is the anonymous tool it was before — which is the deployment most people
 * running it actually want.
 */

export interface AuthEnabled {
  enabled: true;
  clientId: string;
  clientSecret: string;
  /** Origin of this deployment, e.g. `https://trazum.dev`. No trailing slash. */
  publicUrl: string;
  /** Where GitHub sends the browser back. Derived, never received. */
  redirectUri: string;
  /** True when `publicUrl` is HTTPS. Decides cookie prefixes and `Secure`. */
  secure: boolean;
  /** How long a sign-in lasts, used or unused. See `sessionPolicy`. */
  session: SessionPolicy;
}

/**
 * How long a sign-in lasts.
 *
 * Two clocks, and a session ends at whichever runs out first:
 *
 * - `maxSeconds` counts from the sign-in and ignores use. However busy the
 *   session, GitHub is asked again when it runs out.
 * - `idleSeconds` counts from the last request. A browser left signed in and
 *   walked away from is signed out without anybody pressing anything.
 *
 * The defaults are thirty days and one day. Thirty days is the most OWASP ASVS
 * 4.0.3 accepts at any level (V3.3.2, level 1), so it is also the ceiling a
 * deployment can set. One day is a judgement: a session on a computer somebody
 * walked away from is dead by the next day, while signing in again costs one
 * click, because GitHub remembers having approved Trazum and does not ask
 * twice. Level 2 asks for twelve hours and thirty minutes, which is
 * `TRAZUM_SESSION_MAX_HOURS=12` and `TRAZUM_SESSION_IDLE_MINUTES=30`.
 */
export interface SessionPolicy {
  maxSeconds: number;
  idleSeconds: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  maxSeconds: 30 * 24 * 60 * 60,
  idleSeconds: 24 * 60 * 60,
};

/** Thirty days: ASVS level 1, and the most this deployment will agree to. */
const MAX_HOURS_CEILING = 30 * 24;
/** Below five minutes nobody can finish reading a bill before signing in again. */
const IDLE_MINUTES_FLOOR = 5;

/**
 * The session policy from the environment, or the reason it cannot be read.
 *
 * A value that is not a whole number in range turns sign-in off, like every
 * other variable here, rather than quietly falling back to the default. An
 * operator who set thirty minutes for an audit and mistyped it would
 * otherwise run on a day, believing they ran on thirty minutes.
 *
 * The reason names the variable and its range, never the value: it is served
 * by `/api/auth/session` to whoever asks.
 */
export function sessionPolicy(env: NodeJS.ProcessEnv = process.env): SessionPolicy | { error: string } {
  const maxRaw = env.TRAZUM_SESSION_MAX_HOURS?.trim();
  const idleRaw = env.TRAZUM_SESSION_IDLE_MINUTES?.trim();

  let maxSeconds = DEFAULT_SESSION_POLICY.maxSeconds;
  if (maxRaw) {
    const hours = /^\d+$/.test(maxRaw) ? Number(maxRaw) : NaN;
    if (!(hours >= 1 && hours <= MAX_HOURS_CEILING)) {
      return { error: `TRAZUM_SESSION_MAX_HOURS must be a whole number of hours from 1 to ${MAX_HOURS_CEILING}` };
    }
    maxSeconds = hours * 3600;
  }

  // Unset, the idle window is a day or the whole lifetime, whichever is
  // shorter, so `TRAZUM_SESSION_MAX_HOURS=12` on its own is a valid setting.
  let idleSeconds = Math.min(DEFAULT_SESSION_POLICY.idleSeconds, maxSeconds);
  if (idleRaw) {
    const minutes = /^\d+$/.test(idleRaw) ? Number(idleRaw) : NaN;
    if (!(minutes >= IDLE_MINUTES_FLOOR && minutes * 60 <= maxSeconds)) {
      return {
        error: `TRAZUM_SESSION_IDLE_MINUTES must be a whole number of minutes from ${IDLE_MINUTES_FLOOR} to the session's lifetime (${maxSeconds / 60})`,
      };
    }
    idleSeconds = minutes * 60;
  }

  return { maxSeconds, idleSeconds };
}

export interface AuthDisabled {
  enabled: false;
  /** Why, in one line, for the operator reading a log or a 503 body. */
  reason: string;
}

export type AuthConfig = AuthEnabled | AuthDisabled;

export const CALLBACK_PATH = '/api/auth/github/callback';

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const clientId = env.TRAZUM_GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.TRAZUM_GITHUB_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return {
      enabled: false,
      reason: 'set TRAZUM_GITHUB_CLIENT_ID and TRAZUM_GITHUB_CLIENT_SECRET to enable sign-in',
    };
  }

  /**
   * The deployment's own origin, from configuration only.
   *
   * Never from the `Host` or `X-Forwarded-Host` header, and this is the whole
   * reason the variable is mandatory rather than convenient. Those headers are
   * supplied by the client. A redirect URI built from one lets an attacker send
   * a victim to `/api/auth/github` with `Host: evil.example`, and the
   * authorisation code comes back to `evil.example` — a full account takeover
   * out of a value nobody thought of as input.
   *
   * GitHub's own callback allowlist would catch that particular attack. It is
   * still not something to depend on: it is one checkbox in someone else's
   * console, and every other absolute URL we build here would still be wrong.
   */
  const raw = env.TRAZUM_PUBLIC_URL?.trim();
  if (!raw) {
    return {
      enabled: false,
      reason: 'set TRAZUM_PUBLIC_URL to this deployment’s origin, e.g. https://trazum.example',
    };
  }

  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    return { enabled: false, reason: `TRAZUM_PUBLIC_URL is not a URL: ${raw}` };
  }

  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') {
    return { enabled: false, reason: `TRAZUM_PUBLIC_URL must be http or https, got ${origin.protocol}` };
  }

  const secure = origin.protocol === 'https:';
  if (!secure && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
    // Plain HTTP off the loopback means the session cookie crosses the network
    // in the clear, and every request carries it. Refusing is the only honest
    // answer: there is no configuration of this app that makes that safe.
    return {
      enabled: false,
      reason: 'TRAZUM_PUBLIC_URL must be https outside localhost; a session cookie over http is readable in transit',
    };
  }

  const session = sessionPolicy(env);
  if ('error' in session) return { enabled: false, reason: session.error };

  const publicUrl = origin.origin;
  return {
    enabled: true,
    clientId,
    clientSecret,
    publicUrl,
    redirectUri: `${publicUrl}${CALLBACK_PATH}`,
    secure,
    session,
  };
}

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

  const publicUrl = origin.origin;
  return {
    enabled: true,
    clientId,
    clientSecret,
    publicUrl,
    redirectUri: `${publicUrl}${CALLBACK_PATH}`,
    secure,
  };
}

/**
 * Endpoint validation for the pluggable LLM layer.
 *
 * Trazum lets the caller choose the URL its optional LLM pass talks to. On a
 * deployed server that is a server-side request forgery primitive: without
 * this check, anyone who can reach the web app can make it fetch the cloud
 * metadata service, an internal admin panel, or any host behind the firewall,
 * and read the response through the error message.
 *
 * This lives in the core rather than in the web route on purpose. It is the
 * most security-sensitive code in the project, so it belongs where it can be
 * unit-tested and where every caller — the API route today, anything else
 * later — gets the same answer.
 */

/**
 * Hostnames that must never be reachable from a server-side fetch.
 *
 * Written against the *hostname string* rather than a resolved address: DNS
 * resolution would be more thorough but introduces a TOCTOU window (the name
 * can resolve differently between the check and the request) and a network
 * call in a validation path. This blocks the literal forms an attacker
 * actually types; defence in depth against DNS rebinding belongs at the egress
 * layer, and is called out in SECURITY.md rather than pretended to here.
 */
const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // cloud metadata (AWS/GCP/Azure) and link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^\[?::1\]?$/,
  /^\[?::\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // IPv6 unique local
  /^\[?fe80:/i, // IPv6 link-local
  /^\[?::ffff:/i, // IPv4-mapped IPv6, e.g. ::ffff:169.254.169.254
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
  /^metadata\./i,
  /^metadata$/i,
];

/** Whether a hostname points somewhere a public service must not fetch. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export type EndpointRejection =
  | 'invalid-url'
  | 'insecure-scheme'
  | 'private-host'
  | 'credentials-in-url';

export interface ValidateEndpointOptions {
  /**
   * Allow `http:` and private hosts. For local development only — it disables
   * the entire protection, so it must never be derived from request input.
   */
  allowInsecure?: boolean;
}

/**
 * Validates an LLM endpoint URL. Returns `null` when it is safe to fetch, or a
 * machine-readable reason when it is not.
 *
 * A reason code rather than a message so the caller renders it in the reader's
 * locale, and so a test asserts on the decision rather than on wording.
 */
export function validateLlmEndpoint(
  raw: string,
  options: ValidateEndpointOptions = {},
): EndpointRejection | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid-url';
  }

  const { allowInsecure = false } = options;

  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    return 'insecure-scheme';
  }

  // Credentials in the URL would be forwarded to whatever the host turns out
  // to be, and would land in any log line that records the endpoint.
  if (url.username || url.password) {
    return 'credentials-in-url';
  }

  if (!allowInsecure && isPrivateHost(url.hostname)) {
    return 'private-host';
  }

  return null;
}

/**
 * Validates an endpoint and returns the value to fetch, with no trailing slash.
 *
 * Returning it rather than approving it is the point. The first version of this
 * validated `baseUrl` and then fetched
 * `` `${baseUrl.replace(/\/$/, '')}/chat/completions` `` — two different
 * expressions, so the thing checked was never the thing used, and a later edit
 * could have moved the check without anything noticing.
 *
 * Re-parsing normalises it too: `https://host/v1/../../admin` passes validation
 * as a string and resolves somewhere else on the wire.
 *
 * Every caller in this package that sends a key to a caller-named host goes
 * through here — both providers and the exact token counter.
 */
export function checkedEndpoint(
  baseUrl: string,
  { allowInsecure = false, name }: ValidateEndpointOptions & { name: string },
): string {
  const rejection = validateLlmEndpoint(baseUrl, { allowInsecure });
  if (rejection !== null) {
    throw new Error(
      `Provider "${name}" cannot use ${baseUrl}: ${rejection}. ` +
        'Pass allowInsecure only for an endpoint you configured yourself.',
    );
  }
  return new URL(baseUrl).toString().replace(/\/$/, '');
}

/**
 * `fetch` options that every server-side call in this package must carry.
 *
 * `redirect: 'error'` is the one that matters, and it was missing. Everything
 * above validates the URL the caller named — and then `fetch` followed
 * redirects by default, so an endpoint that passed every check could answer
 * `302 Location: http://169.254.169.254/latest/meta-data/` and the request went
 * there anyway, carrying the `authorization` header. The entire host filter was
 * one HTTP response away from being bypassed, for the CLI as much as for the
 * deployed app.
 *
 * A refused redirect is a thrown `TypeError`, which is the right outcome: a
 * legitimate LLM endpoint does not redirect its completions API, and one that
 * suddenly does is exactly the case worth failing on.
 */
export const SAFE_FETCH_INIT = {
  redirect: 'error',
  // No cookies or TLS client certs on a cross-origin call the caller named.
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
} as const satisfies RequestInit;

// --------------------------------------------------------------------------
// What a deployment is willing to be pointed at
// --------------------------------------------------------------------------

/**
 * Which LLM endpoints a server-side caller is allowed to reach.
 *
 * The web route used to take `baseUrl` out of the request body, validate the
 * string and hand it to a provider. That is server-side request forgery by
 * construction, and validating harder does not fix it:
 *
 * - Every check above reads the *name*. `https://totally-fine.example.com` that
 *   resolves to `169.254.169.254` passes all of them, and the fix for that is
 *   pinning the resolved address at the socket, which `fetch` does not offer.
 * - Even with the redirect hop closed, an anonymous caller could still aim the
 *   server at any public host and read the reply through the error body.
 *   "Public" is not the same as "fine to fetch on somebody else's behalf".
 *
 * So the request body no longer *names* an endpoint. It **selects** one the
 * operator listed, and the value that reaches the provider is the entry from
 * the list — never the string that arrived over HTTP. The default is an empty
 * list, so a deployment that has not thought about this cannot be pointed
 * anywhere at all.
 *
 * Nobody loses the capability: an operator running Trazum for themselves puts
 * the endpoint in `TRAZUM_LLM_BASE_URL` and it is used directly, exactly as the
 * CLI has always worked. This is only about who is allowed to choose.
 *
 * `env` is a parameter rather than a read of `process.env` because this module
 * is on the browser-safe path.
 */
const ALLOWLIST_VAR = 'TRAZUM_ALLOWED_LLM_ENDPOINTS';

/** Normalised, so a trailing slash or a capitalised host is not a mismatch. */
function normaliseEndpoint(raw: string): string | null {
  try {
    return new URL(raw.trim()).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * The endpoints this server will call, from `TRAZUM_ALLOWED_LLM_ENDPOINTS`
 * (comma-separated).
 *
 * An entry that would fail `validateLlmEndpoint` is dropped rather than
 * honoured. The operator is trusted to choose, not to be immune from pasting
 * `http://169.254.169.254` into a list that then serves every anonymous caller.
 * `allowInsecure` is deliberately not offered: an endpoint only reachable with
 * the protection off has no business being selectable over HTTP.
 */
export function allowedEndpoints(env: Record<string, string | undefined>): readonly string[] {
  const raw = env[ALLOWLIST_VAR];
  if (!raw) return [];

  const listed = new Set<string>();
  for (const part of raw.split(',')) {
    const url = normaliseEndpoint(part);
    if (url === null) continue;
    if (validateLlmEndpoint(url) !== null) continue;
    listed.add(url);
  }
  return [...listed];
}

/**
 * Resolves what a caller asked for to an entry on the list.
 *
 * Returns the **listed** value, not the requested one. That distinction is the
 * entire function: the string from the request is compared and then discarded,
 * so nothing derived from it reaches `fetch`.
 */
export function resolveEndpoint(requested: string, allowed: readonly string[]): string | null {
  const wanted = normaliseEndpoint(requested);
  if (wanted === null) return null;
  return allowed.find((entry) => entry.toLowerCase() === wanted.toLowerCase()) ?? null;
}

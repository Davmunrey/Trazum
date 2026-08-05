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

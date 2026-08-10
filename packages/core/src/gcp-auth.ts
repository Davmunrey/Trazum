/**
 * A Google service-account access token, without the SDK.
 *
 * Vertex will not take an API key. It wants an OAuth access token, and the only
 * way to get one unattended is the two-legged flow: build a JWT, sign it with
 * the service account's private key, and trade it at the token endpoint.
 * `google-auth-library` is ninety-odd packages to do that; this library has zero
 * runtime dependencies and a test that fails the build if one appears, because
 * every dependency is somebody else's code reading your prompts.
 *
 * WebCrypto rather than `node:crypto`, so the browser-safe entry point stays
 * browser-safe. `RSASSA-PKCS1-v1_5` with SHA-256 is what Google calls RS256.
 */

/** Base64url, no padding — what a JWT uses and what `btoa` does not produce. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encoder = new TextEncoder();

const encodeJson = (value: unknown): string => base64url(encoder.encode(JSON.stringify(value)));

/**
 * PEM to the DER bytes `importKey` wants.
 *
 * The header, the footer and every newline come out. A PEM that still has them
 * fails inside WebCrypto with `DataError`, which says nothing about which of the
 * fourteen things that can be wrong with a key is wrong with this one.
 */
export function pkcs8FromPem(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('The service account private key is empty.');

  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new Error('The service account private key is not valid base64.');
  }
  // Returned as an ArrayBuffer rather than a view: `importKey` accepts a
  // `BufferSource`, and a `Uint8Array` over a `SharedArrayBuffer` is not one
  // as far as the type checker is concerned.
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * The assertion Google trades for a token.
 *
 * Exported so a test can read it: this is the document where a wrong `aud`, a
 * clock an hour out, or a scope nobody granted turns into `invalid_grant`, an
 * error message that names none of the three.
 */
export async function signedJwt(
  account: ServiceAccount,
  scope: string,
  now: Date,
): Promise<string> {
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const issued = Math.floor(now.getTime() / 1000);

  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claims = encodeJson({
    iss: account.client_email,
    scope,
    aud: tokenUri,
    iat: issued,
    // An hour is Google's maximum. Longer is rejected outright rather than
    // clamped, which is a confusing way to learn about a limit.
    exp: issued + 3600,
  });

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromPem(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(`${header}.${claims}`),
  );

  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}

export interface CachedToken {
  token: string;
  /** Epoch seconds. */
  expiresAt: number;
}

/**
 * Trades the assertion for an access token, caching until shortly before expiry.
 *
 * The cache is the point. A token lasts an hour and `optimize --suggest` over a
 * directory makes one call per prompt: fetching a token each time turns forty
 * prompts into eighty requests, half of them to an endpoint that rate-limits.
 *
 * Sixty seconds of margin, because a token that expires in flight fails the
 * request it was fetched for, and the clock here is not the clock there.
 */
export async function accessToken(
  account: ServiceAccount,
  options: {
    scope?: string;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    cache?: { current: CachedToken | null };
  } = {},
): Promise<string> {
  const {
    scope = 'https://www.googleapis.com/auth/cloud-platform',
    fetchImpl = fetch,
    now = () => new Date(),
    cache,
  } = options;

  const at = now();
  const seconds = Math.floor(at.getTime() / 1000);

  if (cache?.current && cache.current.expiresAt - 60 > seconds) {
    return cache.current.token;
  }

  const assertion = await signedJwt(account, scope, at);
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';

  const res = await fetchImpl(tokenUri, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Google refused the service account assertion (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Google returned no access_token for the service account.');
  }

  const lifetime = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  if (cache) cache.current = { token: data.access_token, expiresAt: seconds + lifetime };

  return data.access_token;
}

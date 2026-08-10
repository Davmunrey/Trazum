/**
 * AWS Signature Version 4, by hand.
 *
 * **Why by hand.** `@trazum/core` has zero runtime dependencies and a test that
 * fails the build if one appears. That is a security property rather than a
 * packaging preference: this library reads people's prompts, and every
 * dependency is somebody else's code reading them too. The AWS SDK is roughly
 * a hundred packages to sign one request.
 *
 * **WebCrypto, not `node:crypto`.** The browser-safe entry point cannot reach a
 * Node builtin — `apps/web` bundles this library, and a single `node:` import
 * anywhere in that graph fails the build. `crypto.subtle` exists in both, so
 * signing works in a browser and in the CLI without a second implementation.
 * Everything here is therefore async, which HMAC-SHA256 does not need to be and
 * `crypto.subtle` insists on anyway.
 *
 * **What is not asserted, and it matters.** There is no AWS-published
 * known-answer vector in the tests. This environment cannot reach the internet
 * to fetch one and cannot reach AWS to try a real call, so the tests check the
 * canonical strings this builds — which are derivable from the specification by
 * reading — plus the cryptographic properties that any correct signer has. A
 * systematically wrong canonicalisation that is wrong *consistently* would pass
 * all of them. The first real request against Bedrock is the proof, and until
 * somebody makes one this is careful code rather than verified code.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', imported, encoder.encode(message));
}

/**
 * `20260810T140102Z` and `20260810`, from one instant.
 *
 * Both derive from the same `Date` rather than being formatted twice. The
 * classic SigV4 bug is a request signed at 23:59:59.9 whose date stamp comes
 * from the next day: the credential scope and the timestamp disagree by one
 * day, AWS rejects it, and it happens roughly once per thousand requests at
 * midnight UTC and never in a test.
 */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '')}`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * The signing key: four chained HMACs, each keyed by the last.
 *
 * The chain is what scopes a signature to one day, one region and one service,
 * so a leaked signature is not a leaked credential. `AWS4` prefixes the secret
 * and is part of the specification rather than decoration.
 */
export async function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export interface SignInput {
  method: string;
  /** Already-encoded path, e.g. `/model/anthropic.claude-v2/invoke`. */
  path: string;
  host: string;
  region: string;
  service: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Present for temporary credentials, and signed when it is. */
  sessionToken?: string;
  now: Date;
}

/**
 * The headers a signed request carries.
 *
 * Returned rather than mutated onto a request, so this is a pure function of its
 * input and a test can read every byte of what it produced.
 */
export interface SignedHeaders {
  authorization: string;
  'x-amz-date': string;
  'x-amz-content-sha256': string;
  'x-amz-security-token'?: string;
}

/**
 * Builds the canonical request, exactly as the specification orders it.
 *
 * Exported for the tests, because this string is where a signer goes wrong.
 * Every field is joined with a newline, headers are lowercased and sorted, and
 * the trailing newline after the header block is required — omit it and every
 * signature is wrong in a way whose only symptom is `403 SignatureDoesNotMatch`.
 */
export async function canonicalRequest(input: SignInput): Promise<{
  canonical: string;
  signedHeaderNames: string;
  payloadHash: string;
}> {
  const { amzDate } = amzDates(input.now);
  const payloadHash = await sha256Hex(input.body);

  // `host` and the two `x-amz-` headers are what Bedrock requires signed. Sorted
  // by name because the specification says sorted, not because it looks tidier.
  const headers: Array<[string, string]> = [
    ['host', input.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ];
  if (input.sessionToken) headers.push(['x-amz-security-token', input.sessionToken]);
  headers.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const canonicalHeaders = headers.map(([name, value]) => `${name}:${value.trim()}\n`).join('');
  const signedHeaderNames = headers.map(([name]) => name).join(';');

  const canonical = [
    input.method,
    input.path,
    // No query string on any request this signs. Present and empty, because the
    // field is positional: dropping it shifts everything below it up a line.
    '',
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');

  return { canonical, signedHeaderNames, payloadHash };
}

/** The full `Authorization` header value, and the headers that go with it. */
export async function signRequest(input: SignInput): Promise<SignedHeaders> {
  const { amzDate, dateStamp } = amzDates(input.now);
  const { canonical, signedHeaderNames, payloadHash } = await canonicalRequest(input);

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonical)].join('\n');

  const key = await signingKey(input.secretAccessKey, dateStamp, input.region, input.service);
  const signature = hex(await hmac(key, stringToSign));

  const headers: SignedHeaders = {
    authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken;
  return headers;
}

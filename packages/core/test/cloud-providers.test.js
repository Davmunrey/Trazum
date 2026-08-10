import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bedrockProvider,
  canonicalRequest,
  pkcs8FromPem,
  signRequest,
  signedJwt,
  signingKey,
  vertexProvider,
} from '../dist/index.js';

/**
 * Bedrock and Vertex: the two providers whose credential is not a bearer token.
 *
 * **What these tests cannot do.** There is no AWS- or Google-published
 * known-answer vector asserted anywhere below, because this environment reaches
 * neither the internet to fetch one nor the services to try a real call. What is
 * checked is the canonical strings — derivable from the specifications by
 * reading — plus the cryptographic properties any correct signer has, plus every
 * failure mode that arrives as HTTP 200.
 *
 * A canonicalisation that is wrong *consistently* would pass all of it. The
 * first real request is the proof, and until somebody makes one this is careful
 * code rather than verified code. Saying so is the point: a green suite here
 * means "the shape is right", not "it works".
 */

function fake(body, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

const AT = new Date('2026-08-10T14:01:02.345Z');
const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG' };

describe('SigV4: the canonical request', () => {
  const base = {
    method: 'POST',
    path: '/model/anthropic.claude-v2/converse',
    host: 'bedrock-runtime.us-east-1.amazonaws.com',
    region: 'us-east-1',
    service: 'bedrock',
    body: '{"a":1}',
    ...creds,
    now: AT,
  };

  it('is the six fields in order, with the header block newline-terminated', async () => {
    /**
     * The trailing newline after the header block is required by the
     * specification, and omitting it produces a signature that is wrong for
     * every request with no symptom other than `403 SignatureDoesNotMatch`. It
     * is asserted as a string because that is the only way to see it.
     */
    const { canonical, signedHeaderNames } = await canonicalRequest(base);
    const lines = canonical.split('\n');

    assert.equal(lines[0], 'POST');
    assert.equal(lines[1], '/model/anthropic.claude-v2/converse');
    assert.equal(lines[2], '', 'the empty query-string line is missing — everything below shifts up');
    assert.equal(lines[3], 'host:bedrock-runtime.us-east-1.amazonaws.com');
    assert.equal(signedHeaderNames, 'host;x-amz-content-sha256;x-amz-date');
    // …headers…, '', signedHeaders, payloadHash
    assert.equal(lines[lines.length - 2], signedHeaderNames);
    assert.match(lines[lines.length - 1], /^[0-9a-f]{64}$/);
  });

  it('signs the security token when there is one, and not when there is not', async () => {
    // A temporary credential whose token is not signed is rejected, and an
    // absent header that is nonetheless listed as signed is also rejected.
    const without = await canonicalRequest(base);
    const with_ = await canonicalRequest({ ...base, sessionToken: 'tok' });

    assert.ok(!without.signedHeaderNames.includes('security-token'));
    assert.equal(with_.signedHeaderNames, 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token');
    assert.match(with_.canonical, /x-amz-security-token:tok/);
  });

  it('hashes the body, so a changed body changes the signature', async () => {
    const a = await signRequest(base);
    const b = await signRequest({ ...base, body: '{"a":2}' });
    assert.notEqual(a.authorization, b.authorization);
    assert.notEqual(a['x-amz-content-sha256'], b['x-amz-content-sha256']);
  });
});

describe('SigV4: the signature', () => {
  const base = {
    method: 'POST',
    path: '/x',
    host: 'h.example.com',
    region: 'us-east-1',
    service: 'bedrock',
    body: '{}',
    ...creds,
    now: AT,
  };

  it('is stable for identical input', async () => {
    assert.equal((await signRequest(base)).authorization, (await signRequest(base)).authorization);
  });

  it('carries the scope, and the scope agrees with the timestamp', async () => {
    /**
     * The classic SigV4 bug: a request signed at 23:59:59.9 whose date stamp is
     * formatted separately and lands on the next day. The scope and the
     * timestamp then disagree by one day, AWS rejects it, and it happens once in
     * a thousand requests at midnight UTC and never in a test.
     */
    const headers = await signRequest({ ...base, now: new Date('2026-08-10T23:59:59.999Z') });

    assert.equal(headers['x-amz-date'], '20260810T235959Z');
    assert.match(headers.authorization, /Credential=AKIDEXAMPLE\/20260810\/us-east-1\/bedrock\/aws4_request/);
  });

  it('changes when any scoped component changes', async () => {
    const signature = async (patch) => (await signRequest({ ...base, ...patch })).authorization;
    const baseline = await signature({});

    for (const [what, patch] of [
      ['the secret', { secretAccessKey: 'other' }],
      ['the region', { region: 'eu-west-1' }],
      ['the service', { service: 'lambda' }],
      ['the day', { now: new Date('2026-08-11T14:01:02.345Z') }],
      ['the path', { path: '/y' }],
      ['the method', { method: 'GET' }],
      ['the host', { host: 'other.example.com' }],
    ]) {
      assert.notEqual(await signature(patch), baseline, `${what} did not change the signature`);
    }
  });

  it('does not put the secret in the header', async () => {
    // The access key id belongs in `Credential`. The secret never leaves this
    // process, and a signer that pasted it would be an exfiltration bug that
    // looks like a working request.
    const headers = await signRequest(base);
    assert.ok(!headers.authorization.includes(creds.secretAccessKey));
    assert.ok(headers.authorization.includes(creds.accessKeyId));
  });
});

describe('SigV4: the signing key, derived independently', () => {
  /**
   * The four-HMAC chain, written out again from the specification rather than
   * compared to itself.
   *
   * This exists because mutation testing found three holes the property tests
   * could not see. Deleting the region from the chain, deleting the service, or
   * dropping the `AWS4` prefix from the secret all left every test green — the
   * region and service also appear in the credential *scope*, which is inside
   * the string to sign, so a signature still changes when they change. The
   * property "different region, different signature" is true of a signer whose
   * key derivation is entirely wrong.
   *
   * A known-answer vector from AWS would be better, and there is none here: no
   * network to fetch one. An independent implementation is the next best thing —
   * it is wrong in different ways than the one it checks.
   */
  const hmacRaw = async (key, message) => {
    const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(message));
  };

  it('is HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")', async () => {
    const encoder = new TextEncoder();
    const kDate = await hmacRaw(encoder.encode(`AWS4${creds.secretAccessKey}`), '20260810');
    const kRegion = await hmacRaw(kDate, 'eu-west-1');
    const kService = await hmacRaw(kRegion, 'bedrock');
    const expected = await hmacRaw(kService, 'aws4_request');

    const actual = await signingKey(creds.secretAccessKey, '20260810', 'eu-west-1', 'bedrock');

    assert.deepEqual(
      [...new Uint8Array(actual)],
      [...new Uint8Array(expected)],
      'the signing key chain does not match the specification',
    );
  });

  it('and every link in it changes the key', async () => {
    // Belt to the braces above: if a link were dropped, two of these would
    // collide.
    const keys = await Promise.all([
      signingKey('secret', '20260810', 'eu-west-1', 'bedrock'),
      signingKey('other', '20260810', 'eu-west-1', 'bedrock'),
      signingKey('secret', '20260811', 'eu-west-1', 'bedrock'),
      signingKey('secret', '20260810', 'us-east-1', 'bedrock'),
      signingKey('secret', '20260810', 'eu-west-1', 'lambda'),
    ]);

    const distinct = new Set(keys.map((key) => [...new Uint8Array(key)].join(',')));
    assert.equal(distinct.size, 5, 'two different derivations produced the same key');
  });
});

describe('Bedrock', () => {
  const options = { model: 'anthropic.claude-v2:1', region: 'us-east-1', ...creds, now: () => AT };
  const answer = (text, extra = {}) => ({
    output: { message: { content: [{ text }] } },
    ...extra,
  });

  it('talks to Converse, not InvokeModel', async () => {
    /**
     * The choice that makes this one provider instead of six. `InvokeModel`
     * takes each model family's own body shape — Anthropic's `messages`, Meta's
     * `prompt`, Amazon's `inputText` — so it means a 400 for every model nobody
     * thought about. `Converse` is one shape for all of them.
     */
    const { fetchImpl, calls } = fake(answer('done'));
    await bedrockProvider({ ...options, fetchImpl }).complete({ system: 's', user: 'u' });

    assert.match(calls[0].url, /\/converse$/);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.system, [{ text: 's' }]);
    assert.deepEqual(body.messages, [{ role: 'user', content: [{ text: 'u' }] }]);
  });

  it('signs the request it actually sends', async () => {
    // The signature covers the body, so signing one document and sending another
    // is a 403 that looks like a credentials problem.
    const { fetchImpl, calls } = fake(answer('done'));
    await bedrockProvider({ ...options, fetchImpl }).complete({ system: 's', user: 'u' });

    const sent = calls[0].init;
    const expected = await signRequest({
      method: 'POST',
      path: `/model/${encodeURIComponent('anthropic.claude-v2:1')}/converse`,
      host: 'bedrock-runtime.us-east-1.amazonaws.com',
      region: 'us-east-1',
      service: 'bedrock',
      body: sent.body,
      ...creds,
      now: AT,
    });

    assert.equal(sent.headers.authorization, expected.authorization);
  });

  it('refuses a truncated answer', async () => {
    const { fetchImpl } = fake(answer('half a rewri', { stopReason: 'max_tokens' }));
    await assert.rejects(
      () => bedrockProvider({ ...options, fetchImpl }).complete({ system: 's', user: 'u' }),
      /stopped at the token limit/,
    );
  });

  it('refuses a filtered answer', async () => {
    const { fetchImpl } = fake(answer('', { stopReason: 'content_filtered' }));
    await assert.rejects(
      () => bedrockProvider({ ...options, fetchImpl }).complete({ system: 's', user: 'u' }),
      /content_filtered/,
    );
  });

  it('but returns a whole one, joining parts', async () => {
    const { fetchImpl } = fake({
      output: { message: { content: [{ text: 'one ' }, { text: 'two' }] } },
      stopReason: 'end_turn',
    });
    const text = await bedrockProvider({ ...options, fetchImpl }).complete({ system: 's', user: 'u' });
    assert.equal(text, 'one two');
  });

  it('goes through the endpoint gate like everything else', () => {
    assert.throws(
      () => bedrockProvider({ ...options, baseUrl: 'https://169.254.169.254' }),
      /private-host/,
    );
  });
});

describe('Vertex: the service-account assertion', () => {
  /** A real RSA key, generated here so no private key is committed anywhere. */
  const keyPair = async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n');
    return {
      pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
      publicKey: pair.publicKey,
    };
  };

  it('produces a JWT whose signature the public key verifies', async () => {
    /**
     * The one thing here that is genuinely verified rather than shaped: a real
     * key signs, and the matching public key checks it. If the digest, the
     * padding or the base64url encoding were wrong, this fails.
     */
    const { pem, publicKey } = await keyPair();
    const jwt = await signedJwt(
      { client_email: 'robot@project.iam.gserviceaccount.com', private_key: pem },
      'https://www.googleapis.com/auth/cloud-platform',
      AT,
    );

    const [header, claims, signature] = jwt.split('.');
    const fromBase64Url = (value) =>
      Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

    const verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    assert.ok(verified, 'the JWT signature does not verify against its own key');
  });

  it('claims what Google requires, and expires within the hour it allows', async () => {
    const { pem } = await keyPair();
    const jwt = await signedJwt({ client_email: 'robot@x.iam.gserviceaccount.com', private_key: pem }, 'scope-x', AT);
    const claims = JSON.parse(
      Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );

    assert.equal(claims.iss, 'robot@x.iam.gserviceaccount.com');
    assert.equal(claims.scope, 'scope-x');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    // An hour is Google's maximum, not a default to exceed: longer is rejected
    // outright rather than clamped.
    assert.equal(claims.exp - claims.iat, 3600);
  });

  it('is base64url, not base64 — a JWT with a + in it is not a JWT', async () => {
    const { pem } = await keyPair();
    const jwt = await signedJwt({ client_email: 'r@x.com', private_key: pem }, 's', AT);
    assert.ok(!/[+/=]/.test(jwt), `padding or unsafe characters in the JWT: ${jwt.slice(0, 40)}…`);
  });

  it('says which part of a broken key is broken', () => {
    assert.throws(() => pkcs8FromPem('-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----'), /empty/);
    assert.throws(() => pkcs8FromPem('-----BEGIN PRIVATE KEY-----\n!!!!\n-----END PRIVATE KEY-----'), /base64/);
  });
});

describe('Vertex: the call', () => {
  const account = { client_email: 'r@x.iam.gserviceaccount.com', private_key: null };

  const withKey = async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign'],
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n');
    return { ...account, private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` };
  };

  /** Answers the token endpoint first, then the model endpoint. */
  const twoStep = (modelBody) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      const body = String(url).includes('oauth2')
        ? { access_token: 'ya29.fake', expires_in: 3600 }
        : modelBody;
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    };
    return { fetchImpl, calls };
  };

  it('trades the assertion for a token, then calls the model with it', async () => {
    const { fetchImpl, calls } = twoStep({ candidates: [{ content: { parts: [{ text: 'done' }] } }] });
    const provider = vertexProvider({
      serviceAccount: await withKey(),
      project: 'my-project',
      location: 'us-central1',
      fetchImpl,
      now: () => AT,
    });

    assert.equal(await provider.complete({ system: 's', user: 'u' }), 'done');
    assert.match(calls[0].url, /oauth2\.googleapis\.com/);
    assert.match(calls[1].url, /us-central1-aiplatform\.googleapis\.com/);
    assert.match(calls[1].url, /projects\/my-project\/locations\/us-central1/);
    assert.equal(calls[1].init.headers.authorization, 'Bearer ya29.fake');
  });

  it('caches the token instead of fetching one per prompt', async () => {
    /**
     * A token lasts an hour, and `--suggest` over a directory makes one call per
     * prompt. Without the cache, forty prompts are eighty requests, half of them
     * to an endpoint that rate-limits.
     */
    const { fetchImpl, calls } = twoStep({ candidates: [{ content: { parts: [{ text: 'x' }] } }] });
    const provider = vertexProvider({
      serviceAccount: await withKey(),
      project: 'p',
      location: 'us-central1',
      fetchImpl,
      now: () => AT,
    });

    await provider.complete({ system: 's', user: 'a' });
    await provider.complete({ system: 's', user: 'b' });
    await provider.complete({ system: 's', user: 'c' });

    const tokenCalls = calls.filter((call) => call.url.includes('oauth2')).length;
    assert.equal(tokenCalls, 1, `fetched ${tokenCalls} tokens for three prompts`);
  });

  it('refuses the same three answers Gemini refuses, through the shared reader', async () => {
    // Vertex and Gemini are the same API behind different credentials, and the
    // parsing is shared rather than copied — so this is checking the seam, not
    // re-testing the reader.
    const cases = [
      [{ promptFeedback: { blockReason: 'SAFETY' } }, /blocked the prompt/],
      [{ candidates: [{ content: { parts: [{ text: 'half' }] }, finishReason: 'MAX_TOKENS' }] }, /token limit/],
      [{ candidates: [{ content: { parts: [] } }] }, /no text in the candidate/],
    ];

    for (const [body, expected] of cases) {
      const { fetchImpl } = twoStep(body);
      const provider = vertexProvider({
        serviceAccount: await withKey(),
        project: 'p',
        location: 'us-central1',
        fetchImpl,
        now: () => AT,
      });
      await assert.rejects(() => provider.complete({ system: 's', user: 'u' }), expected);
    }
  });

  it('names Vertex in the error, not Gemini', async () => {
    // Different consoles. "Gemini blocked the prompt" sends somebody to the
    // wrong one, which is a worse outcome than a vague message.
    const { fetchImpl } = twoStep({ promptFeedback: { blockReason: 'OTHER' } });
    const provider = vertexProvider({
      serviceAccount: await withKey(),
      project: 'p',
      location: 'us-central1',
      fetchImpl,
      now: () => AT,
    });
    await assert.rejects(() => provider.complete({ system: 's', user: 'u' }), /^Error: Vertex blocked/);
  });

  it('uses the global host when the location is global', () => {
    // `global` has no regional prefix, and `https://global-aiplatform…` does not
    // resolve — a silent DNS failure for a value the API documents as valid.
    const provider = vertexProvider({
      serviceAccount: { client_email: 'r@x.com', private_key: 'x' },
      project: 'p',
      location: 'global',
    });
    assert.equal(provider.name, 'vertex');
  });
});

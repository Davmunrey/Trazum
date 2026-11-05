import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * Rate limits counted across instances: the sign-in, session and library
 * limits, which guard what every instance shares.
 *
 * The questions that decide whether this is a shared limit or a decoration:
 *
 * - Do two instances, each under the limit, get refused together once their
 *   sum is over it? (A per-instance count never does.)
 * - Does the database ever see an address? (It must not.)
 * - When the shared count fails, does sign-in fail with it? (It must not.)
 * - Does a flood against one instance still cost a database write per request?
 */

register('./helpers/loader.mjs', import.meta.url);

let shared;
let memoryStore;

before(async () => {
  shared = await import('../lib/shared-limit.ts');
  ({ memoryStore } = await import('../lib/store/memory.ts'));
});

const SECRET = 'github-client-secret';
const T0 = Date.UTC(2026, 10, 5, 12, 0, 0);
const from = (address) => new Request('https://trazum.example/api/auth/github', { headers: { 'x-forwarded-for': address } });

/** A store whose counters every limiter built on it shares, as Postgres's are. */
function sharedStore() {
  const store = { ...memoryStore(), ephemeral: false };
  const calls = { hit: [], sweep: 0 };
  const { hit, sweep } = store.limits;
  store.limits = {
    hit: async (bucket, ...rest) => {
      calls.hit.push(bucket);
      return hit(bucket, ...rest);
    },
    sweep: async (now) => {
      calls.sweep += 1;
      return sweep(now);
    },
  };
  return { store, calls };
}

function limiter(store, { name = 'auth', max = 30, secret = SECRET, warn = () => {} } = {}) {
  return shared.createSharedRateLimiter(name, { windowMs: 60_000, max }, {
    store: async () => store,
    secret: () => secret,
    warn,
  });
}

async function refusals(limit, address, count, at = T0) {
  let refused = 0;
  for (let i = 0; i < count; i += 1) if (await limit(from(address), at)) refused += 1;
  return refused;
}

// ---------------------------------------------------------------------------

describe('one limit, counted across instances', () => {
  it('refuses two instances together once their sum passes the limit', async () => {
    const { store } = sharedStore();
    const a = limiter(store);
    const b = limiter(store);
    assert.equal(await refusals(a, '203.0.113.7', 20), 0);
    // Alone, instance B is at 20 of 30 and would let all of these through.
    assert.equal(await refusals(b, '203.0.113.7', 20), 10, 'the instances counted alone');
  });

  it('gives each address, and each limit, its own budget', async () => {
    const { store } = sharedStore();
    const auth = limiter(store);
    const session = limiter(store, { name: 'session' });
    assert.equal(await refusals(auth, '203.0.113.7', 30), 0);
    assert.equal(await refusals(auth, '203.0.113.8', 30), 0, 'another address spent this one’s budget');
    assert.equal(await refusals(session, '203.0.113.7', 30), 0, 'another limit spent this one’s budget');
    assert.equal(await refusals(auth, '203.0.113.7', 1), 1);
  });

  it('starts again in the next window', async () => {
    const { store } = sharedStore();
    const a = limiter(store);
    const b = limiter(store);
    await refusals(a, '203.0.113.7', 20);
    assert.equal(await refusals(b, '203.0.113.7', 15), 5);
    assert.equal(await refusals(b, '203.0.113.7', 15, T0 + 60_000), 0, 'the old window still counted');
  });

  it('counts by the clock’s minute, so instances agree on the window whenever requests arrive in it', async () => {
    const { store } = sharedStore();
    const a = limiter(store);
    const b = limiter(store);
    for (let i = 0; i < 20; i += 1) await a(from('203.0.113.7'), T0 + 1_000 + i * 1_000);
    let refused = 0;
    for (let i = 0; i < 15; i += 1) if (await b(from('203.0.113.7'), T0 + 30_000 + i * 1_000)) refused += 1;
    assert.equal(refused, 5, 'requests a second apart were counted in windows of their own');

    // Two seconds apart, but either side of the minute: two windows.
    assert.equal(await b(from('203.0.113.9'), T0 + 59_000), false);
    for (let i = 0; i < 30; i += 1) await a(from('203.0.113.9'), T0 + 61_000);
    assert.equal(await b(from('203.0.113.9'), T0 + 61_000), true);
    assert.equal(await b(from('203.0.113.9'), T0 + 59_500), false, 'the minute before was charged for the minute after');
  });

  it('sweeps ended windows at most once a window, not on every request', async () => {
    const { store, calls } = sharedStore();
    const a = limiter(store);
    for (let i = 0; i < 25; i += 1) await a(from(`198.51.100.${i}`), T0 + i * 1000);
    assert.equal(calls.sweep, 1);
    await a(from('198.51.100.1'), T0 + 60_000);
    assert.equal(calls.sweep, 2);
  });
});

// ---------------------------------------------------------------------------

describe('what the database is told', () => {
  it('a keyed hash of the address under the limit’s name, never the address', async () => {
    const { store, calls } = sharedStore();
    await limiter(store)(from('203.0.113.7'), T0);
    await limiter(store)(from('203.0.113.7'), T0);
    await limiter(store, { secret: 'another-deployment' })(from('203.0.113.7'), T0);

    const [first, second, other] = calls.hit;
    assert.match(first, /^auth:[A-Za-z0-9_-]{43}$/);
    assert.ok(!first.includes('203.0.113.7'));
    assert.equal(second, first, 'the same address must land in the same bucket');
    assert.notEqual(other, first, 'two deployments must not share a hash');
  });

  it('is keyed, so hashing every address does not recover one', () => {
    const plain = createHash('sha256').update('203.0.113.7').digest('base64url');
    const keyed = shared.addressKey(SECRET, '203.0.113.7');
    assert.notEqual(keyed, plain);
    // Nor is the key the secret itself: it is derived, so an HMAC under the
    // raw secret is a different value.
    assert.notEqual(keyed, createHmac('sha256', SECRET).update('203.0.113.7').digest('base64url'));
    assert.equal(keyed, shared.addressKey(SECRET, '203.0.113.7'));
    assert.notEqual(keyed, shared.addressKey(SECRET, '203.0.113.8'));
  });

  it('nothing at all once this instance alone is over the limit', async () => {
    const { store, calls } = sharedStore();
    const a = limiter(store);
    assert.equal(await refusals(a, '203.0.113.7', 100), 70);
    assert.equal(calls.hit.length, 30, 'a flood on one instance cost a write per request');
  });
});

// ---------------------------------------------------------------------------

describe('when it cannot share, it counts alone', () => {
  it('without a secret to key the hashes, the database is never asked', async () => {
    const { store, calls } = sharedStore();
    const a = limiter(store, { secret: null });
    const b = limiter(store, { secret: null });
    assert.equal(await refusals(a, '203.0.113.7', 30), 0);
    assert.equal(await refusals(b, '203.0.113.7', 30), 0);
    assert.equal(calls.hit.length, 0);
  });

  it('with a store in memory, which is this process anyway', async () => {
    const store = memoryStore();
    let hits = 0;
    const { hit } = store.limits;
    store.limits = { ...store.limits, hit: async (...args) => ((hits += 1), hit(...args)) };
    assert.equal(await refusals(limiter(store), '203.0.113.7', 31), 1);
    assert.equal(hits, 0);
  });

  it('when the count fails, lets the request through, says so once, and still limits this instance', async () => {
    const { store } = sharedStore();
    store.limits.hit = async () => {
      throw new Error('relation "trazum_rate_limits" does not exist');
    };
    const warnings = [];
    const a = limiter(store, { warn: (message) => warnings.push(message) });

    assert.equal(await refusals(a, '203.0.113.7', 30), 0, 'a failed count refused somebody');
    assert.equal(await refusals(a, '203.0.113.7', 5), 5, 'the instance’s own limit stopped working');
    assert.equal(warnings.length, 1, 'the fallback was announced more than once, or never');
    assert.match(warnings[0], /auth rate limit/);
    assert.match(warnings[0], /004_rate_limits\.sql/);
  });

  it('when the store itself cannot be reached', async () => {
    const warnings = [];
    const a = shared.createSharedRateLimiter('auth', { windowMs: 60_000, max: 30 }, {
      store: async () => {
        throw new Error('connect ECONNREFUSED');
      },
      secret: () => SECRET,
      warn: (message) => warnings.push(message),
    });
    assert.equal(await refusals(a, '203.0.113.7', 30), 0);
    assert.equal(warnings.length, 1);
  });

  it('when a sweep fails, the request is still counted', async () => {
    const { store, calls } = sharedStore();
    store.limits.sweep = async () => {
      throw new Error('statement timeout');
    };
    const a = limiter(store);
    assert.equal(await refusals(a, '203.0.113.7', 3), 0);
    assert.equal(calls.hit.length, 3);
  });
});

// ---------------------------------------------------------------------------

describe('which limits are shared', () => {
  it('sign-in, session and library; the anonymous tool routes stay per instance', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

    assert.match(read('lib/auth/routes.ts'), /authRateLimited = createSharedRateLimiter\('auth'/);
    assert.match(read('lib/auth/routes.ts'), /sessionRateLimited = createSharedRateLimiter\('session'/);
    assert.match(read('lib/prompts/api.ts'), /libraryRateLimited = createSharedRateLimiter\('library'/);
    // They guard the CPU of the instance that runs them, which is counted
    // correctly per instance, and they never otherwise touch a database.
    for (const route of ['app/api/optimize/route.ts', 'app/api/compare/route.ts', 'app/api/write/route.ts']) {
      assert.ok(!read(route).includes('createSharedRateLimiter'), route);
    }
  });
});

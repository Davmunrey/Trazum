import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { postComment } from '../post-comment.mjs';

/**
 * The comment poster, driven in-process with a fake `fetch`.
 *
 * No socket, deliberately. A real HTTP round trip would exercise the happy path
 * and nothing else, while the behaviour worth pinning is the five different ways
 * this declines to post — no pull request, no token, a read-only token on a
 * fork, an unreachable API, an empty report. Each of those has to end in
 * "recorded a notice and carried on", because the report has already reached the
 * step summary and a red build for "could not comment" gets the action deleted
 * from the pipeline rather than configured.
 *
 * The consequence of that design is that this never proves a request GitHub
 * would accept. CONTRIBUTING says so; a fork pull request cannot exercise the
 * real API either, since `GITHUB_TOKEN` is read-only there by design.
 */

/** A stub GitHub, holding comments in a Map and recording every request. */
function fakeGitHub({ comments = [], failWith = null, failWriteWith = null, throwWith = null } = {}) {
  const store = new Map(comments.map((c) => [c.id, c]));
  const requests = [];
  let nextId = Math.max(0, ...store.keys()) + 1;

  const json = (status, value) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value),
  });

  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ method, url, body: init.body ?? '', headers: init.headers ?? {} });

    if (throwWith) throw new Error(throwWith);
    if (failWith) return json(failWith, { message: 'refused' });
    if (failWriteWith && method !== 'GET') return json(failWriteWith, { message: 'refused' });

    if (method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return json(200, page === 1 ? [...store.values()] : []);
    }
    if (method === 'POST') {
      const id = nextId++;
      store.set(id, { id, body: JSON.parse(init.body).body, user: { type: 'Bot' } });
      return json(201, { id });
    }
    if (method === 'PATCH') {
      const id = Number(url.split('/').pop());
      store.set(id, { ...store.get(id), id, body: JSON.parse(init.body).body });
      return json(200, { id });
    }
    return json(404, {});
  };

  return { fetchImpl, requests, store, bodies: () => [...store.values()].map((c) => c.body) };
}

const REPORT = '### Trazum\n\nAll good.\n';

/** Runs the poster, with sensible defaults for a pull request that exists. */
async function run({ github = fakeGitHub(), env = {}, report = REPORT } = {}) {
  const lines = [];
  const readFileImpl = async (path) => {
    if (path === '/event.json') return JSON.stringify({ pull_request: { number: 42 } });
    if (path === '/push.json') return JSON.stringify({ ref: 'refs/heads/main' });
    if (path === '/report.md') return report;
    throw new Error(`ENOENT: ${path}`);
  };

  const result = await postComment({
    env: {
      GITHUB_API_URL: 'https://api.example',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: '/event.json',
      TRAZUM_GITHUB_TOKEN: 'tok',
      TRAZUM_BODY_PATH: '/report.md',
      TRAZUM_MARKER_KEY: 'default',
      TRAZUM_OUTCOME: '0',
      ...env,
    },
    fetchImpl: github.fetchImpl,
    readFileImpl,
    log: (line) => lines.push(line),
  });

  return { ...result, github, out: lines.join('\n') };
}

describe('posting a report', () => {
  it('creates a comment on the first push and updates it on the second', async () => {
    // The roadmap promise: "updated in place, so a pull request carries the
    // current numbers instead of a history of them".
    const github = fakeGitHub();

    const first = await run({ github });
    assert.equal(first.action, 'created');
    assert.equal(github.store.size, 1);

    const second = await run({ github });
    assert.equal(second.action, 'updated');
    assert.equal(github.store.size, 1, 'a second run must not add a second comment');
    assert.equal(
      github.requests.filter((r) => r.method === 'POST').length,
      1,
      'only the first run should have created anything',
    );
  });

  it('keeps two keys as two separate comments, each converging on its own', async () => {
    const github = fakeGitHub();
    await run({ github, env: { TRAZUM_MARKER_KEY: 'prompts' } });
    await run({ github, env: { TRAZUM_MARKER_KEY: 'templates' } });
    assert.equal(github.store.size, 2);

    const again = await run({ github, env: { TRAZUM_MARKER_KEY: 'prompts' } });
    assert.equal(again.action, 'updated');
    assert.equal(github.store.size, 2);
  });

  it('matches on the marker, not on the author', async () => {
    // `gh pr comment --edit-last` matches by author, so any other step in the
    // job commenting as github-actions[bot] would have its comment overwritten.
    const github = fakeGitHub({
      comments: [{ id: 1, body: 'Coverage report from another action', user: { type: 'Bot' } }],
    });
    const result = await run({ github });

    assert.equal(result.action, 'created');
    assert.equal(
      github.store.get(1).body,
      'Coverage report from another action',
      'it overwrote a stranger',
    );
    assert.equal(github.store.size, 2);
  });

  it('prefers a Bot comment when a human has squatted the marker', async () => {
    const github = fakeGitHub({
      comments: [
        { id: 1, body: '<!-- trazum-report:default -->\nplanted', user: { type: 'User' } },
        { id: 2, body: '<!-- trazum-report:default -->\nours', user: { type: 'Bot' } },
      ],
    });
    await run({ github });

    assert.match(github.store.get(2).body, /All good/, 'the Bot comment is the one to update');
    assert.equal(github.store.get(1).body, '<!-- trazum-report:default -->\nplanted');
  });

  it('converges on the oldest when two of its own exist', async () => {
    // Alternating between two would be worse than picking one and staying there.
    const github = fakeGitHub({
      comments: [
        { id: 5, body: '<!-- trazum-report:default -->\nolder', user: { type: 'Bot' } },
        { id: 9, body: '<!-- trazum-report:default -->\nnewer', user: { type: 'Bot' } },
      ],
    });
    await run({ github });
    await run({ github });

    assert.match(github.store.get(5).body, /All good/);
    assert.match(github.store.get(9).body, /newer/, 'the newer duplicate should be left alone');
  });

  it('collapses a passing report and leaves a failing one open', async () => {
    // A green table that stays green on every push is the thing a maintainer
    // learns to skip — and once they skip it, they skip the red one too.
    const green = fakeGitHub();
    await run({ github: green, env: { TRAZUM_OUTCOME: '0' } });
    assert.match(green.bodies()[0], /<details>/);

    const red = fakeGitHub();
    await run({ github: red, env: { TRAZUM_OUTCOME: '1' } });
    assert.doesNotMatch(red.bodies()[0], /<details>/);
  });

  it('treats a missing outcome as not-ok rather than collapsing it', async () => {
    const github = fakeGitHub();
    await run({ github, env: { TRAZUM_OUTCOME: undefined } });
    assert.doesNotMatch(github.bodies()[0], /<details>/);
  });

  it('reports in the requested locale', async () => {
    const github = fakeGitHub();
    await run({ github, env: { TRAZUM_REPORT_LOCALE: 'es' } });
    assert.match(github.bodies()[0], /despliega para ver/);
  });
});

describe('it never fails the build', () => {
  // None of these is worth a red build, and by the time this runs the report has
  // already reached the step summary — there is nothing to salvage by failing.
  it('no token: names where the report is, and calls nothing', async () => {
    const github = fakeGitHub();
    const result = await run({ github, env: { TRAZUM_GITHUB_TOKEN: undefined } });

    assert.equal(result.detail, 'no-token');
    assert.match(result.out, /::notice/);
    assert.match(result.out, /run summary/);
    assert.equal(github.requests.length, 0, 'it should not have called the API at all');
  });

  it('not a pull request: skips without calling the API', async () => {
    const github = fakeGitHub();
    const result = await run({ github, env: { GITHUB_EVENT_PATH: '/push.json' } });

    assert.equal(result.detail, 'no-pull-request');
    assert.match(result.out, /Not a pull request/);
    assert.equal(github.requests.length, 0);
  });

  it('no event payload at all: skips', async () => {
    const result = await run({ env: { GITHUB_EVENT_PATH: undefined } });
    assert.equal(result.detail, 'no-pull-request');
  });

  it('a read-only token on a fork: names the reason and the wrong turn', async () => {
    // The realistic shape: a read-only token CAN list comments, so the refusal
    // lands on the write. The expected case, not a bug — and one line explaining
    // which case it is, is the difference between fixing a permissions block and
    // concluding the action is broken.
    const github = fakeGitHub({ failWriteWith: 403 });
    const result = await run({ github });

    assert.equal(result.detail, 'read-only-token');
    assert.match(result.out, /read-only/);
    assert.match(result.out, /pull_request_target/, 'it should warn against the obvious wrong turn');
    assert.match(result.out, /::notice/, 'expected, so not a warning');
    assert.equal(github.store.size, 0);
  });

  it('a token too narrow even to list gets the same explanation', async () => {
    // Same problem, so the same message rather than a generic "could not list"
    // the reader cannot act on.
    for (const status of [401, 403]) {
      const result = await run({ github: fakeGitHub({ failWith: status }) });
      assert.equal(result.detail, 'read-only-token', `status ${status}`);
      assert.match(result.out, /pull_request_target/);
    }
  });

  it('some other API refusal: warns and carries on', async () => {
    const result = await run({ github: fakeGitHub({ failWith: 500 }) });
    assert.equal(result.detail, 'list-failed');
    assert.match(result.out, /::warning/);
  });

  it('an unreachable API: warns and carries on', async () => {
    const result = await run({ github: fakeGitHub({ throwWith: 'ECONNREFUSED' }) });
    assert.equal(result.detail, 'api-unreachable');
    assert.match(result.out, /::warning/);
    assert.match(result.out, /run summary/);
  });

  it('a missing report file: skips', async () => {
    const result = await run({ env: { TRAZUM_BODY_PATH: '/nope.md' } });
    assert.equal(result.detail, 'unreadable-report');
    assert.match(result.out, /::warning/);
  });

  it('an empty report: posts nothing', async () => {
    const github = fakeGitHub();
    const result = await run({ github, report: '   \n' });
    assert.equal(result.detail, 'empty-report');
    assert.equal(github.store.size, 0);
  });

  it('no report path: skips before anything else', async () => {
    const result = await run({ env: { TRAZUM_BODY_PATH: undefined } });
    assert.equal(result.detail, 'no-body-path');
  });

  it('outside Actions entirely: skips', async () => {
    const result = await run({ env: { GITHUB_REPOSITORY: undefined } });
    assert.equal(result.detail, 'no-repository');
  });
});

describe('what it sends', () => {
  it('never puts the token anywhere but the authorization header', async () => {
    const github = fakeGitHub();
    await run({ github, env: { TRAZUM_GITHUB_TOKEN: 'secret-token-value' } });

    assert.ok(github.requests.length > 0);
    for (const request of github.requests) {
      assert.doesNotMatch(request.url, /secret-token-value/, 'the token reached a URL');
      assert.doesNotMatch(String(request.body), /secret-token-value/, 'the token reached a body');
      assert.equal(request.headers.authorization, 'Bearer secret-token-value');
    }
  });

  it('pins the API version, so a future default cannot change the shape', async () => {
    const github = fakeGitHub();
    await run({ github });
    assert.equal(github.requests[0].headers['x-github-api-version'], '2022-11-28');
  });

  it('honours GITHUB_API_URL, so GitHub Enterprise works', async () => {
    const github = fakeGitHub();
    await run({ github, env: { GITHUB_API_URL: 'https://ghe.internal/api/v3' } });
    for (const request of github.requests) {
      assert.match(request.url, /^https:\/\/ghe\.internal\/api\/v3\//);
    }
  });

  it('trims a report too large for a comment rather than being rejected', async () => {
    const github = fakeGitHub();
    const result = await run({
      github,
      report: `### Trazum\n\n${'x'.repeat(200_000)}\n`,
      env: { TRAZUM_OUTCOME: '1' },
    });

    assert.equal(result.action, 'created');
    const posted = github.bodies()[0];
    assert.ok(posted.length <= 65_536, `${posted.length} characters would be rejected`);
    assert.match(posted, /<!-- trazum-report:default -->/, 'the marker must survive the trim');
  });

  it('stops paging rather than walking a pull request forever', async () => {
    // A full page every time would otherwise loop until the API ran out.
    let calls = 0;
    const fetchImpl = async (url, init = {}) => {
      const method = init.method ?? 'GET';
      if (method !== 'GET') return { ok: true, status: 201, json: async () => ({ id: 1 }) };
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () =>
          Array.from({ length: 100 }, (_, i) => ({ id: calls * 1000 + i, body: 'x', user: {} })),
      };
    };

    await postComment({
      env: {
        GITHUB_API_URL: 'https://api.example',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_EVENT_PATH: '/event.json',
        TRAZUM_GITHUB_TOKEN: 'tok',
        TRAZUM_BODY_PATH: '/report.md',
        TRAZUM_OUTCOME: '0',
      },
      fetchImpl,
      readFileImpl: async (path) =>
        path === '/event.json' ? JSON.stringify({ pull_request: { number: 1 } }) : REPORT,
    });

    assert.ok(calls <= 10, `paged ${calls} times`);
  });
});

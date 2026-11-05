/**
 * The verdict half of the privacy probe, kept free of any browser so it can
 * be tested on its own.
 *
 * The probe pastes a usage log into the web page's Bill tab with a real
 * browser and records every request the page makes. This decides, from that
 * record alone, whether the page kept its promise: a pasted log is read in the
 * browser and nothing of it leaves.
 *
 * Four rules, each one a way the promise has been or could be broken:
 *
 * 1. **No marker leaves.** The log carries unique marker strings in its label,
 *    its session and a field the reader ignores. None may appear in any
 *    request's URL, headers or body.
 * 2. **Nothing goes elsewhere.** Every request goes to the page's own origin.
 *    The Content-Security-Policy says the same, and this checks the page that
 *    was served rather than the header that was meant.
 * 3. **Reading the bill asks the server nothing.** Requests made while the log
 *    is pasted and read are counted separately, and the only ones allowed are
 *    `GET`s of the page's own code under `/_next/static/`, which a component
 *    may load as it first renders and which carry nothing of the log. The bill
 *    is computed in the page.
 * 4. **Nothing fails on the way.** A same-origin request answered 400 or worse,
 *    or one that failed outright, is a defect the visitor's console shows on
 *    every load. The REA audit of November 2026 found exactly that, a 503 for
 *    a share list nobody signed in could have.
 */

/**
 * @typedef {object} ObservedRequest
 * @property {string} url
 * @property {string} method
 * @property {Record<string, string>} headers
 * @property {string | null} body
 * @property {'load' | 'read'} phase  `read` from the paste until the bill rendered
 * @property {number | null} status  null when the request failed or never answered
 * @property {string | null} failure
 */

/**
 * @param {ObservedRequest[]} requests
 * @param {{ origin: string, markers: string[] }} expected
 * @returns {{ ok: boolean, problems: string[], summary: { requests: number, duringRead: number, origins: string[] } }}
 */
export function judgePrivacy(requests, { origin, markers }) {
  const problems = [];
  for (const request of requests) {
    const where = `${request.method} ${request.url}`;
    const carried = [request.url, JSON.stringify(request.headers ?? {}), request.body ?? ''].join('\n');
    for (const marker of markers) {
      if (carried.includes(marker)) problems.push(`marker ${marker} left the page in ${where}`);
    }
    let requestOrigin;
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      requestOrigin = null;
    }
    // data: and blob: URLs never leave the browser, so they are not requests to anywhere.
    const local = request.url.startsWith('data:') || request.url.startsWith('blob:');
    if (!local && requestOrigin !== origin) problems.push(`request to another origin: ${where}`);
    const ownCode =
      requestOrigin === origin && request.method === 'GET' && new URL(request.url).pathname.startsWith('/_next/static/');
    if (request.phase === 'read' && !ownCode && !local) problems.push(`reading the bill made a request: ${where}`);
    if (!local && requestOrigin === origin) {
      if (request.failure !== null) problems.push(`request failed (${request.failure}): ${where}`);
      else if (request.status !== null && request.status >= 400) problems.push(`answered ${request.status}: ${where}`);
    }
  }
  const origins = [...new Set(requests.map((request) => {
    try {
      return new URL(request.url).origin;
    } catch {
      return request.url.slice(0, 5);
    }
  }))].sort();
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      requests: requests.length,
      duringRead: requests.filter((request) => request.phase === 'read').length,
      origins,
    },
  };
}

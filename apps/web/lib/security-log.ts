/**
 * The web app's security events, one JSON line each, on standard output.
 *
 * ## Why it exists
 *
 * Until the compliance readiness pack, the app decided who could sign in, who
 * could read a library, who could delete an account and who could see the
 * admin overview, and wrote none of those decisions down. Every framework the
 * pack maps to asks for that record (SOC 2 CC7.2 and CC7.3, ISO 27001 8.15 and
 * 8.16, OWASP ASVS V7.1 and V7.2), and every incident that ever needs
 * investigating starts by asking for it.
 *
 * Standard output because that is where the platform already collects a
 * server's logs, Vercel's log drains and a container's runtime alike: one
 * line here is one line there, with no logging service to configure, pay for
 * or trust with anything.
 *
 * ## What a line may carry, and what it never does
 *
 * A line is `{"type":"security","event":…,"outcome":…,"at":…}` plus, where it
 * applies, `userId` (the opaque internal id, never the GitHub login), `reason`
 * (a short code from the list below, never free text) and `route`.
 *
 * **Never** a session token or its hash, a cookie, an OAuth code or state, an
 * IP address, a GitHub login, a share token, or any prompt text. The type
 * below is the whole vocabulary: a field that is not declared cannot be
 * logged, and `security-log.test.mjs` plants each of those values in a request
 * and greps every line written for it.
 *
 * Each value it refuses has a reason. A token or its hash in a log is a way
 * back into an account for whoever reads the log. An IP address and a login
 * are personal data, and a log line is a copy that outlives the account it
 * describes. A share token is the capability itself. And prompt text is the
 * thing this product promises not to keep.
 */

import { redactUrl } from './analytics';

export type SecurityEvent =
  | 'auth.sign_in'
  | 'auth.sign_out'
  | 'account.deleted'
  | 'account.exported'
  | 'share.created'
  | 'share.revoked'
  | 'admin.access'
  | 'access.refused'
  | 'input.refused';

export type SecurityReason =
  | 'cancelled'
  | 'state_mismatch'
  | 'missing_code'
  | 'provider_error'
  | 'not_allowed'
  | 'rate_limited'
  | 'not_signed_in'
  | 'cross_origin'
  | 'not_admin'
  | 'not_owner'
  | 'not_json'
  | 'invalid_json'
  | 'invalid_input'
  | 'reauth_required'
  | 'not_found';

export interface SecurityLine {
  type: 'security';
  event: SecurityEvent;
  outcome: 'success' | 'failure';
  at: string;
  userId?: string;
  reason?: SecurityReason;
  route?: string;
}

type Sink = (line: string) => void;

const defaultSink: Sink = (line) => {
  // Not `console.error`: these are records, not errors, and a platform that
  // alerts on stderr volume should not page anybody for a refused sign-in.
  console.info(line);
};

let sink: Sink = defaultSink;

/** For tests: capture lines instead of writing them. Returns the restore. */
export function captureSecurityLog(capture: Sink): () => void {
  sink = capture;
  return () => {
    sink = defaultSink;
  };
}

/**
 * Record one event. Never throws: a log line that cannot be written must not
 * turn a sign-in or a deletion into a 500.
 */
export function securityEvent(
  event: SecurityEvent,
  outcome: SecurityLine['outcome'],
  details: { userId?: string; reason?: SecurityReason; route?: string } = {},
  now: Date = new Date(),
): void {
  const line: SecurityLine = { type: 'security', event, outcome, at: now.toISOString() };
  if (details.userId) line.userId = details.userId;
  if (details.reason) line.reason = details.reason;
  if (details.route) line.route = details.route;
  try {
    sink(JSON.stringify(line));
  } catch {
    // Swallowed on purpose, see above.
  }
}

/**
 * Requests refused for what they sent (OWASP ASVS 4.0.3 7.1.3): a body that
 * does not say it is JSON, a body that will not parse, and a value a route
 * will not take. One `input.refused` line each, with a reason, the route and,
 * on a signed-in route, the account.
 *
 * **Never the message the route answered with.** Those quote the input on
 * purpose, so a person can see what to fix: an unknown rule's name, a model
 * id, a prompt name that is already taken. In a log the same sentence is the
 * prompt text this product promises not to keep. The reason is one of three
 * codes and nothing else.
 *
 * **Every refusal, by construction.** A route that reads a body exports its
 * handlers through `logsRefusedInput`, which looks at the response and writes
 * the line for any 400, 413, 415 or 422, so a refusal added to a route later
 * is recorded without anybody remembering to. `security-log.test.mjs` holds
 * every such route to the wrapper.
 */
const callers = new WeakMap<Request, string>();
const unreadable = new WeakSet<Response>();

/**
 * Names the account a request came from, for a refusal recorded later in the
 * same request. Called once the session has been resolved; the request is
 * the key, so nothing outlives it.
 */
export function attributeRequest(request: Request, userId: string): void {
  callers.set(request, userId);
}

/**
 * Marks a refusal as a body that would not parse, the deserialization failure
 * ASVS 7.1.3 names, rather than a value the route would not take.
 */
export function unreadableBody<R extends Response>(response: R): R {
  unreadable.add(response);
  return response;
}

/** Why a response refused its request's input, or `null` when it did not. */
export function inputRefusal(response: Response): SecurityReason | null {
  if (unreadable.has(response)) return 'invalid_json';
  if (response.status === 415) return 'not_json';
  if (response.status === 400 || response.status === 413 || response.status === 422) return 'invalid_input';
  return null;
}

/**
 * A route handler that writes an `input.refused` line whenever it refuses
 * what it was sent. The handler's own answer goes back unchanged, and a
 * handler that throws still throws: that is `onRequestError`'s to record.
 */
export function logsRefusedInput<Rest extends unknown[]>(
  handler: (request: Request, ...rest: Rest) => Promise<Response>,
): (request: Request, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const response = await handler(request, ...rest);
    const reason = inputRefusal(response);
    if (reason) securityEvent('input.refused', 'failure', { reason, userId: callers.get(request), route: routeOf(request) });
    return response;
  };
}

/**
 * The path of a request, as safe to keep as the event itself.
 *
 * Without its query, which can carry an OAuth code or state, and with every
 * share and badge token replaced by `:token`, because those paths are the
 * capability: a log line holding `/api/shares/<token>` is a working link for
 * whoever reads the log. The redaction is the analytics redaction, one
 * function for both places a URL leaves the request.
 */
export function routeOf(request: Request): string {
  try {
    return new URL(redactUrl(request.url)).pathname;
  } catch {
    return '';
  }
}

/**
 * The last-resort record of an error nothing else caught (OWASP ASVS 4.0.3
 * 7.4.3), called by `onRequestError` in `instrumentation.ts`.
 *
 * One line: `{"type":"error","at":…,"route":…,"method":…,"kind":…,"digest":…}`.
 * `digest` is the id the framework's generic error page shows the person who
 * hit the error, so someone they report it to can find this line (7.4.1).
 *
 * `route` is the route's pattern, `/api/prompts/[id]` or `/c/[token]`, never
 * the path that was requested, so a share token or an id in the URL cannot
 * reach the log. The error's message, its stack, the headers and the body are
 * never read: a message from a JSON parser or a database driver can quote the
 * input it choked on, and that input can be somebody's prompt. The framework
 * already prints the error itself; this is the line that is safe to keep.
 */
export interface ErrorLine {
  type: 'error';
  at: string;
  route: string;
  method: string;
  kind: string;
  digest?: string;
}

const ERROR_KINDS = new Set(['render', 'route', 'action', 'proxy', 'middleware']);

export function unhandledError(
  error: unknown,
  request: { method?: unknown },
  context: { routePath?: unknown; routeType?: unknown },
  now: Date = new Date(),
): void {
  const routePath = typeof context.routePath === 'string' ? context.routePath : '';
  const line: ErrorLine = {
    type: 'error',
    at: now.toISOString(),
    // A pattern starts with a slash and carries no query; anything else is
    // not what the framework promised and is not written.
    route: /^\/[^?#\s]{0,200}$/.test(routePath) ? routePath : 'unknown',
    method: typeof request.method === 'string' && /^[A-Z]{1,10}$/.test(request.method) ? request.method : 'unknown',
    kind: typeof context.routeType === 'string' && ERROR_KINDS.has(context.routeType) ? context.routeType : 'unknown',
  };
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === 'string' && /^[\w-]{1,64}$/.test(digest)) line.digest = digest;
  try {
    sink(JSON.stringify(line));
  } catch {
    // Swallowed on purpose, as in `securityEvent`.
  }
}


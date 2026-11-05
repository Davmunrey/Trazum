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
  | 'access.refused';

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
  | 'not_owner';

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

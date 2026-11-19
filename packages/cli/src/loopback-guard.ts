/**
 * The two checks that keep a loopback server from answering a web page.
 *
 * Binding to 127.0.0.1 keeps other machines out. It does not keep out a page
 * open in a browser on this machine: a page can point its own hostname at
 * 127.0.0.1 (DNS rebinding) and then talk to the server as its own origin,
 * reading the answers. Two refusals close that, and neither needs a secret:
 *
 * - **The `Host` header must name this server.** A rebinding page sends its
 *   own hostname, because that is what the browser believes it is talking to.
 *   Only `localhost`, `127.0.0.1` and `[::1]`, on the port the server is
 *   bound to, are accepted.
 * - **A POST must say `content-type: application/json`.** A page can send
 *   `text/plain` without asking permission; it cannot send `application/json`
 *   cross-origin without a CORS preflight, and nothing here answers one.
 *
 * A server bound to a Unix socket has no port and no hostname for a page to
 * rebind, so the Host check does not apply there. The content-type check does.
 */

import type { IncomingMessage, Server } from 'node:http';

const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True when `Host` names a loopback address on the port the server is bound to. */
export function hostIsLoopback(host: string | undefined, port: number): boolean {
  if (host === undefined) return false;
  const match = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(host.trim());
  if (match === null) return false;
  const name = match[1]!.toLowerCase();
  if (!LOOPBACK_NAMES.has(name)) return false;
  // A Host with no port means port 80, which is not this server's.
  return match[2] !== undefined && Number(match[2]) === port;
}

/** True when the header's media type is `application/json`, parameters aside. */
export function isJsonContentType(value: string | undefined): boolean {
  return value !== undefined && value.split(';')[0]!.trim().toLowerCase() === 'application/json';
}

export interface GuardRefusal {
  status: 403 | 415;
  error: 'forbidden-host' | 'unsupported-media-type';
  detail: string;
}

/** The refusal for a request addressed to a host that is not this server's own, or null. */
export function refuseHost(server: Server, request: IncomingMessage): GuardRefusal | null {
  const address = server.address();
  // A Unix socket has no port and no hostname to rebind: nothing to check.
  if (typeof address === 'object' && address !== null && !hostIsLoopback(request.headers.host, address.port)) {
    return {
      status: 403,
      error: 'forbidden-host',
      detail: 'This server answers only requests addressed to localhost, 127.0.0.1 or [::1] on its own port.',
    };
  }
  return null;
}

/**
 * The refusal for a POST that does not say it is JSON, or null. Checked after
 * routing, so a path that does not exist still answers 404 whatever it sent.
 */
export function refuseContentType(request: IncomingMessage): GuardRefusal | null {
  if (request.method === 'POST' && !isJsonContentType(request.headers['content-type'])) {
    return {
      status: 415,
      error: 'unsupported-media-type',
      detail: 'A POST must send content-type: application/json.',
    };
  }
  return null;
}

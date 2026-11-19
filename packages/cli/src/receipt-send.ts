/**
 * `trazum bill --receipt --send <url>`: the receipt, posted to the endpoint
 * an organisation named, and nothing else.
 *
 * Three properties, each held by `packages/cli/test/bill-send.test.js`:
 *
 * - **Only the receipt leaves.** `sendReceipt` takes the bytes the same run
 *   wrote and posts them as they are. It is handed no log line, no path and no
 *   prompt, so there is nothing else for it to send.
 * - **The key is read here and goes nowhere but the header.** It comes from
 *   `TRAZUM_RECEIPT_KEY`, never from a flag, and this module has no `console`:
 *   what it returns is already scrubbed of the key, and the caller prints that.
 * - **The URL is `watch --webhook`'s.** `checkWebhook` is imported, not copied:
 *   https except on loopback, no credentials in the URL. Redirects are refused
 *   by `SAFE_FETCH_INIT`, so a response from somewhere else never arrives.
 *
 * One request, one attempt, awaited: no retry and nothing in the background.
 */

import { SAFE_FETCH_INIT } from '@trazum/core/node';
import { redact } from './connect.js';
import { checkWebhook, type WebhookRejection } from './watch-run.js';

/** The environment variable the key is read from. A flag would end up in shell history. */
export const RECEIPT_KEY_ENV = 'TRAZUM_RECEIPT_KEY';

/** How much of a response body is shown. An endpoint's error page is not ours to print whole. */
const BODY_LIMIT = 2000;

export type ReceiptTarget =
  | { ok: true; url: URL; key: string | undefined }
  | { ok: false; reason: WebhookRejection | 'bad-key' };

/**
 * Whether this URL and this key are ones a receipt may be sent with.
 * Checked before any log is read, so a refusal costs nothing.
 */
export function checkReceiptTarget(raw: string, env: NodeJS.ProcessEnv = process.env): ReceiptTarget {
  const checked = checkWebhook(raw);
  if (!checked.ok) return checked;
  const key = env[RECEIPT_KEY_ENV];
  if (key === undefined || key === '') return { ok: true, url: checked.url, key: undefined };
  // A header value with a space, a control character or a non-ASCII byte is
  // one the HTTP client refuses by quoting it back in its error.
  if (!/^[\x21-\x7e]+$/.test(key)) return { ok: false, reason: 'bad-key' };
  return { ok: true, url: checked.url, key };
}

export interface SendResult {
  /** The endpoint answered 2xx. */
  ok: boolean;
  /** The status, or null when no answer arrived. */
  status: number | null;
  /** What the endpoint said, or why no answer arrived. Never carries the key. */
  detail: string;
}

const scrub = (text: string, key: string | undefined): string => {
  let out = text;
  if (key !== undefined && key !== '') out = out.split(key).join('[redacted]');
  return redact(out);
};

export async function sendReceipt(
  url: URL,
  key: string | undefined,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl(url.toString(), {
      ...SAFE_FETCH_INIT,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key !== undefined ? { authorization: `Bearer ${key}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    // Scrubbed before it is cut, so a key that straddles the limit is not left half shown.
    const text = scrub(await response.text(), key).slice(0, BODY_LIMIT).trim();
    return { ok: response.ok, status: response.status, detail: text };
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: null, detail: scrub(`${message}${cause}`, key) };
  }
}

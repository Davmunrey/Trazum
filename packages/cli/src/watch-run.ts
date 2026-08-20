/**
 * One cycle of watching, and the state that survives a restart.
 *
 * `--once` is the primitive: pull the window, keep it, evaluate the gates,
 * emit what crossed, save state. A cron entry runs exactly that, and so does
 * every test. The foreground loop is this function in a timer, so there is one
 * code path and no daemon-only behaviour that nobody exercises.
 *
 * **The state file is what makes a restart honest.** Without it a resumed
 * watcher re-alerts on yesterday's crossing (noise nobody reads) and implies
 * it was watching the whole time (a claim it cannot make). With it, the
 * crossing stays quiet and the unwatched stretch gets named once.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SAFE_FETCH_INIT } from '@trazum/core/node';
import type { WatchCrossing } from '@trazum/core';

export const WATCH_STATE_FILE = '.trazum/watch.json';

export const WATCH_STATE_VERSION = 1;

export interface WatchState {
  v: number;
  /** When the last cycle ran, so a long silence can be told from a first run. */
  lastCycleMs: number;
  /** How far the measurements reached, for the coverage gap. */
  lastCoveredToMs: number | null;
  /** Gate keys already alerted on, so a restart is not amnesia. */
  fired: Record<string, number>;
}

export async function readWatchState(root: string): Promise<WatchState | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, WATCH_STATE_FILE), 'utf8')) as WatchState;
    if (parsed?.v !== WATCH_STATE_VERSION) return null;
    return parsed;
  } catch {
    // No state, or state this version cannot read: a first cycle either way,
    // which is a state the caller reports rather than an error.
    return null;
  }
}

export async function writeWatchState(root: string, state: WatchState): Promise<void> {
  const path = join(root, WATCH_STATE_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Whether a webhook URL is one this tool will post to.
 *
 * **This is not the SSRF case and the difference matters.** `checkedEndpoint`
 * exists because a *request body* must never name a host: an anonymous caller
 * pointing a shared server at an internal address is somebody else's machine
 * reaching somewhere it was never meant to. Here the URL is in the operator's
 * own config, on their own machine, and pointing it at their own alerting
 * daemon on loopback is the ordinary case rather than the attack.
 *
 * So loopback is allowed and plain http is allowed *only* there, while two
 * rules stay absolute: no credentials embedded in the URL, because a URL ends
 * up in logs and shell history; and https everywhere else, because an alert
 * carries spend figures across a network.
 */
export type WebhookRejection = 'invalid-url' | 'credentials-in-url' | 'insecure-scheme';

export function checkWebhook(raw: string): { ok: true; url: URL } | { ok: false; reason: WebhookRejection } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials-in-url' };
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (url.protocol === 'https:') return { ok: true, url };
  if (url.protocol === 'http:' && loopback) return { ok: true, url };
  return { ok: false, reason: 'insecure-scheme' };
}

/**
 * The alert payload.
 *
 * Figures and gate names, never prompt text — the store has never held any and
 * neither does this. Every crossing carries its own provenance, so a receiver
 * that fans these into a dashboard cannot lose track of what kind of number it
 * is holding.
 */
export interface WatchAlert {
  schemaVersion: 1;
  firedAtMs: number;
  crossings: WatchCrossing[];
}

export async function postWebhook(
  url: URL,
  alert: WatchAlert,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const response = await fetchImpl(url.toString(), {
      ...SAFE_FETCH_INIT,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, status: response.status, error: null };
  } catch (error) {
    /**
     * A webhook that will not deliver must not take the alert down with it.
     * The exit code and the stdout event have already carried the crossing;
     * losing those because a receiver is down would make the quietest failure
     * the loudest one.
     */
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

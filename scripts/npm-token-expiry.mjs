/**
 * When the npm token that uploads a release stops working, read from a date a
 * person wrote down.
 *
 * Why it exists. Releases authenticate to npm with a granular token stored as
 * the `NPM_TOKEN` secret of the `release` environment, and a granular token
 * has an expiry. On 2026-11-17 the 2.7.10 release pull request merged, the
 * job verified, packed and stressed the release for five minutes, and the
 * first upload answered `E404 Not Found - PUT`, which is how npm reports a
 * write it will not authorise. Nothing in the repository knew when the token
 * would stop working, so nothing could say so before the merge, and `main`
 * named a version npm did not have.
 *
 * npm shows the expiry when the token is created and this repository has no
 * way to ask for it afterwards, so the date is recorded by hand in
 * `.github/release-credentials.json`. It is not a secret. The token is, and it
 * never goes in that file.
 *
 * Two readers: `freshness.mjs` turns the weekly scheduled run red on `main`
 * from `WARN_DAYS` before the date, which is where GitHub notifies the owner,
 * and `prepare-release.mjs` refuses to prepare a release the token is recorded
 * as unable to upload.
 *
 * A date nobody recorded is reported as exactly that, never as a pass: an
 * unknown expiry warns nobody, and saying so is the whole use of the line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CREDENTIALS_FILE = '.github/release-credentials.json';
/** Two weekly runs fall inside this window, so one missed notification is not the only one. */
export const WARN_DAYS = 14;

const DAY = 86_400_000;
const WHERE = 'docs/releasing.md, "The token fallback"';

/**
 * The recorded date, `null` when none is recorded, or a string that is not a
 * date when the file holds something else. A missing file records nothing; a
 * file that is not JSON is a mistake to fix and throws.
 */
export function recordedNpmTokenExpiry(root) {
  let text;
  try {
    text = readFileSync(join(root, CREDENTIALS_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${CREDENTIALS_FILE} is not JSON`);
  }
  const expires = parsed?.npmToken?.expires;
  return expires === undefined ? null : expires;
}

/**
 * Midnight UTC at the start of a `YYYY-MM-DD` date, or `null`.
 *
 * Read back after parsing, because `Date.parse('2027-02-31T00:00:00Z')` is the
 * third of March and not an error: a typo in the one date this file exists to
 * hold would move the warning by days and say nothing.
 */
function startOf(date) {
  if (typeof date !== 'string') return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  // The one comparison holds the shape too: only YYYY-MM-DD reads back as itself.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null;
  return ms;
}

/**
 * Where the token stands at `now`.
 *
 * The token is counted as gone from the first minute of the recorded day. npm
 * names a day and no hour, and the early reading is the one that never tells
 * a release it has a credential when it has none.
 *
 * @returns {{ status: 'unrecorded' | 'invalid' | 'ok' | 'soon' | 'expired', text: string, expires?: string, daysLeft?: number }}
 */
export function npmTokenStanding(expires, now = Date.now()) {
  if (expires === null || expires === undefined) {
    return {
      status: 'unrecorded',
      text: `npm token: no expiry date in ${CREDENTIALS_FILE}, so nothing warns before releases stop uploading. Record it when the token is next renewed (${WHERE})`,
    };
  }
  const start = startOf(expires);
  if (start === null) {
    return {
      status: 'invalid',
      text: `npm token: the expiry in ${CREDENTIALS_FILE} is not a real YYYY-MM-DD date, so it warns of nothing`,
    };
  }
  const left = start - now;
  if (left <= 0) {
    return {
      status: 'expired',
      expires,
      daysLeft: 0,
      text: `npm token: recorded as expiring on ${expires}, which has come: no release can upload until it is renewed and the new date recorded (${WHERE})`,
    };
  }
  const daysLeft = Math.ceil(left / DAY);
  if (left <= WARN_DAYS * DAY) {
    return {
      status: 'soon',
      expires,
      daysLeft,
      text: `npm token: expires ${expires}, ${daysLeft} day(s) left: renew it and record the new date before a release needs it (${WHERE})`,
    };
  }
  return { status: 'ok', expires, daysLeft, text: `npm token: expires ${expires}, ${daysLeft} day(s) left` };
}

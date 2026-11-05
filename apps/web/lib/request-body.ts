/**
 * Whether a request says its body is JSON.
 *
 * Every route that reads a body reads JSON, and until this check each one
 * parsed whatever arrived under whatever `Content-Type` it came with. That is
 * OWASP ASVS 4.0.3 13.1.5 and 13.2.5, and it is more than tidiness: the three
 * content types a page on another site can send without asking the browser
 * first (`text/plain`, `application/x-www-form-urlencoded` and
 * `multipart/form-data`) are exactly the ones this now refuses. A cross-site
 * form that posts a JSON-looking string as `text/plain` used to be parsed; it
 * is now a 415 before anything is read.
 *
 * The media type is compared without its parameters, so
 * `application/json; charset=utf-8` is JSON and `application/jsonx` is not.
 */
export function saysJson(request: Request): boolean {
  const type = request.headers.get('content-type');
  if (!type) return false;
  return type.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * The `locale` a body asked for, read before the body is checked.
 *
 * A refusal of the body has to be worded in some language, and the right one
 * is the one the caller named, so this is the one field read from a body its
 * schema has not passed yet. It only ever chooses among the languages the app
 * speaks (`resolveLocale`), and the schema still refuses a `locale` that is
 * not text.
 */
export function requestedLocale(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const locale = (raw as { locale?: unknown }).locale;
  return typeof locale === 'string' ? locale : null;
}

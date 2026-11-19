import { parseUsageLine } from '@trazum/core';

/**
 * Calendar days in a named time zone, for `trazum bill --timezone` (#826).
 *
 * Everything else in the CLI cuts days in UTC, so the same log answers the same
 * way in every office. A person who bills by their own calendar asks for their
 * zone by its IANA name, and this is the whole of what that costs: the platform's
 * `Intl.DateTimeFormat` knows the zone's rules, including the days that are 23 or
 * 25 hours long, so no offset table and no dependency is shipped here.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const known = formatters.get(zone);
  if (known !== undefined) return known;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatters.set(zone, made);
  return made;
}

/**
 * The zone's own spelling of a name the platform accepts (`europe/madrid` is
 * `Europe/Madrid`), or `null` for one it does not. Nothing is guessed: a name
 * the platform refuses is refused here.
 */
export function canonicalZone(name: string): string | null {
  if (name.trim() === '') return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` of an instant on the calendar of `zone`. */
export function dayInZone(ms: number, zone: string): string {
  const parts = formatterFor(zone).formatToParts(new Date(ms));
  const of = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${of('year').padStart(4, '0')}-${of('month')}-${of('day')}`;
}

/** The calendar day after a `YYYY-MM-DD` one. Pure calendar arithmetic: no zone is involved. */
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * The first instant of a `YYYY-MM-DD` day in `zone`.
 *
 * Found by search, not by adding an offset: the offset at midnight is not the
 * offset the day began under when a clock change falls that night, and a day
 * whose midnight does not exist (a zone that skips it) begins at the first
 * instant that is on or after the day. Every zone's offset is within -12h and
 * +14h, so the instant lies within a day and a half of the UTC midnight.
 */
export function startOfDayInZone(day: string, zone: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  let low = utcMidnight - 15 * 3_600_000;
  let high = utcMidnight + 15 * 3_600_000;
  /* Invariant: `low` is on an earlier day than `day`, `high` on `day` or later. */
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (dayInZone(mid, zone) < day) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * The usage lines grouped by the day they fall on in `zone`. A line with no
 * clock, or one the profile cannot read, is in no group: the profile accounts
 * for those itself, and the bill's own total still holds them.
 */
export function groupByDayInZone(lines: readonly string[], zone: string): Map<string, string[]> {
  const days = new Map<string, string[]>();
  for (const line of lines) {
    const record = parseUsageLine(line);
    if (record === null || record.ts === null) continue;
    const day = dayInZone(record.ts, zone);
    const own = days.get(day);
    if (own === undefined) days.set(day, [line]);
    else own.push(line);
  }
  return days;
}

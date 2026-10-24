// Calendar arithmetic for the class time zone (ARCHITECTURE.md §8.3: streak days
// and school days are counted in the class time zone). Tracker code may not use
// Intl or the local-time Date methods (§8.1), so the zone arrives as a POSIX TZ
// rule ("EST5EDT,M3.2.0,M11.1.0"), the same footer IANA tzdata files carry, and
// all date maths is integer arithmetic on day numbers (days since 1970-01-01).

export class TrackerConfigError extends Error {
  override name = 'TrackerConfigError';
}

const DAY_SECONDS = 86_400;

/** Days since 1970-01-01 for a proleptic Gregorian date (month 1–12). */
export function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / (DAY_SECONDS * 1000);
}

/** `YYYY-MM-DD` for a day number (H. Hinnant's civil_from_days). */
export function isoDate(days: number): string {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day number of a `YYYY-MM-DD` date, or null if it isn't a real date. */
export function parseIsoDate(date: string): number | null {
  const m = ISO_DATE.exec(date);
  if (!m) return null;
  const days = dayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
  return isoDate(days) === date ? days : null;
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function monthLength(year: number, month: number): number {
  return (
    dayNumber(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) -
    dayNumber(year, month, 1)
  );
}

/** Civil year of a day number. */
function yearOf(days: number): number {
  return Number(isoDate(days).slice(0, 4));
}

// ---------------------------------------------------------------------------
// POSIX TZ rules: std offset [dst [offset] ,start[/time],end[/time]]

type DateRule =
  | { kind: 'julian1'; day: number } // Jn: 1–365, Feb 29 never counted
  | { kind: 'julian0'; day: number } // n: 0–365, Feb 29 counted
  | { kind: 'month'; month: number; week: number; weekday: number }; // Mm.w.d

type Transition = { date: DateRule; seconds: number };

export type TimeZoneRule = {
  /** The rule as given. */
  source: string;
  /** Standard offset east of UTC, in seconds. */
  stdOffset: number;
  dst: { offset: number; start: Transition; end: Transition } | null;
};

class Cursor {
  i = 0;
  constructor(readonly text: string) {}
  peek(): string {
    return this.text[this.i] ?? '';
  }
  match(re: RegExp): string | null {
    const m = re.exec(this.text.slice(this.i));
    if (!m || m.index !== 0) return null;
    this.i += m[0].length;
    return m[0];
  }
}

/** Parses a `[+-]hh[:mm[:ss]]` value into seconds, or null when absent. */
function clock(c: Cursor, maxHours: number): number | null {
  const raw = c.match(/[+-]?\d{1,3}(:\d{2}){0,2}/);
  if (raw === null) return null;
  const sign = raw.startsWith('-') ? -1 : 1;
  const [h = 0, m = 0, s = 0] = raw.replace(/^[+-]/, '').split(':').map(Number);
  if (h > maxHours || m > 59 || s > 59) return Number.NaN;
  return sign * (h * 3600 + m * 60 + s);
}

function zoneName(c: Cursor): string | null {
  return c.match(/<[A-Za-z0-9+-]{3,}>/) ?? c.match(/[A-Za-z]{3,}/);
}

function dateRule(c: Cursor): DateRule | null {
  const month = c.match(/M\d{1,2}\.\d\.\d/);
  if (month) {
    const [m = 0, w = 0, d = 0] = month.slice(1).split('.').map(Number);
    if (m < 1 || m > 12 || w < 1 || w > 5 || d > 6) return null;
    return { kind: 'month', month: m, week: w, weekday: d };
  }
  const julian = c.match(/J\d{1,3}/);
  if (julian) {
    const day = Number(julian.slice(1));
    return day >= 1 && day <= 365 ? { kind: 'julian1', day } : null;
  }
  const zero = c.match(/\d{1,3}/);
  if (zero) {
    const day = Number(zero);
    return day <= 365 ? { kind: 'julian0', day } : null;
  }
  return null;
}

function transition(c: Cursor): Transition | null {
  if (c.match(/,/) === null) return null;
  const date = dateRule(c);
  if (!date) return null;
  let seconds = 2 * 3600;
  if (c.match(/\//) !== null) {
    const t = clock(c, 167);
    if (t === null || Number.isNaN(t)) return null;
    seconds = t;
  }
  return { date, seconds };
}

/**
 * Parses a POSIX TZ rule such as `EST5EDT,M3.2.0,M11.1.0` (America/New_York),
 * `GMT0BST,M3.5.0/1,M10.5.0` (Europe/London) or `<+0530>-5:30` (Asia/Kolkata).
 * POSIX offsets count west of UTC; the result counts east. A zone with summer
 * time must give its start and end rules.
 */
export function parseTimeZone(source: string): TimeZoneRule {
  const fail = (why: string): never => {
    throw new TrackerConfigError(
      `timeZone "${source}" is not a POSIX TZ rule (${why}). Example: "EST5EDT,M3.2.0,M11.1.0".`,
    );
  };
  const c = new Cursor(source);
  if (zoneName(c) === null) fail('expected a zone name of 3 or more letters, or <...>');
  const std = clock(c, 24);
  if (std === null || Number.isNaN(std)) return fail('expected a standard offset');
  if (c.peek() === '') return { source, stdOffset: -std, dst: null };
  if (zoneName(c) === null) fail('expected a summer-time zone name');
  let dstWest = std - 3600;
  if (c.peek() !== ',') {
    const given = clock(c, 24);
    if (given === null || Number.isNaN(given)) return fail('expected a summer-time offset');
    dstWest = given;
  }
  const start = transition(c);
  const end = start && transition(c);
  if (!start || !end) return fail('expected ",start[/time],end[/time]" rules for summer time');
  if (c.peek() !== '') fail(`unexpected "${source.slice(c.i)}"`);
  return { source, stdOffset: -std, dst: { offset: -dstWest, start, end } };
}

/** The local day number on which a date rule falls in `year`. */
function ruleDay(year: number, rule: DateRule): number {
  const jan1 = dayNumber(year, 1, 1);
  switch (rule.kind) {
    case 'julian1':
      return jan1 + rule.day - 1 + (isLeap(year) && rule.day >= 60 ? 1 : 0);
    case 'julian0':
      return jan1 + rule.day;
    case 'month': {
      const first = dayNumber(year, rule.month, 1);
      let day = first + ((rule.weekday - weekday(first) + 7) % 7) + (rule.week - 1) * 7;
      while (day - first >= monthLength(year, rule.month)) day -= 7;
      return day;
    }
  }
}

/** UTC seconds of a transition in `year`, given the offset in force just before it. */
function transitionAt(year: number, t: Transition, offsetBefore: number): number {
  return ruleDay(year, t.date) * DAY_SECONDS + t.seconds - offsetBefore;
}

/** Offset east of UTC, in seconds, in force at `utcSeconds`. */
export function offsetAt(zone: TimeZoneRule, utcSeconds: number): number {
  const { dst } = zone;
  if (!dst) return zone.stdOffset;
  const year = yearOf(Math.floor((utcSeconds + zone.stdOffset) / DAY_SECONDS));
  const start = transitionAt(year, dst.start, zone.stdOffset);
  const end = transitionAt(year, dst.end, dst.offset);
  const inDst =
    start < end
      ? utcSeconds >= start && utcSeconds < end
      : !(utcSeconds >= end && utcSeconds < start);
  return inDst ? dst.offset : zone.stdOffset;
}

/** Local day number, in `zone`, of an ISO 8601 instant. */
export function localDay(zone: TimeZoneRule, at: string): number {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) throw new TrackerConfigError(`"${at}" is not an ISO 8601 time.`);
  const seconds = Math.floor(ms / 1000);
  return Math.floor((seconds + offsetAt(zone, seconds)) / DAY_SECONDS);
}

/** A school calendar: which weekdays are school days, minus listed non-school dates. */
export type SchoolCalendar = {
  weekdays: ReadonlySet<number>;
  closed: ReadonlySet<number>;
};

/**
 * Counts school days `d` with `from < d <= to`, stopping once `limit` is reached.
 * The loop is bounded: each week holds at least one school day unless none are set.
 */
export function schoolDaysAfter(
  calendar: SchoolCalendar,
  from: number,
  to: number,
  limit: number,
): number {
  if (calendar.weekdays.size === 0) return 0;
  let count = 0;
  for (let d = from + 1; d <= to && count < limit; d += 1) {
    if (calendar.weekdays.has(weekday(d)) && !calendar.closed.has(d)) count += 1;
  }
  return count;
}

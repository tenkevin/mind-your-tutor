import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  dayNumber,
  isoDate,
  localDay,
  offsetAt,
  parseIsoDate,
  parseTimeZone,
  schoolDaysAfter,
  weekday,
} from './calendar.js';

// The class time zone without Intl (§8.1). Tests may use Intl, so each POSIX rule
// is checked against the IANA zone it stands for, hour by hour across DST changes.
const ZONES: [iana: string, posix: string][] = [
  ['America/New_York', 'EST5EDT,M3.2.0,M11.1.0'],
  ['America/Los_Angeles', 'PST8PDT,M3.2.0,M11.1.0'],
  ['America/Phoenix', 'MST7'],
  ['Europe/London', 'GMT0BST,M3.5.0/1,M10.5.0'],
  ['Europe/Berlin', 'CET-1CEST,M3.5.0,M10.5.0/3'],
  ['Australia/Sydney', 'AEST-10AEDT,M10.1.0,M4.1.0/3'],
  ['Pacific/Auckland', 'NZST-12NZDT,M9.5.0,M4.1.0/3'],
  ['America/Santiago', '<-04>4<-03>,M9.1.6/24,M4.1.6/24'],
  ['Asia/Kolkata', '<+0530>-5:30'],
  ['UTC', 'UTC0'],
];

function intlOffsetSeconds(iana: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: iana,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((local - Math.floor(utcMs / 1000) * 1000) / 1000);
}

describe('POSIX TZ rules', () => {
  it.each(ZONES)('%s matches Intl every hour of 2025–2027', (iana, posix) => {
    const zone = parseTimeZone(posix);
    const start = Date.UTC(2025, 0, 1) / 1000;
    const end = Date.UTC(2028, 0, 1) / 1000;
    const wrong: string[] = [];
    for (let t = start; t < end; t += 3600) {
      const expected = intlOffsetSeconds(iana, t * 1000);
      if (offsetAt(zone, t) !== expected)
        wrong.push(`${new Date(t * 1000).toISOString()}: ${offsetAt(zone, t)} ≠ ${expected}`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it.each(ZONES)('%s matches Intl at random instants 2023–2090 (current rules)', (iana, posix) => {
    const zone = parseTimeZone(posix);
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2023, 0, 1) / 1000, max: Date.UTC(2090, 0, 1) / 1000 }),
        (t) => {
          expect(offsetAt(zone, t)).toBe(intlOffsetSeconds(iana, t * 1000));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('gives local dates across the New York changes in 2026', () => {
    const ny = parseTimeZone('EST5EDT,M3.2.0,M11.1.0');
    expect(isoDate(localDay(ny, '2026-03-08T06:59:59Z'))).toBe('2026-03-08'); // 01:59:59 EST
    expect(isoDate(localDay(ny, '2026-03-09T03:59:59Z'))).toBe('2026-03-08'); // 23:59:59 EDT
    expect(isoDate(localDay(ny, '2026-03-09T04:00:00Z'))).toBe('2026-03-09');
    expect(isoDate(localDay(ny, '2026-11-02T04:59:59Z'))).toBe('2026-11-01'); // 23:59:59 EST
    expect(isoDate(localDay(ny, '2026-11-02T05:00:00Z'))).toBe('2026-11-02');
    expect(isoDate(localDay(ny, '2026-11-02T00:30:00+01:00'))).toBe('2026-11-01');
  });

  it.each([
    '',
    'America/New_York',
    'EST',
    'E5',
    'EST5EDT',
    'EST5EDT,M3.2.0',
    'EST5EDT,M13.2.0,M11.1.0',
    'EST5EDT,M3.6.0,M11.1.0',
    'EST5EDT,M3.2.7,M11.1.0',
    'EST25',
    'EST5x',
  ])('rejects "%s"', (rule) => {
    expect(() => parseTimeZone(rule)).toThrow(/POSIX TZ/);
  });
});

describe('dates', () => {
  it('round-trips day numbers and ISO dates', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (days) => {
        expect(parseIsoDate(isoDate(days))).toBe(days);
        expect(isoDate(days)).toBe(new Date(days * 86_400_000).toISOString().slice(0, 10));
      }),
    );
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2028-02-29')).toBe(dayNumber(2028, 2, 29));
    expect(weekday(dayNumber(2026, 10, 24))).toBe(6); // a Saturday
  });

  it('counts school days after a date, skipping weekends and holidays', () => {
    const calendar = {
      weekdays: new Set([1, 2, 3, 4, 5]),
      closed: new Set([dayNumber(2026, 10, 21)]),
    };
    const mon = dayNumber(2026, 10, 19);
    expect(schoolDaysAfter(calendar, mon, mon + 7, 10)).toBe(4); // Tue, Thu, Fri, Mon
    expect(schoolDaysAfter(calendar, mon, mon + 7, 2)).toBe(2);
    expect(schoolDaysAfter({ weekdays: new Set(), closed: new Set() }, mon, mon + 999_999, 5)).toBe(
      0,
    );
  });
});

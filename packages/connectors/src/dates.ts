// Spreadsheet dates are calendar dates, so they are worked out in UTC from the
// serial number itself. Nothing here reads the local time zone (C1-F12).

const DAY = 86_400_000;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * An Excel date serial as YYYY-MM-DD, or null when it isn't a date Excel can show.
 * The time of day, if any, is dropped. In the 1900 system, serial 60 is Excel's
 * phantom 29 February 1900, which has no real date.
 */
export function serialToIsoDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2_958_466) return null;
  const days = Math.floor(serial);
  let ms: number;
  if (date1904) ms = Date.UTC(1904, 0, 1) + days * DAY;
  else if (days < 60) ms = Date.UTC(1899, 11, 31) + days * DAY;
  else if (days === 60) return null;
  else ms = Date.UTC(1899, 11, 30) + days * DAY;
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A Date as the calendar date it shows in UTC, as readers that build UTC dates intend. */
export function dateToIsoDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

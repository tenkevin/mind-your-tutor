import { TAB_NAMES, type TabName } from '@ideamap/contracts';

/** A header or key compared loosely: case, spaces, underscores and hyphens ignored. */
export function looseName(name: string): string {
  return (
    name
      // Byte order marks, zero-width and non-breaking spaces that editors leave in headers.
      .replace(/[\ufeff\u200b-\u200d\u00a0]/g, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
  );
}

/** The file name without folders or extension: "packs/Ideas.csv" → "Ideas". */
export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/**
 * The tab a file or sheet name stands for, or null. "Ideas", "ideas.csv" and
 * Google Sheets' "Water cycle - Ideas.csv" all give Ideas.
 */
export function matchTab(name: string): TabName | null {
  // Browsers name a second download of Ideas.csv "Ideas (1).csv".
  const base = baseName(name)
    .replace(/\s*\(\d+\)$/, '')
    .trim();
  const whole = looseName(base);
  const last = looseName(base.split(/\s+-\s+|[_.]/).pop() ?? '');
  for (const tab of TAB_NAMES) {
    const key = tab.toLowerCase();
    if (whole === key || last === key) return tab;
  }
  return null;
}

// Counts failed sign-in callbacks per client IP over a sliding minute (F5-S7). Only
// failures count, so a whole class signing in from one school IP isn't slowed down.
// Kept in memory per API process; the bound on keys stops it growing without limit.

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

export class FailureLimiter {
  #hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number,
  ) {}

  #recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const hits = (this.#hits.get(key) ?? []).filter((t) => t > since);
    if (hits.length === 0) this.#hits.delete(key);
    else this.#hits.set(key, hits);
    return hits;
  }

  blocked(key: string): boolean {
    return this.#recent(key).length >= this.limit;
  }

  fail(key: string): void {
    const hits = this.#recent(key);
    if (hits.length === 0 && this.#hits.size >= MAX_KEYS) {
      // Drop the oldest key; Map keeps insertion order.
      const oldest = this.#hits.keys().next().value;
      if (oldest !== undefined) this.#hits.delete(oldest);
    }
    this.#hits.set(key, [...hits, this.now()]);
  }
}

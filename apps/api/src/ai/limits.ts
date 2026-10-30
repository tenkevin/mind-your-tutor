// Per-student and per-class rate limits for AI calls (ARCHITECTURE.md §9; A1-F4). A
// sliding window per key, kept in memory per API process, like the sign-in limiter
// (limiter.ts). A call counts against both its student and its class; it goes ahead
// only if both have room, so one busy student can't use up the class's allowance
// unnoticed, and a whole class over its limit is held back together.

export interface AiLimits {
  /** Calls one user may make per window, across their classes. */
  perStudent: number;
  /** Calls one class may make per window, across its students and staff. */
  perClass: number;
  windowMs: number;
}

const MAX_KEYS = 50_000;

export class AiRateLimiter {
  #hits = new Map<string, number[]>();

  constructor(
    private readonly limits: AiLimits,
    private readonly now: () => number,
  ) {}

  #recent(key: string): number[] {
    const since = this.now() - this.limits.windowMs;
    const hits = (this.#hits.get(key) ?? []).filter((t) => t > since);
    if (hits.length === 0) this.#hits.delete(key);
    else this.#hits.set(key, hits);
    return hits;
  }

  /** Seconds until the oldest hit leaves the window, at least 1. */
  #retryAfter(hits: number[]): number {
    const free = hits[0]! + this.limits.windowMs - this.now();
    return Math.max(1, Math.ceil(free / 1000));
  }

  #record(key: string, hits: number[]): void {
    if (hits.length === 0 && this.#hits.size >= MAX_KEYS) {
      // Drop the oldest key; Map keeps insertion order.
      const oldest = this.#hits.keys().next().value;
      if (oldest !== undefined) this.#hits.delete(oldest);
    }
    this.#hits.set(key, [...hits, this.now()]);
  }

  /**
   * Take one call for this user in this class. Returns null if it may go ahead (and
   * counts it), or how many seconds to wait.
   */
  take(userId: string, classId: string): { retryAfter: number } | null {
    const userKey = `user:${userId}`;
    const classKey = `class:${classId}`;
    const user = this.#recent(userKey);
    const klass = this.#recent(classKey);
    const waits: number[] = [];
    if (user.length >= this.limits.perStudent) waits.push(this.#retryAfter(user));
    if (klass.length >= this.limits.perClass) waits.push(this.#retryAfter(klass));
    if (waits.length > 0) return { retryAfter: Math.max(...waits) };
    this.#record(userKey, user);
    this.#record(classKey, klass);
    return null;
  }
}

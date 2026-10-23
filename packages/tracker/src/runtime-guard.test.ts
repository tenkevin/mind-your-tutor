import nodeCrypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import nodeTimers from 'node:timers';
import { describe, expect, it, vi } from 'vitest';

// Runtime backstop for the tracker determinism lint (ARCHITECTURE.md §8.1).
// Lint can't see every way to reach the clock, randomness or I/O (computed
// names, prototype chains, code in imported packages), so this test makes all
// of them throw, then imports the tracker and calls every export.

type Tracker = typeof import('./index.js');

// How to exercise each tracker export. Typed against the module, so adding an
// export without a sample here fails typecheck. Functions list the argument
// lists to call them with; build them from SAMPLE_EVENTS where they take events.
// Until a function has a sample, the guard calls it with () and (SAMPLE_EVENTS).
type Sample = { value: true } | { calls: unknown[][] };

// Shaped like InteractionEvent (ARCHITECTURE.md §8.2). Times are fixed strings.
const SAMPLE_EVENTS = [
  {
    id: '01J0000000000000000000000A',
    studentId: 's-1',
    classId: 'c-1',
    versionId: 'v-1',
    seq: 1,
    at: '2026-01-05T09:00:00.000Z',
    type: 'session.started',
    payload: {},
  },
  {
    id: '01J0000000000000000000000B',
    studentId: 's-1',
    classId: 'c-1',
    versionId: 'v-1',
    seq: 2,
    at: '2026-01-05T09:00:04.250Z',
    type: 'idea.opened',
    payload: { ideaId: 'evaporation' },
  },
] as const;

const SAMPLES = {
  packageName: { value: true },
} satisfies Record<keyof Tracker, Sample>;

class NondeterminismError extends Error {
  override name = 'NondeterminismError';
}

// The test runner (vitest, vite) times its own module loading while the guard
// is on. A call made directly by the runner goes through to the real API; any
// other caller, tracker code included, gets an error.
const RUNNER = /[\\/]node_modules[\\/](\.pnpm[\\/])?(@vitest|vitest|vite)[@+\\/]/;
function fromRunner(): boolean {
  // Stack: the Error line, fromRunner, the guard wrapper, then its caller.
  const caller = (new Error().stack ?? '').split('\n')[3] ?? '';
  return RUNNER.test(caller);
}

const hits: string[] = [];
function fail(what: string): never {
  hits.push(what);
  throw new NondeterminismError(
    `${what} was used while the tracker runtime guard was on. Tracker code must be ` +
      'deterministic: take time, ids and seeds from event data instead. See ARCHITECTURE.md §8.',
  );
}
type Fn = (...args: unknown[]) => unknown;
const thrower = (what: string, real: unknown) =>
  function guarded(this: unknown, ...args: unknown[]) {
    if (fromRunner()) return Reflect.apply(real as Fn, this, args);
    fail(what);
  };
// Stands in for a whole global object: any use of it throws.
const throwingObject = (what: string, real: unknown) =>
  new Proxy(function () {}, {
    get: (_, key) => {
      if (!fromRunner() || real == null) fail(`${what}.${String(key)}`);
      const value: unknown = Reflect.get(real as object, key);
      return typeof value === 'function' ? value.bind(real) : value;
    },
    set: (_, key) => fail(`${what}.${String(key)}`),
    has: (_, key) => fail(`${what}.${String(key)}`),
    apply: () => fail(`${what}()`),
    construct: () => fail(`new ${what}()`),
    ownKeys: () => fail(`Object.keys(${what})`),
  });

type Restore = () => void;
function patch(target: object, key: PropertyKey, value: unknown): Restore {
  const before = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  return () => {
    if (before) Object.defineProperty(target, key, before);
    else delete (target as Record<PropertyKey, unknown>)[key];
  };
}

const LOCAL_TIME_METHODS = [
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'getTimezoneOffset',
  'getYear',
  'toString',
  'toDateString',
  'toTimeString',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
] as const;
const TIMERS = [
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
] as const;
const HOST_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'MessageChannel',
  'BroadcastChannel',
  'WeakRef',
  'FinalizationRegistry',
  'navigator',
  'Temporal',
  'Intl',
  'crypto',
] as const;

// Pushes an undo step for each patch, so a failure part way through still
// restores everything already patched.
function install(restores: Restore[]): void {
  const g = globalThis as Record<string, unknown>;
  // Replaces target[key] with a function that throws.
  const guard = (target: object, key: PropertyKey, what: string) => {
    const real: unknown = Reflect.get(target, key);
    restores.push(patch(target, key, thrower(what, real)));
  };
  const guardGlobal = (name: string) => {
    restores.push(patch(g, name, throwingObject(name, g[name])));
  };

  // Date: new Date(eventTime), Date.parse and Date.UTC still work. Reading the
  // clock or the local time zone throws, however Date is reached (including
  // new Date(0).constructor and Function('return Date.now()')).
  const RealDate = Date;
  const GuardedDate: DateConstructor = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      if (args.length === 0 && !fromRunner()) fail('new Date()');
      return Reflect.construct(target, args, newTarget === GuardedDate ? target : newTarget);
    },
    apply: (target, self, args) =>
      fromRunner() ? Reflect.apply(target, self, args) : fail('Date()'),
  });
  restores.push(patch(g, 'Date', GuardedDate));
  restores.push(patch(RealDate.prototype, 'constructor', GuardedDate));
  guard(RealDate, 'now', 'Date.now()');
  for (const m of LOCAL_TIME_METHODS) guard(RealDate.prototype, m, `Date#${m}()`);

  guard(Math, 'random', 'Math.random()');

  // Locale-dependent formatting and comparison (the Intl global is below).
  guard(String.prototype, 'localeCompare', 'String#localeCompare()');
  guard(String.prototype, 'toLocaleUpperCase', 'String#toLocaleUpperCase()');
  guard(String.prototype, 'toLocaleLowerCase', 'String#toLocaleLowerCase()');
  guard(Number.prototype, 'toLocaleString', 'Number#toLocaleString()');
  guard(BigInt.prototype, 'toLocaleString', 'BigInt#toLocaleString()');
  guard(Array.prototype, 'toLocaleString', 'Array#toLocaleString()');

  // Clocks (the performance global is last, below).
  guard(performance, 'now', 'performance.now()');
  const realBigint = process.hrtime.bigint;
  for (const m of ['hrtime', 'uptime', 'cpuUsage', 'memoryUsage', 'resourceUsage'] as const) {
    guard(process, m, `process.${m}()`);
  }
  // The guarded hrtime is a new function, so this needs no undo step.
  Object.assign(process.hrtime, { bigint: thrower('process.hrtime.bigint()', realBigint) });

  // Randomness through node:crypto (the crypto global is below).
  for (const m of ['randomUUID', 'randomBytes', 'randomInt', 'randomFillSync', 'randomFill']) {
    guard(nodeCrypto, m, `crypto.${m}()`);
  }
  // node:crypto's getRandomValues can't be redefined, but it calls this one.
  const webCrypto = Object.getPrototypeOf(nodeCrypto.webcrypto) as object;
  guard(webCrypto, 'getRandomValues', 'crypto.getRandomValues()');
  guard(webCrypto, 'randomUUID', 'crypto.randomUUID()');

  // Timers, through the globals and through node:timers.
  for (const t of TIMERS) {
    guard(g, t, `${t}()`);
    if (t in nodeTimers) guard(nodeTimers, t, `${t}()`);
  }
  guard(AbortSignal, 'timeout', 'AbortSignal.timeout()');
  guard(Atomics, 'wait', 'Atomics.wait()');
  guard(Atomics, 'waitAsync', 'Atomics.waitAsync()');

  // I/O and host state.
  for (const name of HOST_GLOBALS) guardGlobal(name);
  // Last: reading some globals above (WebSocket) loads code that uses it.
  guardGlobal('performance');

  syncBuiltinESMExports();
}

async function guarded<T>(run: () => T | Promise<T>): Promise<T> {
  hits.length = 0;
  const restores: Restore[] = [];
  try {
    install(restores);
    return await run();
  } finally {
    for (const restore of restores.reverse()) restore();
    syncBuiltinESMExports();
  }
}

describe('tracker runtime guard', () => {
  it('imports and calls every tracker export without touching the clock, randomness or I/O', async () => {
    vi.resetModules();
    const errors: string[] = [];
    const results = await guarded(async () => {
      // Imported under the guard so module-level code is covered too.
      const tracker: Record<string, unknown> = await import('./index.js');
      const out: Record<string, unknown[]> = {};
      for (const [name, value] of Object.entries(tracker)) {
        if (typeof value !== 'function') {
          out[name] = [value, value];
          continue;
        }
        // An export with no sample yet (typecheck flags it) still gets called.
        const sample = (SAMPLES as Record<string, Sample | undefined>)[name];
        const calls = sample && 'calls' in sample ? sample.calls : [[], [SAMPLE_EVENTS]];
        // Each call twice: the same input must give the same output.
        out[name] = calls.flatMap((args) =>
          [0, 1].map(() => {
            try {
              return value(...args) as unknown;
            } catch (error) {
              errors.push(`${name}: ${String(error)}`);
              return undefined;
            }
          }),
        );
      }
      return out;
    });

    // Checked first, so an export that caught a guard error still fails here.
    expect(hits).toEqual([]);
    expect(errors).toEqual([]);
    expect(Object.keys(results).sort()).toEqual(Object.keys(SAMPLES).sort());
    for (const outputs of Object.values(results)) {
      for (let i = 0; i < outputs.length; i += 2) expect(outputs[i + 1]).toEqual(outputs[i]);
    }
  });

  // The guard itself: each of these must throw while it is on.
  it.each<[string, () => unknown]>([
    ['Date.now()', () => Date.now()],
    ['new Date()', () => new Date()],
    ['Date()', () => Date()],
    ['new Date(...[])', () => new Date(...([] as []))],
    ['new Date(0).constructor.now()', () => (new Date(0).constructor as DateConstructor).now()],
    [
      'new (Object.getPrototypeOf(new Date(0)).constructor)()',
      () => new (Object.getPrototypeOf(new Date(0)).constructor as DateConstructor)(),
    ],
    ['Reflect.construct(Date, [])', () => Reflect.construct(Date, [])],
    ["Function('return Date.now()')", () => Function('return Date.now()')()],
    [
      "(() => {}).constructor('return Math.random()')",
      () => (() => {}).constructor('return Math.random()')(),
    ],
    ['new Date(0).getHours()', () => new Date(0).getHours()],
    ['new Date(0).toString()', () => new Date(0).toString()],
    ['Math.random()', () => Math.random()],
    [
      "Math['ran' + 'dom']()",
      () => (Math as unknown as Record<string, () => number>)['ran' + 'dom']!(),
    ],
    ['performance.now()', () => performance.now()],
    ['process.hrtime.bigint()', () => process.hrtime.bigint()],
    ['new Intl.DateTimeFormat()', () => new Intl.DateTimeFormat()],
    ["'a'.localeCompare('b')", () => 'a'.localeCompare('b')],
    ['(1234.5).toLocaleString()', () => (1234.5).toLocaleString()],
    ['crypto.randomUUID()', () => crypto.randomUUID()],
    ['crypto.getRandomValues()', () => crypto.getRandomValues(new Uint8Array(4))],
    ["node:crypto's randomUUID()", () => nodeCrypto.randomUUID()],
    ["node:crypto's randomBytes()", () => nodeCrypto.randomBytes(4)],
    ['setTimeout()', () => setTimeout(() => {}, 0)],
    ['setInterval()', () => setInterval(() => {}, 1)],
    ['setImmediate()', () => setImmediate(() => {})],
    ["node:timers' setTimeout()", () => nodeTimers.setTimeout(() => {}, 0)],
    ['queueMicrotask()', () => queueMicrotask(() => {})],
    ["fetch('/x')", () => fetch('/x')],
    ['AbortSignal.timeout(1)', () => AbortSignal.timeout(1)],
    ['new MessageChannel()', () => new MessageChannel()],
    ['new WeakRef({})', () => new WeakRef({})],
    ['navigator.hardwareConcurrency', () => navigator.hardwareConcurrency],
  ])('throws on %s', async (_, probe) => {
    await expect(guarded(probe)).rejects.toThrow(NondeterminismError);
  });

  it.each<[string, () => unknown]>([
    ["new Date('2026-01-05T09:00:00Z')", () => new Date('2026-01-05T09:00:00Z').toISOString()],
    ['new Date(0).getUTCHours()', () => new Date(0).getUTCHours()],
    ['new Date(0) instanceof Date', () => new Date(0) instanceof Date],
    ["Date.parse('2026-01-05T09:00:00Z')", () => Date.parse('2026-01-05T09:00:00Z')],
    ['Date.UTC(2026, 0, 5)', () => Date.UTC(2026, 0, 5)],
    ['Math.max(1, 2)', () => Math.max(1, 2)],
    ['JSON.stringify(SAMPLE_EVENTS)', () => JSON.stringify(SAMPLE_EVENTS)],
  ])('allows %s', async (_, probe) => {
    await guarded(probe);
    expect(hits).toEqual([]);
  });

  it('restores everything afterwards', async () => {
    await expect(guarded(() => Date.now())).rejects.toThrow();
    expect(typeof Date.now()).toBe('number');
    expect(new Date(0).constructor).toBe(Date);
    expect(typeof Math.random()).toBe('number');
    expect(typeof performance.now()).toBe('number');
    expect(typeof crypto.randomUUID()).toBe('string');
    expect(typeof nodeCrypto.randomUUID()).toBe('string');
  });
});

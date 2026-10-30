import {
  TrackerConfigError,
  parseIsoDate,
  parseTimeZone,
  type SchoolCalendar,
  type TimeZoneRule,
} from './calendar.js';

// What the rules need to know about a class and its curriculum versions. The
// server builds this from the published versions (§7), the class settings (§6)
// and T5's effective rarity; the tracker never looks anything up itself (§8.1).

/** The rules versions this package implements (§8.1: old results stay reproducible). */
export const RULES_VERSIONS = [1] as const;
export type RulesVersion = (typeof RULES_VERSIONS)[number];

/** A card's rarity after T5 resolves `auto` and class overrides. */
export type EffectiveRarity = 'Common' | 'Rare' | 'Legendary';

export type TrackerIdea = {
  /** Ideas.idea_id */
  id: string;
  /** Ideas.unit */
  unit: number;
  /** Ideas.requires: the ideas that must be mastered first. */
  requires: readonly string[];
  rarity: EffectiveRarity;
};

export type TrackerUnit = {
  /** Units.unit */
  unit: number;
  /** The class's effective due date, `YYYY-MM-DD`; a unit with one is a mission (T4). */
  dueDate: string | null;
};

/** One published curriculum version, as the class sees it. */
export type TrackerCurriculum = {
  ideas: readonly TrackerIdea[];
  units: readonly TrackerUnit[];
};

export type TrackerConfig = {
  rulesVersion: RulesVersion;
  /** Course.pass_mark after class overrides, 0–100. Default 70. */
  passMark?: number;
  /** Questions per quiz, 3–12. Default 8. */
  quizLength?: number;
  /** The class time zone as a POSIX TZ rule, e.g. `EST5EDT,M3.2.0,M11.1.0`. */
  timeZone: string;
  /** School weekdays, 0 = Sunday … 6 = Saturday. Default Monday to Friday. */
  schoolDays?: readonly number[];
  /** Non-school dates (holidays), `YYYY-MM-DD` in the class time zone. */
  nonSchoolDates?: readonly string[];
  /** D24: the student is opted out of tracing for audits, aggregates and research. */
  optedOut?: boolean;
  /** Every curriculum version the student's events name, by versionId. */
  versions: Readonly<Record<string, TrackerCurriculum>>;
  /**
   * The version the class is pinned to now (a key of `versions`). When set, it decides
   * `archived`, rarity and the current version; a late event stamped with an older
   * version no longer moves it back. Without it, the latest event's version is current.
   */
  currentVersionId?: string;
};

export const DEFAULTS = {
  passMark: 70,
  quizLength: 8,
  schoolDays: [1, 2, 3, 4, 5],
  /** "May need help" (b): school days without a pass on a stalled prerequisite. */
  stalledSchoolDays: 5,
  /** "May need help" (a): wrong answers after a hint. */
  wrongAfterHint: 3,
} as const;

export type CompiledVersion = {
  ideas: ReadonlyMap<string, TrackerIdea>;
  /** Idea ids in sheet order. */
  ideaOrder: readonly string[];
  /** Unit number → its idea ids, in sheet order. */
  unitIdeas: ReadonlyMap<number, readonly string[]>;
  /** Units in sheet order. */
  units: readonly TrackerUnit[];
  /** Fingerprint of everything in the version the rules read (see `fingerprint`). */
  hash: string;
};

export type CompiledConfig = {
  rulesVersion: RulesVersion;
  passMark: number;
  quizLength: number;
  zone: TimeZoneRule;
  calendar: SchoolCalendar;
  optedOut: boolean;
  versions: ReadonlyMap<string, CompiledVersion>;
  currentVersionId: string | null;
  /** Fingerprint of the settings that change results, not counting the versions. */
  settingsHash: string;
};

/** Key-sorted JSON, so equal values always give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A 64-bit FNV-1a hash of a value's canonical JSON, as hex. Not a security hash: it
 * only tells a snapshot that the config it was built with has changed.
 */
export function fingerprint(value: unknown): string {
  const text = canonical(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function integerIn(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TrackerConfigError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function compileVersion(versionId: string, curriculum: TrackerCurriculum): CompiledVersion {
  const ideas = new Map<string, TrackerIdea>();
  const unitIdeas = new Map<number, string[]>();
  for (const idea of curriculum.ideas) {
    if (ideas.has(idea.id)) {
      throw new TrackerConfigError(`Version ${versionId} lists idea "${idea.id}" twice.`);
    }
    ideas.set(idea.id, idea);
    const list = unitIdeas.get(idea.unit) ?? [];
    list.push(idea.id);
    unitIdeas.set(idea.unit, list);
  }
  const seen = new Set<number>();
  for (const unit of curriculum.units) {
    if (seen.has(unit.unit)) {
      throw new TrackerConfigError(`Version ${versionId} lists unit ${unit.unit} twice.`);
    }
    seen.add(unit.unit);
    if (unit.dueDate !== null && parseIsoDate(unit.dueDate) === null) {
      throw new TrackerConfigError(`Unit ${unit.unit} has an invalid dueDate "${unit.dueDate}".`);
    }
  }
  return {
    ideas,
    ideaOrder: [...ideas.keys()],
    unitIdeas,
    units: curriculum.units,
    hash: fingerprint(curriculum),
  };
}

// Compiling is pure, so it is cached per config object. A WeakMap holds no
// clock or randomness; the same config always compiles to the same result.
const compiled = new WeakMap<TrackerConfig, CompiledConfig>();

export function compileConfig(config: TrackerConfig): CompiledConfig {
  const cached = compiled.get(config);
  if (cached) return cached;
  if (!(RULES_VERSIONS as readonly number[]).includes(config.rulesVersion)) {
    throw new TrackerConfigError(
      `rulesVersion ${String(config.rulesVersion)} is not implemented; this tracker has ${RULES_VERSIONS.join(', ')}.`,
    );
  }
  const closed = new Set<number>();
  for (const date of config.nonSchoolDates ?? []) {
    const day = parseIsoDate(date);
    if (day === null) throw new TrackerConfigError(`nonSchoolDates has an invalid date "${date}".`);
    closed.add(day);
  }
  const weekdays = new Set<number>();
  for (const d of config.schoolDays ?? DEFAULTS.schoolDays)
    weekdays.add(integerIn('schoolDays', d, 0, 6));
  const versions = new Map<string, CompiledVersion>();
  for (const versionId of Object.keys(config.versions)) {
    versions.set(
      versionId,
      compileVersion(versionId, config.versions[versionId] as TrackerCurriculum),
    );
  }
  const currentVersionId = config.currentVersionId ?? null;
  if (currentVersionId !== null && !versions.has(currentVersionId)) {
    throw new TrackerConfigError(
      `currentVersionId "${currentVersionId}" is not one of the config's versions.`,
    );
  }
  const passMark = integerIn('passMark', config.passMark ?? DEFAULTS.passMark, 0, 100);
  const quizLength = integerIn('quizLength', config.quizLength ?? DEFAULTS.quizLength, 3, 12);
  const zone = parseTimeZone(config.timeZone);
  const result: CompiledConfig = {
    rulesVersion: config.rulesVersion,
    passMark,
    quizLength,
    zone,
    calendar: { weekdays, closed },
    optedOut: config.optedOut === true,
    versions,
    currentVersionId,
    // optedOut is re-applied on every run and the version list grows with each
    // publish, so neither belongs here.
    settingsHash: fingerprint({
      rulesVersion: config.rulesVersion,
      passMark,
      quizLength,
      timeZone: config.timeZone,
      schoolDays: [...weekdays].sort(),
      nonSchoolDates: [...closed].sort(),
    }),
  };
  compiled.set(config, result);
  return result;
}

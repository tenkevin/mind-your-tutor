import type { InteractionEvent } from '@ideamap/contracts';
import { TrackerConfigError, isoDate, localDay, parseIsoDate } from './calendar.js';
import {
  compileConfig,
  type CompiledConfig,
  type EffectiveRarity,
  type TrackerConfig,
} from './config.js';
import {
  applyV1,
  initialStateV1,
  stalledSignals,
  type HelpSignal,
  type TrackerState,
  type XpEntry,
  type XpSink,
} from './rules-v1.js';

// The interaction tracker (ARCHITECTURE.md §8.1, §8.3):
//
//   state = events.reduce(apply, initialState(classConfig, rulesVersion))
//
// Pure functions of their arguments. No clock, randomness, network or model
// calls: time comes from the events, or from an `asOf` the caller passes in.

export const packageName = '@ideamap/tracker';

export { TrackerConfigError, parseTimeZone } from './calendar.js';
export { DEFAULTS, RULES_VERSIONS } from './config.js';
export type {
  EffectiveRarity,
  RulesVersion,
  TrackerConfig,
  TrackerCurriculum,
  TrackerIdea,
  TrackerUnit,
} from './config.js';
export { comboMultiplier, scorePercent } from './rules-v1.js';
export type {
  HelpSignal,
  IdeaProgress,
  TrackerState,
  UnitProgress,
  XpEntry,
  XpSource,
} from './rules-v1.js';

// Plain JSON, so a copy is a faithful snapshot and never shares structure.
function clone(state: TrackerState): TrackerState {
  return JSON.parse(JSON.stringify(state)) as TrackerState;
}

/** The empty state for a class config. */
export function initialState(config: TrackerConfig): TrackerState {
  return initialStateV1(compileConfig(config));
}

// A snapshot is only valid under the config it was built with (N2). Settings that
// change results (pass mark, quiz length, calendar, rules version) must match; a version
// the snapshot already used must be unchanged. A newly published version is fine: it
// adds a key to `versions` and alters nothing already applied.
function checkSnapshotConfig(config: CompiledConfig, from: TrackerState) {
  if (from.settingsHash !== config.settingsHash) {
    throw new TrackerConfigError(
      'The snapshot was built under different class settings (pass mark, quiz length, time zone or calendar); rebuild it by replaying events.',
    );
  }
  for (const [versionId, hash] of Object.entries(from.versionHashes)) {
    if (config.versions.get(versionId)?.hash !== hash) {
      throw new TrackerConfigError(
        `The snapshot used version ${versionId}, which the config no longer matches; rebuild it by replaying events.`,
      );
    }
  }
}

function run(
  config: CompiledConfig,
  events: readonly InteractionEvent[],
  from: TrackerState | undefined,
  sink?: XpSink,
) {
  if (from && from.rulesVersion !== config.rulesVersion) {
    throw new TrackerConfigError(
      `The snapshot is rulesVersion ${String(from.rulesVersion)}, the config ${config.rulesVersion}; rebuild it by replaying events.`,
    );
  }
  if (from) checkSnapshotConfig(config, from);
  const state = from ? clone(from) : initialStateV1(config);
  for (const event of events) {
    // Already applied (a snapshot covers it, or the event was resent).
    if (event.seq <= state.lastSeq) continue;
    applyV1(state, event, config, sink);
  }
  // D24 is a property of the student now, not of when the snapshot was taken.
  state.excludedFromAuditsAndResearch = config.optedOut;
  return state;
}

/**
 * Replays one student's events, in `seq` order, from the empty state or from a
 * snapshot. Events at or below the snapshot's `lastSeq` are skipped, so replaying
 * the whole log onto a snapshot gives the same state as replaying it from scratch.
 */
export function replay(
  config: TrackerConfig,
  events: readonly InteractionEvent[],
  from?: TrackerState,
): TrackerState {
  return run(compileConfig(config), events, from);
}

/** Applies one event and returns the new state; the input state is not changed. */
export function apply(
  config: TrackerConfig,
  state: TrackerState,
  event: InteractionEvent,
): TrackerState {
  return run(compileConfig(config), [event], state);
}

/** Every XP award with the event that earned it (§8.1 traceability); sums to `state.xp.total`. */
export function xpLedger(config: TrackerConfig, events: readonly InteractionEvent[]): XpEntry[] {
  const entries: XpEntry[] = [];
  run(compileConfig(config), events, undefined, (entry) => entries.push(entry));
  return entries;
}

export type Card = {
  ideaId: string;
  rarity: EffectiveRarity | null;
  archived: boolean;
  eventIds: string[];
};

/** What a student may see of §8.3 rulesVersion 1, each output with the events behind it. */
export type Progress = {
  rulesVersion: 1;
  asOf: string | null;
  quizLength: number;
  passMark: number;
  ideas: {
    ideaId: string;
    masteryPercent: number | null;
    mastered: boolean;
    unlocked: boolean;
    /** False when a publish removed the idea; its progress is archived (§7). */
    archived: boolean;
    eventIds: { mastery: string[]; mastered: string[]; unlocked: string[] };
  }[];
  units: {
    unit: number;
    complete: boolean;
    latestVerdict: 'pass' | 'retry' | null;
    eventIds: string[];
  }[];
  xp: TrackerState['xp'];
  streak: { days: number; lastPassDate: string | null; eventIds: string[] };
  cards: Card[];
  /** D24 */
  excludedFromAuditsAndResearch: boolean;
};

/** The teacher's view: everything the student sees, plus "may need help" (D21). */
export type TeacherProgress = Progress & {
  mayNeedHelp: HelpSignal[];
};

/**
 * Reads the student's outputs out of a state. Teacher-only signals are not in it
 * (D21); use `teacherProgress`. `asOf` (ISO 8601) is the moment to evaluate
 * time-based rules at, such as a streak broken by a missed day or a prerequisite
 * stalled for 5 school days; it defaults to the last event's time. The caller
 * supplies it, so the result stays a pure function of its inputs.
 */
export function progress(config: TrackerConfig, state: TrackerState, asOf?: string): Progress {
  const compiled = compileConfig(config);
  const at = asOf ?? state.lastAt;
  const ideas = Object.entries(state.ideas).map(([ideaId, idea]) => ({
    ideaId,
    masteryPercent: idea.masteryPercent,
    mastered: idea.mastered,
    unlocked: idea.unlocked,
    archived: !idea.inCurrentVersion,
    eventIds: {
      mastery: idea.masteryEventId ? [idea.masteryEventId] : [],
      mastered: idea.masteredEventId ? [idea.masteredEventId] : [],
      unlocked: idea.unlockedEventIds,
    },
  }));
  const units = Object.entries(state.units)
    .map(([unit, u]) => ({
      unit: Number(unit),
      complete: u.complete,
      latestVerdict: u.latestVerdict,
      eventIds: u.complete
        ? u.completeEventIds
        : u.latestVerdictEventId
          ? [u.latestVerdictEventId]
          : [],
    }))
    .sort((a, b) => a.unit - b.unit);
  let streak = { ...state.streak, eventIds: [...state.streak.eventIds] };
  if (at !== null && streak.lastPassDate !== null) {
    const gap = localDay(compiled.zone, at) - (parseIsoDate(streak.lastPassDate) as number);
    if (gap > 1) streak = { days: 0, lastPassDate: streak.lastPassDate, eventIds: [] };
  }
  const cards = Object.entries(state.ideas)
    .filter(([, idea]) => idea.mastered)
    .map(([ideaId, idea]) => ({
      ideaId,
      rarity: idea.rarity,
      archived: !idea.inCurrentVersion,
      eventIds: [idea.masteredEventId as string],
    }));
  return {
    rulesVersion: state.rulesVersion,
    asOf: at,
    quizLength: compiled.quizLength,
    passMark: compiled.passMark,
    ideas,
    units,
    xp: { ...state.xp },
    streak,
    cards,
    excludedFromAuditsAndResearch: compiled.optedOut,
  };
}

/**
 * The teacher's reading of a state (D21): the student view plus `mayNeedHelp`, which
 * must never reach a student-facing response. Same `asOf` rules as `progress`.
 */
export function teacherProgress(
  config: TrackerConfig,
  state: TrackerState,
  asOf?: string,
): TeacherProgress {
  const student = progress(config, state, asOf);
  const at = student.asOf;
  const mayNeedHelp = [
    ...Object.values(state.helpSignals),
    ...(at === null ? [] : stalledSignals(state, compileConfig(config), at)),
  ];
  return { ...student, mayNeedHelp };
}

/** The class-time-zone date (`YYYY-MM-DD`) of an instant, as the streak counts days. */
export function classDate(config: TrackerConfig, at: string): string {
  return isoDate(localDay(compileConfig(config).zone, at));
}

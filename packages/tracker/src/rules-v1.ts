import type { InteractionEvent } from '@ideamap/contracts';
import {
  TrackerConfigError,
  isoDate,
  localDay,
  parseIsoDate,
  schoolDaysAfter,
} from './calendar.js';
import {
  DEFAULTS,
  type CompiledConfig,
  type CompiledVersion,
  type EffectiveRarity,
} from './config.js';

// rulesVersion 1 (ARCHITECTURE.md §8.3). Each rule below names the §8.3 row it
// implements. Changing what any rule outputs means a new rulesVersion, never an
// edit here (§8.1): old results must stay reproducible.
//
// The state is plain JSON, so a snapshot is JSON.stringify(state) and replaying
// from it gives byte-identical results. Durations (idea.active_time,
// secondsToAnswer) are never read: D20 allows them to be shown, not scored.

export type IdeaProgress = {
  /** Best finished score as a whole percentage, or null before any finished quiz. */
  masteryPercent: number | null;
  /** The quiz.finished event behind masteryPercent. */
  masteryEventId: string | null;
  mastered: boolean;
  /** The first quiz.finished that scored above the pass mark. */
  masteredEventId: string | null;
  unlocked: boolean;
  /** Event time at which the idea unlocked. */
  unlockedAt: string | null;
  /** The mastery events of its prerequisites, or the first event seen if it has none. */
  unlockedEventIds: string[];
  /** Rarity in the current version (or the last version that had the idea). */
  rarity: EffectiveRarity | null;
  /** False once a publish removes the idea: progress is archived, never deleted (§7). */
  inCurrentVersion: boolean;
};

export type UnitProgress = {
  latestVerdict: 'pass' | 'retry' | null;
  latestVerdictEventId: string | null;
  complete: boolean;
  /** The events that made it complete: each idea's mastery, then the passing verdict. */
  completeEventIds: string[];
};

export type HelpSignal = {
  kind: 'wrong-after-hint' | 'stalled-prerequisite';
  ideaId: string;
  /** For `stalled-prerequisite`: the mission whose prerequisite is stalled. */
  missionId: number | null;
  /** Shown to the teacher (D20, D21). */
  reason: string;
  since: string;
  eventIds: string[];
};

export type XpSource = 'answer' | 'pass' | 'perfect' | 'link' | 'unit';

export type TrackerState = {
  rulesVersion: 1;
  studentId: string | null;
  /** The last applied event's seq; events at or below it are already in the state. */
  lastSeq: number;
  lastAt: string | null;
  lastEventId: string | null;
  versionId: string | null;
  /** Fingerprint of the settings this state was built under; another config can't continue it. */
  settingsHash: string;
  /** Fingerprint of each curriculum version the state has used, by versionId. */
  versionHashes: Record<string, string>;
  /** D24: same outputs, but excluded from D16 audits, aggregates and D25 research. */
  excludedFromAuditsAndResearch: boolean;
  ideas: Record<string, IdeaProgress>;
  /** Keyed by unit number. */
  units: Record<string, UnitProgress>;
  /** Quizzes started and not yet finished: attemptId → idea and combo. */
  attempts: Record<string, { ideaId: string; combo: number }>;
  xp: { total: number } & Record<XpSource, number>;
  streak: { days: number; lastPassDate: string | null; eventIds: string[] };
  /** Pending "wrong after hint" counts per idea. */
  hints: Record<string, { hintEventId: string; wrongEventIds: string[] }>;
  /** Raised "wrong after hint" signals, by idea. */
  helpSignals: Record<string, HelpSignal>;
  /** Missions the student completed, by unit number. */
  missionsCompleted: Record<string, string>;
};

export type XpEntry = { eventId: string; source: XpSource; points: number };
export type XpSink = (entry: XpEntry) => void;

const own = (record: object, key: string) => Object.hasOwn(record, key);

export function initialStateV1(config: CompiledConfig): TrackerState {
  return {
    rulesVersion: 1,
    studentId: null,
    lastSeq: 0,
    lastAt: null,
    lastEventId: null,
    versionId: null,
    settingsHash: config.settingsHash,
    versionHashes: {},
    excludedFromAuditsAndResearch: config.optedOut,
    ideas: {},
    units: {},
    attempts: {},
    xp: { total: 0, answer: 0, pass: 0, perfect: 0, link: 0, unit: 0 },
    streak: { days: 0, lastPassDate: null, eventIds: [] },
    hints: {},
    helpSignals: {},
    missionsCompleted: {},
  };
}

/** XP combo multiplier (§8.3): ×4 at 6+ in a row, ×3 at 4+, ×2 at 2+, else ×1. */
export function comboMultiplier(combo: number): number {
  return combo >= 6 ? 4 : combo >= 4 ? 3 : combo >= 2 ? 2 : 1;
}

/** A finished quiz as a whole percentage, rounded as the prototype does. */
export function scorePercent(score: number, of: number): number {
  return Math.round((score * 100) / of);
}

/** C3 question ids start with their idea: `<idea>/<kind>/…`. */
function ideaOfQuestion(questionId: string): string {
  const slash = questionId.indexOf('/');
  return slash < 0 ? questionId : questionId.slice(0, slash);
}

function newIdea(): IdeaProgress {
  return {
    masteryPercent: null,
    masteryEventId: null,
    mastered: false,
    masteredEventId: null,
    unlocked: false,
    unlockedAt: null,
    unlockedEventIds: [],
    rarity: null,
    inCurrentVersion: false,
  };
}

function ideaOf(state: TrackerState, ideaId: string): IdeaProgress {
  if (!own(state.ideas, ideaId)) state.ideas[ideaId] = newIdea();
  return state.ideas[ideaId] as IdeaProgress;
}

function unitOf(state: TrackerState, unit: number): UnitProgress {
  const key = String(unit);
  if (!own(state.units, key)) {
    state.units[key] = {
      latestVerdict: null,
      latestVerdictEventId: null,
      complete: false,
      completeEventIds: [],
    };
  }
  return state.units[key] as UnitProgress;
}

function award(
  state: TrackerState,
  event: InteractionEvent,
  source: XpSource,
  points: number,
  sink?: XpSink,
) {
  state.xp.total += points;
  state.xp[source] += points;
  sink?.({ eventId: event.id, source, points });
}

function isMastered(state: TrackerState, ideaId: string): boolean {
  return own(state.ideas, ideaId) && (state.ideas[ideaId] as IdeaProgress).mastered;
}

/** Idea unlocked (§8.3): every `requires` idea mastered; once unlocked, it stays unlocked (§7). */
function refreshUnlocks(state: TrackerState, version: CompiledVersion, event: InteractionEvent) {
  for (const id of version.ideaOrder) {
    const idea = ideaOf(state, id);
    if (idea.unlocked) continue;
    const requires = (version.ideas.get(id) as { requires: readonly string[] }).requires;
    if (!requires.every((r) => isMastered(state, r))) continue;
    idea.unlocked = true;
    idea.unlockedAt = event.at;
    idea.unlockedEventIds = requires.length
      ? requires.map((r) => (state.ideas[r] as IdeaProgress).masteredEventId as string)
      : [event.id];
  }
}

/** Unit complete (§8.3): every idea in it mastered and the latest teach-back verdict `pass`. */
function refreshUnits(
  state: TrackerState,
  version: CompiledVersion,
  event: InteractionEvent,
  sink?: XpSink,
) {
  for (const unit of version.units) {
    const ideas = version.unitIdeas.get(unit.unit) ?? [];
    const key = String(unit.unit);
    if (!own(state.units, key)) continue; // no verdict yet
    const progress = state.units[key] as UnitProgress;
    if (progress.complete || progress.latestVerdict !== 'pass') continue;
    if (!ideas.every((id) => isMastered(state, id))) continue;
    progress.complete = true;
    progress.completeEventIds = [
      ...ideas.map((id) => (state.ideas[id] as IdeaProgress).masteredEventId as string),
      progress.latestVerdictEventId as string,
    ];
    award(state, event, 'unit', 200, sink);
  }
}

function enterVersion(state: TrackerState, version: CompiledVersion) {
  for (const [id, idea] of Object.entries(state.ideas)) {
    const current = version.ideas.get(id);
    idea.inCurrentVersion = current !== undefined;
    if (current) idea.rarity = current.rarity;
  }
  for (const id of version.ideaOrder) {
    const idea = ideaOf(state, id);
    idea.inCurrentVersion = true;
    idea.rarity = (version.ideas.get(id) as { rarity: EffectiveRarity }).rarity;
  }
}

function signalWrongAfterHint(state: TrackerState, ideaId: string, event: InteractionEvent) {
  if (!own(state.hints, ideaId) || own(state.helpSignals, ideaId)) return;
  const pending = state.hints[ideaId] as { hintEventId: string; wrongEventIds: string[] };
  pending.wrongEventIds.push(event.id);
  if (pending.wrongEventIds.length < DEFAULTS.wrongAfterHint) return;
  state.helpSignals[ideaId] = {
    kind: 'wrong-after-hint',
    ideaId,
    missionId: null,
    reason: `${pending.wrongEventIds.length} wrong answers on "${ideaId}" questions after asking for a hint.`,
    since: event.at,
    eventIds: [pending.hintEventId, ...pending.wrongEventIds],
  };
}

function streakDayGap(state: TrackerState, today: number): number | null {
  const last = state.streak.lastPassDate;
  if (last === null) return null;
  return today - (parseIsoDate(last) as number);
}

/** Applies one event to a mutable draft of the state. */
export function applyV1(
  state: TrackerState,
  event: InteractionEvent,
  config: CompiledConfig,
  sink?: XpSink,
) {
  if (state.studentId !== null && event.studentId !== state.studentId) {
    throw new TrackerConfigError(
      `Event ${event.id} is for another student; a tracker state replays one student's events.`,
    );
  }
  const version = config.versions.get(event.versionId);
  if (!version) {
    throw new TrackerConfigError(
      `Event ${event.id} names version ${event.versionId}, which the config lacks.`,
    );
  }
  state.studentId = event.studentId;
  const today = localDay(config.zone, event.at);

  // Day streak (§8.3): a day with no pass resets it.
  const gap = streakDayGap(state, today);
  if (gap !== null && gap > 1 && state.streak.days > 0) {
    state.streak.days = 0;
    state.streak.eventIds = [];
  }

  state.versionHashes[event.versionId] = version.hash;
  // The pinned version when the config names one, else the latest event's.
  const currentId = config.currentVersionId ?? event.versionId;
  const current = config.versions.get(currentId) as CompiledVersion;
  state.versionHashes[currentId] = current.hash;
  if (state.versionId !== currentId) {
    state.versionId = currentId;
    enterVersion(state, current);
    refreshUnlocks(state, current, event);
    refreshUnits(state, current, event, sink);
  }

  switch (event.type) {
    case 'quiz.started': {
      const { attemptId, ideaId } = event.payload;
      ideaOf(state, ideaId);
      state.attempts[attemptId] = { ideaId, combo: 0 };
      break;
    }
    case 'quiz.answered': {
      const { attemptId, questionId, correct } = event.payload;
      if (!own(state.attempts, attemptId)) {
        state.attempts[attemptId] = { ideaId: ideaOfQuestion(questionId), combo: 0 };
      }
      const attempt = state.attempts[attemptId] as { ideaId: string; combo: number };
      if (correct) {
        // XP (§8.3): 10 × the combo multiplier.
        attempt.combo += 1;
        award(state, event, 'answer', 10 * comboMultiplier(attempt.combo), sink);
      } else {
        attempt.combo = 0;
        signalWrongAfterHint(state, attempt.ideaId, event);
      }
      break;
    }
    case 'quiz.finished': {
      const { attemptId, score, of } = event.payload;
      if (!own(state.attempts, attemptId)) break; // no quiz.started: the idea is unknown
      const { ideaId } = state.attempts[attemptId] as { ideaId: string };
      delete state.attempts[attemptId];
      const idea = ideaOf(state, ideaId);
      // Mastery % (§8.3): the best finished score.
      const percent = scorePercent(score, of);
      if (idea.masteryPercent === null || percent > idea.masteryPercent) {
        idea.masteryPercent = percent;
        idea.masteryEventId = event.id;
      }
      // Idea mastered (§8.3): a score above the pass mark.
      if (percent <= config.passMark) break;
      award(state, event, 'pass', 50, sink);
      if (score === of) award(state, event, 'perfect', 50, sink);
      // Day streak (§8.3): +1 on the first pass of a day in the class time zone.
      if (gap === null || gap > 1) {
        state.streak.days = 1;
        state.streak.eventIds = [event.id];
        state.streak.lastPassDate = isoDate(today);
      } else if (gap === 1) {
        state.streak.days += 1;
        state.streak.eventIds.push(event.id);
        state.streak.lastPassDate = isoDate(today);
      }
      // "May need help" is cleared by a later pass.
      delete state.hints[ideaId];
      delete state.helpSignals[ideaId];
      if (!idea.mastered) {
        idea.mastered = true;
        idea.masteredEventId = event.id;
        refreshUnlocks(state, current, event);
        refreshUnits(state, current, event, sink);
      }
      break;
    }
    case 'hint.requested': {
      const ideaId =
        'ideaId' in event.payload ? event.payload.ideaId : ideaOfQuestion(event.payload.questionId);
      if (!own(state.hints, ideaId) && !own(state.helpSignals, ideaId)) {
        state.hints[ideaId] = { hintEventId: event.id, wrongEventIds: [] };
      }
      break;
    }
    case 'review.link_rebuilt':
      award(state, event, 'link', 5, sink);
      break;
    case 'teachback.judged': {
      const unit = unitOf(state, event.payload.unitId);
      unit.latestVerdict = event.payload.verdict;
      unit.latestVerdictEventId = event.id;
      refreshUnits(state, current, event, sink);
      break;
    }
    case 'mission.completed':
      state.missionsCompleted[String(event.payload.missionId)] = event.id;
      break;
    default:
      // idea.opened, idea.active_time, teachback.done, feedback.*, teacher.*,
      // map.shown and ai.output_shown feed no rule in rulesVersion 1.
      break;
  }

  state.lastSeq = event.seq;
  state.lastAt = event.at;
  state.lastEventId = event.id;
}

/** The student's next mission: the uncompleted unit with the earliest due date. */
export function nextMission(state: TrackerState, version: CompiledVersion): number | null {
  let best: { unit: number; dueDate: string } | null = null;
  for (const unit of version.units) {
    if (unit.dueDate === null || own(state.missionsCompleted, String(unit.unit))) continue;
    if (
      !best ||
      unit.dueDate < best.dueDate ||
      (unit.dueDate === best.dueDate && unit.unit < best.unit)
    ) {
      best = { unit: unit.unit, dueDate: unit.dueDate };
    }
  }
  return best?.unit ?? null;
}

/**
 * "May need help" (b): an unlocked, unpassed idea the next mission depends on (an
 * idea in the mission's unit, or one they require) with no pass for 5 school days
 * since it unlocked, counted in the class calendar up to `asOf`.
 */
export function stalledSignals(
  state: TrackerState,
  config: CompiledConfig,
  asOf: string,
): HelpSignal[] {
  if (state.versionId === null) return [];
  const version = config.versions.get(state.versionId) as CompiledVersion;
  const mission = nextMission(state, version);
  if (mission === null) return [];
  const needed: string[] = [];
  for (const id of version.unitIdeas.get(mission) ?? []) {
    for (const r of [id, ...(version.ideas.get(id)?.requires ?? [])])
      if (!needed.includes(r)) needed.push(r);
  }
  const today = localDay(config.zone, asOf);
  const signals: HelpSignal[] = [];
  for (const id of needed) {
    if (!own(state.ideas, id)) continue;
    const idea = state.ideas[id] as IdeaProgress;
    if (!idea.unlocked || idea.mastered || idea.unlockedAt === null) continue;
    const from = localDay(config.zone, idea.unlockedAt);
    const days = schoolDaysAfter(config.calendar, from, today, DEFAULTS.stalledSchoolDays);
    if (days < DEFAULTS.stalledSchoolDays) continue;
    signals.push({
      kind: 'stalled-prerequisite',
      ideaId: id,
      missionId: mission,
      reason: `"${id}" is needed for mission ${mission}, unlocked on ${isoDate(from)}, and has no pass after ${DEFAULTS.stalledSchoolDays} school days.`,
      since: idea.unlockedAt,
      eventIds: idea.unlockedEventIds,
    });
  }
  return signals;
}

import {
  CourseDetailsResponseSchema,
  CourseFieldErrorSchema,
  type CourseDetailsResponse,
  type CourseField,
} from '@ideamap/contracts';
import type { SessionClient } from '../auth/session';

// The Course details form (T3): its state, and every load and save, apart from React so
// it can be tested on its own. Saves go through the F5 session client, so the header's
// Saving… / Saved reads them, and an edit refused for an expired session is kept and
// replayed after sign-in.
//
// Text fields save a moment after typing stops, and at once when the field loses
// focus; selects save on change. While a field has unsaved text, a reply for another
// field never overwrites what is being typed.

/** Whose value an edit changes: this class's override, or the curriculum default (D3). */
export type Target = 'class' | 'curriculum';

export interface FormState {
  status: 'loading' | 'ready' | 'failed';
  details: CourseDetailsResponse | null;
  target: Target;
  /** Text typed but not yet saved, per field. */
  drafts: Partial<Record<CourseField, string>>;
  /** The last refusal for a field, as a plain sentence. */
  errors: Partial<Record<CourseField, string>>;
}

export interface FormDeps {
  classId: string;
  client: Pick<SessionClient, 'send'>;
  /** A GET of the section's state; throws if it can't be read. */
  get: (url: string) => Promise<unknown>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** How long after the last keystroke a text field saves. */
  debounceMs?: number;
}

/** Optional fields: an emptied one is saved as null ("none"), not as empty text. */
const NULLABLE = new Set<CourseField>(['framework', 'map_objective']);

export function createCourseForm(deps: FormDeps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const debounceMs = deps.debounceMs ?? 600;
  const classUrl = `/api/classes/${encodeURIComponent(deps.classId)}/course`;

  let state: FormState = {
    status: 'loading',
    details: null,
    target: 'class',
    drafts: {},
    errors: {},
  };
  const listeners = new Set<() => void>();
  const timers = new Map<CourseField, unknown>();
  const set = (next: Partial<FormState>) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };

  /** The value a field shows for the current target. */
  const shown = (field: CourseField): string | null => {
    const f = state.details?.fields.find((x) => x.field === field);
    if (!f) return null;
    return state.target === 'class' ? f.value : f.curriculumValue;
  };

  const fieldUrl = (field: CourseField) =>
    state.target === 'class' || !state.details
      ? `${classUrl}/${field}`
      : `/api/curricula/${encodeURIComponent(state.details.curriculumId)}/course/${field}`;

  async function load(): Promise<void> {
    try {
      set({
        details: CourseDetailsResponseSchema.parse(await deps.get(classUrl)),
        status: 'ready',
      });
    } catch {
      if (!state.details) set({ status: 'failed' });
    }
  }

  /** Send one write and fold its answer into the state. */
  async function write(
    field: CourseField,
    method: 'PUT' | 'DELETE',
    body: unknown,
    sentDraft: string | undefined,
  ): Promise<void> {
    const target = state.target;
    let res: Response;
    try {
      res = await deps.client.send(method, fieldUrl(field), body);
    } catch {
      // Offline, or the session ended and the write is kept for after sign-in. The
      // header says it isn't saved; the typed text stays on the page.
      return;
    }
    if (res.ok) {
      const errors = { ...state.errors };
      delete errors[field];
      const drafts = { ...state.drafts };
      if (drafts[field] === sentDraft) delete drafts[field];
      if (target === 'class') {
        set({ details: CourseDetailsResponseSchema.parse(await res.json()), drafts, errors });
      } else {
        // A default changes what every class without an override shows; read this
        // class's view of it again.
        set({ drafts, errors });
        await load();
      }
      return;
    }
    let message = "This couldn't be saved. Try again in a moment.";
    try {
      const refusal = CourseFieldErrorSchema.safeParse(await res.json());
      if (refusal.success && res.status === 400) message = refusal.data.error;
    } catch {
      // Not JSON: keep the general sentence.
    }
    if (res.status === 403) message = "You can't change this.";
    set({ errors: { ...state.errors, [field]: message } });
  }

  function cancelTimer(field: CourseField) {
    const handle = timers.get(field);
    if (handle !== undefined) clearTimer(handle);
    timers.delete(field);
  }

  /** Save the field's typed text now, if it differs from what is saved. */
  async function commit(field: CourseField): Promise<void> {
    cancelTimer(field);
    const draft = state.drafts[field];
    if (draft === undefined) return;
    const text = draft.trim();
    const value = text === '' && NULLABLE.has(field) ? null : text;
    if (value === shown(field)) {
      const drafts = { ...state.drafts };
      delete drafts[field];
      set({ drafts });
      return;
    }
    await write(field, 'PUT', { value }, draft);
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    shown,
    /** Typed text: kept as a draft and saved once typing pauses. */
    type(field: CourseField, text: string) {
      const errors = { ...state.errors };
      delete errors[field];
      set({ drafts: { ...state.drafts, [field]: text }, errors });
      cancelTimer(field);
      timers.set(
        field,
        setTimer(() => void commit(field), debounceMs),
      );
    },
    commit,
    /** A choice from a list: saved at once. */
    async choose(field: CourseField, value: string) {
      set({ drafts: { ...state.drafts, [field]: value } });
      await commit(field);
    },
    /** Back to the curriculum's value: removes this class's override. */
    async reset(field: CourseField) {
      cancelTimer(field);
      const drafts = { ...state.drafts };
      delete drafts[field];
      set({ drafts });
      await write(field, 'DELETE', undefined, undefined);
    },
    async setTarget(target: Target) {
      if (target === state.target) return;
      // Typed text for the old target is saved there before switching.
      await Promise.all(Object.keys(state.drafts).map((f) => commit(f as CourseField)));
      set({ target, drafts: {}, errors: {} });
    },
  };
}

export type CourseForm = ReturnType<typeof createCourseForm>;

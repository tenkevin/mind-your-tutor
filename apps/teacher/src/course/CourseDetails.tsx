import { GRADES, type CourseField, type Origin } from '@ideamap/contracts';
import { useEffect, useId, useSyncExternalStore } from 'react';
import { Icon } from '../shell/icons';
import type { CourseForm, FormState } from './form';

// Course details (T3), after the section in project/Teacher Settings.dc.html: Subject,
// Map title (topic), Grade level and Standards framework in a grid, then the
// whole-map objective and the line about the header and reading level. Each field
// also says where its value comes from (§6) and, when the class has overridden it,
// offers to reset it to the curriculum's value.

const LABELS: Record<CourseField, string> = {
  subject: 'Subject',
  topic: 'Map title (topic)',
  grade: 'Grade level',
  framework: 'Standards framework',
  map_objective: 'Whole-map objective',
};

// The design's list, plus whatever the curriculum already uses.
const FRAMEWORKS = ['NGSS', 'Common Core', 'IB', 'Cambridge', 'State standards', 'Custom'];

const gradeName = (g: string) => (g === 'K' ? 'Kindergarten' : `Grade ${g}`);

const ORIGIN_TEXT: Record<Origin, string> = {
  curriculum: 'From curriculum',
  class: 'This class',
};

function OriginBadge({
  id,
  origin,
  target,
}: {
  id: string;
  origin: Origin;
  target: FormState['target'];
}) {
  if (target === 'curriculum') {
    return (
      <span id={id} className="tag tag-neutral course-origin">
        Curriculum default
      </span>
    );
  }
  return (
    <span
      id={id}
      className={`tag ${origin === 'class' ? 'tag-accent' : 'tag-neutral'} course-origin`}
      data-origin={origin}
    >
      {ORIGIN_TEXT[origin]}
    </span>
  );
}

interface FieldProps {
  form: CourseForm;
  state: FormState;
  field: CourseField;
  wide?: boolean;
}

function Field({ form, state, field, wide = false }: FieldProps) {
  const base = useId();
  const ids = { input: `${base}-input`, origin: `${base}-origin`, error: `${base}-error` };
  const detail = state.details!.fields.find((f) => f.field === field)!;
  const saved = form.shown(field);
  const draft = state.drafts[field];
  const text = draft ?? saved ?? '';
  const error = state.errors[field];
  const label = LABELS[field];
  const canReset = state.target === 'class' && detail.origin === 'class';
  const common = {
    id: ids.input,
    className: 'input',
    'aria-describedby': error ? `${ids.origin} ${ids.error}` : ids.origin,
    'aria-invalid': error ? true : undefined,
  } as const;

  let control;
  if (field === 'grade') {
    control = (
      <select {...common} value={text} onChange={(e) => void form.choose(field, e.target.value)}>
        {text === '' && <option value="">Choose a grade</option>}
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {gradeName(g)}
          </option>
        ))}
      </select>
    );
  } else if (field === 'framework') {
    const options = text && !FRAMEWORKS.includes(text) ? [text, ...FRAMEWORKS] : FRAMEWORKS;
    control = (
      <select {...common} value={text} onChange={(e) => void form.choose(field, e.target.value)}>
        <option value="">None</option>
        {options.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    );
  } else if (field === 'map_objective') {
    control = (
      <textarea
        {...common}
        className="input course-objective"
        value={text}
        onChange={(e) => form.type(field, e.target.value)}
        onBlur={() => void form.commit(field)}
      />
    );
  } else {
    control = (
      <input
        {...common}
        type="text"
        value={text}
        onChange={(e) => form.type(field, e.target.value)}
        onBlur={() => void form.commit(field)}
      />
    );
  }

  const fromCurriculum = detail.curriculumValue ?? 'none';
  return (
    <div className={`field course-field${wide ? ' course-wide' : ''}`}>
      <div className="course-label-row">
        <label htmlFor={ids.input}>{label}</label>
        <OriginBadge id={ids.origin} origin={detail.origin} target={state.target} />
        {canReset && (
          <button
            type="button"
            className="btn btn-ghost course-reset"
            aria-label={`Reset ${label} to the curriculum value, ${field === 'grade' && detail.curriculumValue ? gradeName(detail.curriculumValue) : fromCurriculum}`}
            onClick={() => void form.reset(field)}
          >
            Reset to curriculum
          </button>
        )}
      </div>
      {control}
      {error && (
        <p id={ids.error} className="course-error" role="alert">
          <Icon name="warning" />
          {error}
        </p>
      )}
    </div>
  );
}

export function CourseDetails({ form }: { form: CourseForm }) {
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  useEffect(() => {
    void form.load();
  }, [form]);
  const targetName = useId();

  if (state.status === 'loading' && !state.details) {
    return <p className="course-note">Loading course details…</p>;
  }
  if (!state.details) {
    return (
      <p className="course-note" role="alert">
        Course details couldn&apos;t be loaded.{' '}
        <button type="button" className="btn btn-secondary" onClick={() => void form.load()}>
          Try again
        </button>
      </p>
    );
  }

  const subject = form.shown('subject');
  const topic = form.shown('topic');
  const title = [subject, topic].filter(Boolean).join(' · ');
  const level = state.details.readingLevel;
  return (
    <div className="course">
      {state.details.canEditDefaults && (
        <fieldset className="course-target">
          <legend>Change values for</legend>
          <div className="seg">
            {(
              [
                ['class', 'This class'],
                ['curriculum', 'Every class (curriculum default)'],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="seg-opt">
                <input
                  type="radio"
                  name={targetName}
                  value={value}
                  checked={state.target === value}
                  onChange={() => void form.setTarget(value)}
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="course-grid">
        <Field form={form} state={state} field="subject" />
        <Field form={form} state={state} field="topic" />
        <Field form={form} state={state} field="grade" />
        <Field form={form} state={state} field="framework" />
      </div>
      <Field form={form} state={state} field="map_objective" wide />
      <p className="course-note">
        Students see “{title}” in the map header.
        {level &&
          state.target === 'class' &&
          ` The grade sets the reading level for every persona: ${level.gradeLabel} is “${level.level}”.`}
      </p>
    </div>
  );
}

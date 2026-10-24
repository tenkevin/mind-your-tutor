import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface Step {
  title: string;
  body: ReactNode;
}

// The student's place is kept in this browser only, so a break can last past a
// reload. It is a convenience, not a record: nothing is sent (D19).
const KEY = (k: string) => `ideamap.steps.${k}`;

function load(key: string | undefined, count: number): { step: number; paused: boolean } {
  if (!key) return { step: 0, paused: false };
  try {
    // "<step>" while working, "<step>p" on a break.
    const m = /^(\d+)(p?)$/.exec(localStorage.getItem(KEY(key)) ?? '');
    if (m && Number(m[1]) < count) return { step: Number(m[1]), paused: m[2] === 'p' };
  } catch {
    // Storage blocked: start at the beginning.
  }
  return { step: 0, paused: false };
}

function save(key: string | undefined, step: number | null, paused = false) {
  if (!key) return;
  try {
    if (step === null) localStorage.removeItem(KEY(key));
    else localStorage.setItem(KEY(key), `${step}${paused ? 'p' : ''}`);
  } catch {
    // Storage blocked: the place lasts until the page closes.
  }
}

/**
 * A task in steps, at the student's own pace (D17 engagement: pacing). Steps go
 * forward and back, and "Take a break" pauses with the place kept, to pick up
 * later with "Keep going".
 */
export function StepFlow({
  title,
  steps,
  saveKey,
  onFinish,
  finishLabel = 'Finish',
}: {
  title: string;
  steps: readonly Step[];
  /** Keeps the place in this browser between visits. */
  saveKey?: string;
  onFinish(): void;
  finishLabel?: string;
}) {
  const [{ step, paused }, set] = useState(() => load(saveKey, steps.length));
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // Move focus to the step's heading after the student changes step.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step, paused]);

  const go = (next: number, pause = false) => {
    moved.current = true;
    save(saveKey, next, pause);
    set({ step: next, paused: pause });
  };

  const last = step === steps.length - 1;
  const current = steps[step];
  if (!current) return null;

  return (
    <section className="udl-card udl-steps" aria-labelledby={headingId}>
      <p className="udl-hint">
        {title} · Step {step + 1} of {steps.length}
      </p>
      <progress className="udl-progress" max={steps.length} value={step + 1}>
        Step {step + 1} of {steps.length}
      </progress>
      {paused ? (
        <>
          <h2 id={headingId} ref={heading} tabIndex={-1} className="udl-title">
            Taking a break
          </h2>
          <p>Your place is saved. You were on: {current.title}.</p>
          <div className="udl-row">
            <button
              type="button"
              className="btn btn-primary udl-btn"
              onClick={() => go(step, false)}
            >
              Keep going
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id={headingId} ref={heading} tabIndex={-1} className="udl-title">
            {current.title}
          </h2>
          <div className="udl-step-body">{current.body}</div>
          <div className="udl-row">
            {step > 0 && (
              <button type="button" className="btn btn-ghost udl-btn" onClick={() => go(step - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary udl-btn"
              onClick={() => go(step, true)}
            >
              Take a break
            </button>
            {last ? (
              <button
                type="button"
                className="btn btn-primary udl-btn"
                onClick={() => {
                  save(saveKey, null);
                  onFinish();
                }}
              >
                {finishLabel}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary udl-btn"
                onClick={() => go(step + 1)}
              >
                Next
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

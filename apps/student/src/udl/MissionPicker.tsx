import { useId } from 'react';
import { Icon, type IconName } from './icons';

export type MissionState = 'ready' | 'todo' | 'locked' | 'done';

export interface Mission {
  id: string;
  title: string;
  detail: string;
  state: MissionState;
}

// Each state is said in words and shown by an icon, never by colour alone.
const STATE: Record<MissionState, { word: string; icon: IconName }> = {
  ready: { word: 'Ready', icon: 'star' },
  todo: { word: 'To do', icon: 'flag' },
  locked: { word: 'Locked', icon: 'lock' },
  done: { word: 'Done', icon: 'check' },
};

/**
 * The student's missions, to pick from in any order (D17 engagement: choice).
 * Locked missions say what to do first. Picking one is the student's choice
 * and is not traced; only finishing a mission is (§8.2 `mission.completed`).
 */
export function MissionPicker({
  missions,
  onChoose,
  title = 'Your missions',
}: {
  missions: readonly Mission[];
  onChoose(id: string): void;
  title?: string;
}) {
  const titleId = useId();
  return (
    <section className="udl-missions" aria-labelledby={titleId}>
      <h2 id={titleId} className="udl-title">
        {title}
      </h2>
      <p className="udl-hint">Pick any mission you like.</p>
      <ul>
        {missions.map((m) => {
          const s = STATE[m.state];
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`udl-mission udl-mission-${m.state}`}
                // Still focusable, so a screen reader hears what unlocks it.
                aria-disabled={m.state === 'locked' || undefined}
                onClick={() => m.state !== 'locked' && onChoose(m.id)}
              >
                <span className="udl-mission-icon">
                  <Icon name={s.icon} />
                </span>
                <span className="udl-mission-text">
                  <span className="udl-mission-title">{m.title}</span>
                  <span className="udl-mission-detail">{m.detail}</span>
                </span>
                <span className="udl-mission-tag">{s.word}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

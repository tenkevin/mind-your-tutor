import type { StudentIdeaResponse } from '@ideamap/contracts';
import { useLayoutEffect, useRef } from 'react';
import { ReadAloud } from '../udl';
import { CategoryIcon } from './CategoryIcon';

// The read-only idea page (S10): title, category, unit, objective, explanation
// (read-aloud, D17), key terms, links by idea name and relation, and a placeholder where
// video arrives with X2. Laid out as Idea Map Explorer v2's idea page: the idea on the
// left, and where it sits on the map on the right (one column on narrow screens). It
// grows out of the card that was opened, so the move from the map feels continuous.

export function IdeaPage({
  idea,
  onBack,
  icon = null,
  colour,
  from = null,
}: {
  idea: StudentIdeaResponse;
  onBack: () => void;
  /** The category's icon and colour, as on the map. */
  icon?: string | null;
  colour?: string;
  /** Where the opened card was on screen, so the page can grow from it. */
  from?: { x: number; y: number } | null;
}) {
  const page = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = page.current;
    if (!el || !from) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ipage-from-x', `${from.x - r.left}px`);
    el.style.setProperty('--ipage-from-y', `${from.y - r.top}px`);
  }, [from]);

  const connected = idea.linksIn.length > 0 || idea.linksOut.length > 0;
  return (
    <article ref={page} className="ipage" aria-labelledby="ipage-title">
      <button type="button" className="btn btn-ghost ipage-back" onClick={onBack}>
        ← Back to the map
      </button>
      <div className="ipage-grid">
        <div className="ipage-main">
          <header className="ipage-head">
            <p className="ipage-tags">
              <span className="ipage-tag">
                <span className="ipage-tag-icon" style={{ color: colour }}>
                  <CategoryIcon slug={icon} size={14} />
                </span>
                {idea.category}
              </span>
              <span className="ipage-tag">
                Unit {idea.unit}
                {idea.unitName ? `: ${idea.unitName}` : ''}
              </span>
            </p>
            <h1 id="ipage-title" tabIndex={-1} className="ipage-title">
              {idea.title}
            </h1>
          </header>
          {idea.objective && (
            <section className="ipage-goal" aria-labelledby="ipage-obj">
              <TargetIcon />
              <div>
                <h2 id="ipage-obj" className="ipage-label">
                  What you will learn
                </h2>
                <p>{idea.objective}</p>
              </div>
            </section>
          )}
          <section className="ipage-explain" aria-labelledby="ipage-exp">
            <h2 id="ipage-exp">Explanation</h2>
            {idea.explanation ? (
              <ReadAloud text={idea.explanation} />
            ) : (
              <p className="ipage-quiet">Your teacher is preparing this explanation.</p>
            )}
          </section>
          <section className="ipage-media" aria-label="Picture or video">
            <p>A picture or video for this idea will appear here.</p>
          </section>
          {idea.keyTerms.length > 0 && (
            <section aria-labelledby="ipage-terms">
              <h2 id="ipage-terms">Key terms</h2>
              <ul className="ipage-terms">
                {idea.keyTerms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {connected && (
          <aside className="ipage-side" aria-labelledby="ipage-links">
            <h2 id="ipage-links">How it connects</h2>
            {idea.linksIn.length > 0 && (
              <section aria-labelledby="ipage-in">
                <h3 id="ipage-in" className="ipage-label">
                  Comes from
                </h3>
                <ul className="ipage-conn">
                  {idea.linksIn.map((l) => (
                    <li key={`in-${l.id}`}>
                      <strong>{l.title}</strong>
                      <span className="ipage-rel">{l.relation} this idea</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="ipage-here" aria-hidden="true">
              {idea.title}
            </p>
            {idea.linksOut.length > 0 && (
              <section aria-labelledby="ipage-out">
                <h3 id="ipage-out" className="ipage-label">
                  Leads to
                </h3>
                <ul className="ipage-conn">
                  {idea.linksOut.map((l) => (
                    <li key={`out-${l.id}`}>
                      <span className="ipage-rel">This idea {l.relation}</span>
                      <strong>{l.title}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}

function TargetIcon() {
  return (
    <svg
      className="ipage-goal-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

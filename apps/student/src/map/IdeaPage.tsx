import type { StudentIdeaResponse } from '@ideamap/contracts';
import { ReadAloud } from '../udl';

// The read-only idea page (S10): title, objective, explanation (read-aloud, D17), key
// terms, links by idea name and relation, and a placeholder where video arrives with X2.

export function IdeaPage({ idea, onBack }: { idea: StudentIdeaResponse; onBack: () => void }) {
  return (
    <article className="ipage" aria-labelledby="ipage-title">
      <button type="button" className="btn btn-secondary ipage-back" onClick={onBack}>
        ← Back to the map
      </button>
      <header>
        <p className="ipage-kicker">
          {idea.category} · Unit {idea.unit}
          {idea.unitName ? `: ${idea.unitName}` : ''}
        </p>
        <h1 id="ipage-title" tabIndex={-1} className="ipage-title">
          {idea.title}
        </h1>
      </header>
      {idea.objective && (
        <section aria-labelledby="ipage-obj">
          <h3 id="ipage-obj">What you will learn</h3>
          <p>{idea.objective}</p>
        </section>
      )}
      <section aria-labelledby="ipage-exp">
        <h3 id="ipage-exp">Explanation</h3>
        {idea.explanation ? (
          <ReadAloud text={idea.explanation} />
        ) : (
          <p className="ipage-quiet">Your teacher is preparing this explanation.</p>
        )}
      </section>
      {idea.keyTerms.length > 0 && (
        <section aria-labelledby="ipage-terms">
          <h3 id="ipage-terms">Key terms</h3>
          <ul className="ipage-terms">
            {idea.keyTerms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      {(idea.linksIn.length > 0 || idea.linksOut.length > 0) && (
        <section aria-labelledby="ipage-links">
          <h3 id="ipage-links">How it connects</h3>
          <ul className="ipage-links">
            {idea.linksIn.map((l) => (
              <li key={`in-${l.id}`}>
                <strong>{l.title}</strong> <span className="ipage-rel">{l.relation}</span> this idea
              </li>
            ))}
            {idea.linksOut.map((l) => (
              <li key={`out-${l.id}`}>
                This idea <span className="ipage-rel">{l.relation}</span> <strong>{l.title}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="ipage-media" aria-label="Picture or video">
        <p>A picture or video for this idea will appear here.</p>
      </section>
    </article>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ReadAloud } from './ReadAloud';
import { SpeakOrType } from './SpeakOrType';

/**
 * Formative feedback with its reason (D15), readable aloud, and a "Challenge
 * this" the student can type or say (D17). The caller sends the challenge and
 * records it as `feedback.challenged` (§8.2); this component records nothing.
 */
export function Feedback({
  from,
  message,
  reason,
  onChallenge,
}: {
  from: string;
  message: string;
  reason: string;
  onChallenge(text: string): void;
}) {
  const [challenging, setChallenging] = useState(false);
  const [sent, setSent] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);
  // The form goes away when sent; focus the message that replaces it.
  useEffect(() => {
    if (sent) status.current?.focus();
  }, [sent]);
  return (
    <article className="udl-card" aria-label={`Feedback from ${from}`}>
      <p className="udl-hint">{from} says</p>
      <ReadAloud text={message} />
      <p className="udl-hint">Why</p>
      <ReadAloud text={reason} label="Read why" />
      {/* Always in the page, so the message is announced when it fills in. */}
      <p className="udl-status" role="status" ref={status} tabIndex={-1}>
        {sent ? 'Sent to your teacher. They will look at it.' : ''}
      </p>
      {sent ? null : challenging ? (
        <SpeakOrType
          autoFocus
          label="What do you think is wrong? Your teacher will see this."
          sendLabel="Send to my teacher"
          onSend={(text) => {
            onChallenge(text);
            setSent(true);
          }}
        />
      ) : (
        <div className="udl-row">
          <button
            type="button"
            className="btn btn-secondary udl-btn"
            onClick={() => setChallenging(true)}
          >
            Challenge this
          </button>
        </div>
      )}
    </article>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSpeechServices, useVoicesVersion } from './context';
import { Icon } from './icons';
import { createReadAloud, splitWords, type ReadState } from './speech';

export function useReadAloud(text: string, rate = 1) {
  const { speech, lang } = useSpeechServices();
  const voices = useVoicesVersion(speech);
  const [state, setState] = useState<ReadState>('idle');
  const [word, setWord] = useState(-1);
  const reader = useMemo(
    () => createReadAloud(speech, { onState: setState, onWord: setWord }, { lang, rate }),
    [speech, lang, rate],
  );
  // Stop when the text changes or the component goes away.
  useEffect(() => () => reader.stop(), [reader, text]);
  // `voices` makes availability re-checked once the browser has loaded them.
  const available = useMemo(() => voices >= 0 && reader.available(), [reader, voices]);
  return {
    state,
    word,
    available,
    play: () => reader.play(text),
    pause: reader.pause,
    resume: reader.resume,
    stop: reader.stop,
  };
}

/**
 * Text that can be read aloud, with the spoken word highlighted. The text is
 * always on screen; the speaker controls only appear where the device has a
 * voice of its own.
 */
export function ReadAloud({
  text,
  as: Tag = 'p',
  label = 'Read to me',
  className,
}: {
  text: string;
  as?: 'p' | 'div' | 'span';
  label?: string;
  className?: string;
}) {
  const words = useMemo(() => splitWords(text), [text]);
  const [slow, setSlow] = useState(false);
  // A new rate makes a new reader, and the old one stops as it goes.
  const r = useReadAloud(text, slow ? 0.75 : 1);

  return (
    <div className={['udl-read', className].filter(Boolean).join(' ')}>
      <Tag className="udl-read-text">
        {r.word < 0
          ? text
          : words.map((w, i) => (
              <span key={w.start}>
                {i > 0 ? text.slice(words[i - 1]!.end, w.start) : text.slice(0, w.start)}
                <span className={i === r.word ? 'udl-word-now' : undefined}>{w.text}</span>
              </span>
            ))}
      </Tag>
      {r.available && (
        <div className="udl-row" role="group" aria-label="Read aloud">
          {r.state === 'idle' ? (
            <button type="button" className="btn btn-secondary udl-btn" onClick={r.play}>
              <Icon name="speaker" /> {label}
            </button>
          ) : r.state === 'speaking' ? (
            <button type="button" className="btn btn-secondary udl-btn" onClick={r.pause}>
              <Icon name="pause" /> Pause
            </button>
          ) : (
            <button type="button" className="btn btn-secondary udl-btn" onClick={r.resume}>
              <Icon name="play" /> Keep going
            </button>
          )}
          {r.state !== 'idle' && (
            <button type="button" className="btn btn-ghost udl-btn" onClick={r.stop}>
              <Icon name="stop" /> Stop
            </button>
          )}
          <label className="udl-check">
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
            Slower
          </label>
        </div>
      )}
    </div>
  );
}

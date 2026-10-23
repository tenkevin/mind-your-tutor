import { useEffect, useId, useRef, useState } from 'react';
import { useSpeechServices } from './context';
import { Icon } from './icons';
import { canDictateOnDevice, createDictation, type Dictation, type DictationState } from './speech';

const ERRORS: Record<string, string> = {
  'not-allowed': 'The microphone is turned off for this page. You can still type.',
  'service-not-allowed': 'The microphone is turned off for this page. You can still type.',
  'no-speech': "I didn't hear anything. Try again, or type.",
  'not-on-device': "This device can't listen right now. You can still type.",
};

/**
 * A text box the student can type in or talk into (D17 action and expression).
 * Speech is turned into words on the device and put in the box; the student
 * checks or fixes them, then presses Send. Only the text is sent, never audio.
 * Used for answers, chat and "Challenge this" (D15).
 */
export function SpeakOrType({
  label,
  placeholder,
  sendLabel = 'Send',
  multiline = true,
  onSend,
}: {
  label: string;
  placeholder?: string;
  sendLabel?: string;
  multiline?: boolean;
  onSend(text: string): void;
}) {
  const id = useId();
  const { recognition, lang } = useSpeechServices();
  const [text, setText] = useState('');
  const [canTalk, setCanTalk] = useState(false);
  const [explained, setExplained] = useState(false);
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | undefined>();
  // What was in the box before this listening turn; heard words go after it.
  const before = useRef('');

  useEffect(() => {
    let live = true;
    void canDictateOnDevice(recognition, lang).then((ok) => live && setCanTalk(ok));
    return () => {
      live = false;
    };
  }, [recognition, lang]);

  // Made on the first press of Talk, so nothing touches the mic before that.
  const dictation = useRef<Dictation | null>(null);
  useEffect(
    () => () => {
      dictation.current?.stop();
      dictation.current = null;
    },
    [recognition, lang],
  );

  const listen = () => {
    if (!recognition) return;
    before.current = text.trim();
    dictation.current ??= createDictation(
      recognition,
      {
        onText: (heard) => setText(before.current ? `${before.current} ${heard}` : heard),
        onState: (s, err) => {
          setState(s);
          setError(s === 'error' ? err : undefined);
        },
      },
      lang,
    );
    void dictation.current.start();
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    dictation.current?.stop();
    onSend(t);
    setText('');
  };

  const Field = multiline ? 'textarea' : 'input';
  const listening = state === 'listening' || state === 'starting';

  return (
    <div className="udl-say">
      <label className="udl-label" htmlFor={id}>
        {label}
      </label>
      <Field
        id={id}
        className="input udl-input"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
        {...(multiline ? { rows: 3 } : {})}
      />
      {asking && (
        <div className="udl-note" role="note">
          <p>
            Talk instead of typing. Your words show up in the box so you can check them. Your voice
            stays on this device: it is not recorded or sent.
          </p>
          <p>Your browser will ask if this page can use the microphone.</p>
          <div className="udl-row">
            <button
              type="button"
              className="btn btn-primary udl-btn"
              onClick={() => {
                setAsking(false);
                setExplained(true);
                listen();
              }}
            >
              <Icon name="mic" /> Start talking
            </button>
            <button
              type="button"
              className="btn btn-ghost udl-btn"
              onClick={() => setAsking(false)}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      <div className="udl-row">
        {canTalk && !asking && (
          <button
            type="button"
            className={`btn udl-btn ${listening ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={listening}
            onClick={() => {
              if (listening) dictation.current?.stop();
              else if (!explained) setAsking(true);
              else listen();
            }}
          >
            <Icon name={listening ? 'stop' : 'mic'} /> {listening ? 'Stop talking' : 'Talk'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary udl-btn"
          disabled={!text.trim()}
          onClick={send}
        >
          {sendLabel}
        </button>
      </div>
      <p className="udl-status" role="status">
        {state === 'listening'
          ? "I'm listening. Press Stop talking when you're done."
          : error
            ? (ERRORS[error] ?? 'Something went wrong with listening. You can still type.')
            : ''}
      </p>
    </div>
  );
}

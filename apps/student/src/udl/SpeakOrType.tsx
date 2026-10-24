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
  autoFocus = false,
  onSend,
}: {
  label: string;
  placeholder?: string;
  sendLabel?: string;
  multiline?: boolean;
  /** Focus the text box when it appears, e.g. after "Challenge this". */
  autoFocus?: boolean;
  onSend(text: string): void;
}) {
  const id = useId();
  const noteId = useId();
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const talk = useRef<HTMLButtonElement>(null);
  const startTalking = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  // The explanation opens with focus on Start talking, which it describes.
  useEffect(() => {
    if (asking) startTalking.current?.focus();
  }, [asking]);

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
    // Send turns disabled once the box is empty; keep focus in the box.
    box.current?.focus();
  };

  // Close the explanation and put focus back on Talk.
  const closeNote = () => {
    setAsking(false);
    talk.current?.focus();
  };

  const Field = multiline ? 'textarea' : 'input';
  const listening = state === 'listening' || state === 'starting';

  return (
    <div className="udl-say">
      <label className="udl-label" htmlFor={id}>
        {label}
      </label>
      <Field
        ref={box}
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
        <div className="udl-note" id={noteId} role="group" aria-label="Talk instead of typing">
          <p id={`${noteId}-text`}>
            Talk instead of typing. Your words show up in the box so you can check them. Your voice
            stays on this device: it is not recorded or sent. The first time, your device may need a
            moment to get ready. Your browser will ask if this page can use the microphone.
          </p>
          <div className="udl-row">
            <button
              ref={startTalking}
              type="button"
              className="btn btn-primary udl-btn"
              aria-describedby={`${noteId}-text`}
              onClick={() => {
                closeNote();
                setExplained(true);
                listen();
              }}
            >
              <Icon name="mic" /> Start talking
            </button>
            <button type="button" className="btn btn-ghost udl-btn" onClick={closeNote}>
              Not now
            </button>
          </div>
        </div>
      )}
      <div className="udl-row">
        {canTalk && (
          <button
            ref={talk}
            type="button"
            className={`btn udl-btn ${listening ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={listening}
            onClick={() => {
              if (listening) dictation.current?.stop();
              else if (asking) closeNote();
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
      {/* Always in the page, even when empty, so its changes are announced. */}
      <p className="udl-status" role="status">
        {state === 'starting'
          ? 'Getting ready to listen…'
          : state === 'listening'
            ? "I'm listening. Press Stop talking when you're done."
            : error
              ? (ERRORS[error] ?? 'Something went wrong with listening. You can still type.')
              : ''}
      </p>
    </div>
  );
}

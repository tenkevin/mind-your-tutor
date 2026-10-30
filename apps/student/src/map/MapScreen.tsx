import type { StudentIdeaResponse, StudentMapResponse } from '@ideamap/contracts';
import { useCallback, useEffect, useState } from 'react';
import { IdeaLocked, loadIdea, loadMap, chooseClass, SignedOut } from './api';
import { IdeaMap } from './IdeaMap';
import { IdeaPage } from './IdeaPage';

// The student's map screen (S10). The open idea lives in the URL hash (#idea=<id>) so
// the browser's Back button returns to the map. The map stays mounted while an idea is
// open, so Back finds the same pan and zoom. `?preview=1` asks the server for a staff
// preview; the server ignores it for a student.

type State =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'ready'; classId: string; data: StudentMapResponse };

const ideaFromHash = () => {
  const m = /^#idea=(.+)$/.exec(location.hash);
  return m ? decodeURIComponent(m[1]!) : null;
};

export function MapScreen({ onSignedOut }: { onSignedOut: () => void }) {
  const params = new URLSearchParams(location.search);
  const wantsPreview = params.get('preview') === '1';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [openId, setOpenId] = useState<string | null>(ideaFromHash);
  const [loaded, setLoaded] = useState<{
    id: string;
    value: StudentIdeaResponse | 'denied' | { locked: string };
  } | null>(null);
  // Only the page for the idea now in the URL counts; an older answer is ignored.
  const idea = loaded && loaded.id === openId ? loaded.value : null;
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const fail = useCallback(
    (e: unknown) => (e instanceof SignedOut ? onSignedOut() : setState({ kind: 'error' })),
    [onSignedOut],
  );

  useEffect(() => {
    chooseClass(params.get('class'))
      .then(async (classId) => {
        if (!classId) return setState({ kind: 'none' });
        setState({ kind: 'ready', classId, data: await loadMap(classId, wantsPreview) });
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sync = () => setOpenId(ideaFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const classId = state.kind === 'ready' ? state.classId : null;
  const preview = state.kind === 'ready' && state.data.preview;
  useEffect(() => {
    if (!classId || !openId) return;
    let live = true;
    loadIdea(classId, openId, preview)
      .then((i) => live && setLoaded({ id: openId, value: i }))
      .catch((e) => {
        if (!live) return;
        if (e instanceof SignedOut) onSignedOut();
        else if (e instanceof IdeaLocked) {
          setLoaded({
            id: openId,
            value: {
              locked: e.title
                ? `${e.title} is locked. Unlocks after ${e.unlocksAfter.join(', ')}.`
                : 'Hidden idea. Explore nearby to reveal.',
            },
          });
        } else setLoaded({ id: openId, value: 'denied' });
      });
    return () => {
      live = false;
    };
  }, [classId, openId, preview, onSignedOut]);

  useEffect(() => {
    if (idea && idea !== 'denied') document.getElementById('ipage-title')?.focus();
  }, [idea]);

  const open = (id: string) => {
    setLastOpened(id);
    location.hash = `idea=${encodeURIComponent(id)}`;
  };
  const back = () => (history.length > 1 ? history.back() : (location.hash = ''));

  if (state.kind === 'loading') return <p className="mscreen-note">Loading your map…</p>;
  if (state.kind === 'none') return <p className="mscreen-note">You are not in a class yet.</p>;
  if (state.kind === 'error')
    return <p className="mscreen-note">The map could not load. Try again.</p>;
  const { data } = state;
  if (!data.map) {
    return (
      <section className="mscreen">
        <h1>{data.className}</h1>
        <p className="mscreen-note">Your teacher hasn&rsquo;t published this map yet.</p>
      </section>
    );
  }
  const showing = openId !== null;
  return (
    <section className="mscreen">
      {data.preview && (
        <p className="mscreen-banner" role="status">
          Preview: students see locked ideas until they unlock them
        </p>
      )}
      <div hidden={showing}>
        <h1 className="mscreen-title">
          {data.map.topic} <span>· {data.className}</span>
        </h1>
        <IdeaMap map={data.map} onOpen={open} restoreFocus={showing ? null : lastOpened} />
      </div>
      {showing && idea === null && <p className="mscreen-note">Loading…</p>}
      {showing && idea === 'denied' && (
        <div>
          <h1 className="mscreen-title">This idea is locked or isn&rsquo;t on your map.</h1>
          <button type="button" className="btn btn-secondary" onClick={back}>
            ← Back to the map
          </button>
        </div>
      )}
      {showing && idea && typeof idea === 'object' && 'locked' in idea && (
        <div>
          <h1 className="mscreen-title">{idea.locked}</h1>
          <button type="button" className="btn btn-secondary" onClick={back}>
            ← Back to the map
          </button>
        </div>
      )}
      {showing && idea && idea !== 'denied' && !('locked' in idea) && (
        <IdeaPage idea={idea} onBack={back} />
      )}
    </section>
  );
}

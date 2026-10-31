import type { MeResponse } from '@ideamap/contracts';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createEventQueue, type EventQueue, type KeyValue } from './queue';

// One event queue per signed-in student (M2). Learning screens call `useTracker()`
// and `track(...)`; sending happens in the background and never shows an error.

const TrackerContext = createContext<EventQueue | null>(null);

/** sessionStorage, looked up on each use: absent during server rendering and tests. */
const tabStorage: KeyValue = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

export function TrackerProvider({ me, children }: { me: MeResponse; children: ReactNode }) {
  const queue = useMemo(
    () =>
      createEventQueue({
        fetch: (input, init) => fetch(input, init),
        store: tabStorage,
        userId: me.user.id,
        csrfToken: () => me.csrfToken,
      }),
    [me.user.id, me.csrfToken],
  );
  useEffect(() => {
    const stop = queue.start(window);
    void queue.flush();
    return stop;
  }, [queue]);
  return <TrackerContext.Provider value={queue}>{children}</TrackerContext.Provider>;
}

/** The signed-in student's event queue; null outside the signed-in app. */
export function useTracker(): EventQueue | null {
  return useContext(TrackerContext);
}

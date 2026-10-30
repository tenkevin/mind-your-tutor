import {
  ClassesResponseSchema,
  LockedIdeaResponseSchema,
  StudentIdeaResponseSchema,
  StudentMapResponseSchema,
  type StudentIdeaResponse,
  type StudentMapResponse,
} from '@ideamap/contracts';

// The student app's reads for the map (S10). Sign-in is the session cookie; a 401 sends
// the student back to sign in. Nothing here records progress or sends analytics.

export class SignedOut extends Error {}

/** The server refused a locked idea and named what unlocks it. */
export class IdeaLocked extends Error {
  constructor(
    readonly title: string | null,
    readonly unlocksAfter: string[],
  ) {
    super('locked');
  }
}

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) throw new SignedOut();
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

const q = (preview: boolean) => (preview ? '?preview=1' : '');

/** The class to show: `?class=<id>` if it's theirs, else their first. */
export async function chooseClass(wanted: string | null): Promise<string | null> {
  const { classes } = ClassesResponseSchema.parse(await get('/api/classes'));
  return (classes.find((c) => c.id === wanted) ?? classes[0])?.id ?? null;
}

export async function loadMap(classId: string, preview: boolean): Promise<StudentMapResponse> {
  return StudentMapResponseSchema.parse(await get(`/api/classes/${classId}/map${q(preview)}`));
}

export async function loadIdea(
  classId: string,
  ideaId: string,
  preview: boolean,
): Promise<StudentIdeaResponse> {
  const url = `/api/classes/${classId}/ideas/${encodeURIComponent(ideaId)}${q(preview)}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) throw new SignedOut();
  if (res.status === 403) {
    const body = LockedIdeaResponseSchema.safeParse(await res.json().catch(() => null));
    if (body.success)
      throw new IdeaLocked(
        body.data.title ?? null,
        (body.data.unlocksAfter ?? []).map((u) => u.title),
      );
  }
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return StudentIdeaResponseSchema.parse(await res.json());
}

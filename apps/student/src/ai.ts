import {
  AI_RATE_LIMIT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  AiChatResponseSchema,
  CSRF_HEADER,
  type AiChatRequest,
  type AiChatResponse,
} from '@ideamap/contracts';

// The student app's client for the AI gateway (A1). The app sends only the
// conversation; the server picks the persona by route and fills its prompt (§6, §9).
// Errors come back as plain sentences for the student, never a raw status (A1-U1).

export type StudentPersona = 'tutor' | 'peer';

export type AskResult =
  | { ok: true; reply: AiChatResponse }
  | { ok: false; message: string; retryAfterSeconds: number | null };

export interface AskOptions {
  classId: string;
  persona: StudentPersona;
  /** From /api/me; the gateway's routes are state-changing, so they need it. */
  csrfToken: string;
  request: AiChatRequest;
}

export async function askPersona(
  fetchFn: typeof fetch,
  { classId, persona, csrfToken, request }: AskOptions,
): Promise<AskResult> {
  let res: Response;
  try {
    res = await fetchFn(`/api/classes/${encodeURIComponent(classId)}/ai/${persona}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, message: AI_UNAVAILABLE_MESSAGE, retryAfterSeconds: null };
  }
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'));
    return {
      ok: false,
      message: AI_RATE_LIMIT_MESSAGE,
      retryAfterSeconds: Number.isFinite(after) && after > 0 ? after : null,
    };
  }
  if (res.ok) {
    const parsed = AiChatResponseSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) return { ok: true, reply: parsed.data };
  }
  return { ok: false, message: AI_UNAVAILABLE_MESSAGE, retryAfterSeconds: null };
}

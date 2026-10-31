import {
  AI_RATE_LIMIT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  AiChatResponseSchema,
  CSRF_HEADER,
  type AiChatRequest,
  type AiChatResponse,
} from '@ideamap/contracts';
import type { Anonymiser } from '@ideamap/ai/anonymise';
import { ModelUnavailableError } from '@ideamap/ai/device';
import { PRIVACY_UNAVAILABLE_MESSAGE, privacyLayer } from './privacy';

// The student app's client for the AI gateway (A1). The app sends only the
// conversation; the server picks the persona by route and fills its prompt (§6, §9).
// Everything the student typed is blurred on the device first and the reply is filled
// back in (D26, A7); if blurring fails (for instance no model can be loaded) nothing is sent. Errors come back as plain sentences for the student, never a raw status (A1-U1).

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
  /** The device's anonymous layer; defaults to this tab's. */
  anonymiser?: Anonymiser;
}

export async function askPersona(
  fetchFn: typeof fetch,
  { classId, persona, csrfToken, request, anonymiser = privacyLayer() }: AskOptions,
): Promise<AskResult> {
  let body: AiChatRequest;
  try {
    // Turns are blurred with the same mapping, so earlier labels stay the same.
    body = { message: await anonymiser.blur(request.message) };
    if (request.history) {
      body.history = [];
      for (const turn of request.history) {
        body.history.push({ role: turn.role, text: await anonymiser.blur(turn.text) });
      }
    }
  } catch (error) {
    // Nothing has been sent. Without a model the device can't hide names (D33).
    const message =
      error instanceof ModelUnavailableError ? PRIVACY_UNAVAILABLE_MESSAGE : AI_UNAVAILABLE_MESSAGE;
    return { ok: false, message, retryAfterSeconds: null };
  }
  let res: Response;
  try {
    res = await fetchFn(`/api/classes/${encodeURIComponent(classId)}/ai/${persona}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
      body: JSON.stringify(body),
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
    if (parsed.success) {
      return { ok: true, reply: { ...parsed.data, reply: anonymiser.refill(parsed.data.reply) } };
    }
  }
  return { ok: false, message: AI_UNAVAILABLE_MESSAGE, retryAfterSeconds: null };
}

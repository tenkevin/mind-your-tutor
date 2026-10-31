import { createHmac, hkdfSync } from 'node:crypto';
import {
  AI_RATE_LIMIT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  AiChatRequestSchema,
  type AiChatResponse,
  type AiErrorCode,
  type ClassConfig,
  type Grade,
  type Pack,
} from '@ideamap/contracts';
import {
  FALLBACK_MESSAGE,
  REDIRECT_MESSAGE,
  fill,
  flagCategory,
  patternBackstop,
  requestsPersonalData,
  resolveEffectivePersonas,
  supportMessage,
  withGuardrails,
  type IdentifierBackstop,
  type ModerationCategory,
  type PersonaDefinition,
  type PromptConfig,
} from '@ideamap/ai';
import { json } from '@ideamap/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Trx } from '../db.js';
import { ALL_ROLES, STAFF, type RoutePolicy } from '../policy.js';
import { raiseFlag } from '../safety.js';
import type { AiConfig } from './config.js';
import { AiRateLimiter } from './limits.js';
import { moderate, ModerationError, type ModerationProvider } from './moderation.js';
import {
  checkReply,
  ModelError,
  type ModelFailure,
  type ModelProvider,
  type ModelReply,
  type ModelTurn,
} from './provider.js';

// The AI gateway (ARCHITECTURE.md §6, §9, §10; task A1). Every model call goes through
// here. For each call it:
//
// 1. checks access (the route's F5 policy) and the request shape: only the conversation,
//    never a prompt, persona or variables (A1-F3);
// 2. resolves the persona from packages/ai's registry with the pack's and the class's
//    overrides (D13), and checks the persona's audience;
// 3. takes one call from the student's and the class's rate limits (A1-F4);
// 4. fills the template from the class's effective config (§6), and runs the
//    identifier backstop over the filled prompt and the student's text (D26; A7 adds
//    to it);
// 5. for a student-facing persona (A2), adds the fixed guardrails after the filled
//    template and moderates the student's message before the model sees it: unsafe
//    input never reaches the model, a concerning one raises a flag for the teacher
//    and admin, and a moderator that fails closes the turn;
// 6. calls the provider with a pseudonymous user id and a timeout;
// 7. for a student-facing persona, checks the reply (moderation, and no request for
//    personal data) before the student sees it, and shows a safe fallback otherwise;
// 8. stores the redacted transcript in ai_interaction, which F6's retention, export and
//    delete already cover, and answers with the reply or a plain error.
//
// Logs carry the persona, the failure kind and token counts, never text.

export interface AiGatewayOptions {
  provider: ModelProvider;
  config: Pick<AiConfig, 'model' | 'maxTokens' | 'timeoutMs' | 'moderationTimeoutMs' | 'limits'>;
  /** Moderates every student turn, in and out (A2). Required: there is no unmoderated mode. */
  moderation: ModerationProvider;
  /** Defaults to the pattern backstop; A7 replaces it. */
  backstop?: IdentifierBackstop;
}

export interface AiGatewayDeps {
  sessionSecret: string;
  now: () => Date;
}

/** Student-facing personas; students may call only these, in a class they're in. */
export const STUDENT_AI_POLICY: RoutePolicy = {
  roles: ALL_ROLES,
  scope: { kind: 'class', param: 'classId', students: true },
};
/** Atlas, the teacher-facing helper: staff of the class only (A4 adds its tools). */
export const STAFF_AI_POLICY: RoutePolicy = {
  roles: STAFF,
  scope: { kind: 'class', param: 'classId', students: false },
};

/** One route per persona, so the persona is chosen by the server, never the body. */
export const AI_ROUTES = [
  { persona: 'tutor', url: '/api/classes/:classId/ai/tutor', policy: STUDENT_AI_POLICY },
  { persona: 'peer', url: '/api/classes/:classId/ai/peer', policy: STUDENT_AI_POLICY },
  { persona: 'agent', url: '/api/classes/:classId/ai/agent', policy: STAFF_AI_POLICY },
] as const;

type Params = { Params: { classId: string } };

interface CallContext {
  course: PromptConfig;
  persona: PersonaDefinition;
  names: string[];
  identifiers: string[];
}

class NoCurriculum extends Error {}

/** The latest of each layer that sets a value: pack, then curriculum defaults, then class. */
function layered<T>(...values: (T | undefined)[]): T | undefined {
  return values.reduce<T | undefined>((acc, v) => (v === undefined ? acc : v), undefined);
}

async function loadContext(
  trx: Trx,
  classId: string,
  personaId: string,
  callerId: string,
): Promise<CallContext> {
  const klass = await trx
    .selectFrom('class')
    .select(['curriculum_id', 'pinned_version_id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirstOrThrow();
  // The class's pinned version, else the curriculum's latest published one.
  let version = trx
    .selectFrom('curriculum_version')
    .select(['pack'])
    .where('curriculum_id', '=', klass.curriculum_id)
    .where('status', '=', 'published');
  version = klass.pinned_version_id
    ? version.where('id', '=', klass.pinned_version_id)
    : version.orderBy('number', 'desc').limit(1);
  const row = await version.executeTakeFirst();
  if (!row) throw new NoCurriculum();
  const pack = row.pack as Pack;

  const defaults = (
    await trx
      .selectFrom('curriculum_defaults')
      .select('config')
      .where('curriculum_id', '=', klass.curriculum_id)
      .executeTakeFirst()
  )?.config as ClassConfig | undefined;
  const own = (
    await trx
      .selectFrom('class_config')
      .select('config')
      .where('class_id', '=', classId)
      .executeTakeFirst()
  )?.config as ClassConfig | undefined;

  const course: PromptConfig = {
    subject: layered(pack.course.subject, defaults?.course?.subject, own?.course?.subject)!,
    topic: layered(pack.course.topic, defaults?.course?.topic, own?.course?.topic)!,
    grade: layered<Grade>(pack.course.grade, defaults?.course?.grade, own?.course?.grade)!,
  };
  // Built-ins (D13), then the pack's Personas tab and curriculum defaults, then the class.
  const persona = resolveEffectivePersonas(
    [...pack.personas, ...(defaults?.personas ?? [])],
    own?.personas ?? [],
  ).find((p) => p.persona_id === personaId)!;

  // Everyone in the class, and the caller: names and ids the model must never receive.
  const people = await trx
    .selectFrom('app_user')
    .select(['name', 'email', 'roster_source_id', 'sso_subject'])
    .where((eb) =>
      eb.or([
        eb(
          'id',
          'in',
          eb.selectFrom('enrollment').select('student_id').where('class_id', '=', classId),
        ),
        eb('id', '=', klass.teacher_id),
        eb('id', '=', callerId),
      ]),
    )
    .execute();
  return {
    course,
    persona,
    names: people.map((p) => p.name),
    identifiers: people.flatMap((p) =>
      [p.email, p.roster_source_id, p.sso_subject].filter((v): v is string => Boolean(v)),
    ),
  };
}

/** A provider call with a hard timeout, even if the provider ignores the signal. */
async function callWithTimeout(
  provider: ModelProvider,
  request: Omit<Parameters<ModelProvider['complete']>[0], 'signal'>,
  timeoutMs: number,
): Promise<ModelReply> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelError('timeout'));
    }, timeoutMs);
  });
  try {
    const reply = await Promise.race([
      provider.complete({ ...request, signal: controller.signal }),
      timeout,
    ]);
    return checkReply(reply);
  } catch (error) {
    if (error instanceof ModelError) throw error;
    throw new ModelError('provider_error');
  } finally {
    clearTimeout(timer);
  }
}

function fail(reply: FastifyReply, status: number, code: AiErrorCode, error: string) {
  return reply.code(status).header('cache-control', 'no-store').send({ error, code });
}

export function aiRoutes(
  app: FastifyInstance,
  deps: AiGatewayDeps,
  options: AiGatewayOptions,
): void {
  const { provider, config, moderation } = options;
  const backstop = options.backstop ?? patternBackstop;
  const limiter = new AiRateLimiter(config.limits, () => deps.now().getTime());
  const pseudonymKey = Buffer.from(
    hkdfSync('sha256', deps.sessionSecret, 'ideamap-ai', 'provider-pseudonym', 32),
  );
  // Stable per user, unlinkable to their record without the server's secret (§10).
  const pseudonym = (orgId: string, userId: string) =>
    'u_' + createHmac('sha256', pseudonymKey).update(`${orgId}:${userId}`).digest('base64url');

  for (const route of AI_ROUTES) {
    app.post<Params>(route.url, { config: { policy: route.policy } }, async (req, reply) =>
      handle(req, reply, route.persona),
    );
  }

  async function handle(req: FastifyRequest<Params>, reply: FastifyReply, personaId: string) {
    const parsed = AiChatRequestSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'invalid_request', 'Invalid request');
    const session = req.session!;
    const { classId } = req.params;

    let context: CallContext;
    try {
      context = await req.withOrg((trx) => loadContext(trx, classId, personaId, session.userId));
    } catch (error) {
      if (!(error instanceof NoCurriculum)) throw error;
      return fail(reply, 409, 'unavailable', AI_UNAVAILABLE_MESSAGE);
    }
    // A class may retarget a persona at teachers; then students can't call it.
    if (session.role === 'student' && context.persona.audience !== 'Students') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Only a call that may go ahead takes quota; a refused one (403, 409) doesn't.
    const limited = limiter.take(session.userId, classId);
    if (limited) {
      req.log.info({ persona: personaId, limit: 'rate' }, 'ai call rate limited');
      reply.header('retry-after', String(limited.retryAfter));
      return fail(reply, 429, 'rate_limited', AI_RATE_LIMIT_MESSAGE);
    }

    // Earlier turns as the client holds them, then this turn; a provider conversation
    // starts with the user, so leading assistant turns are dropped.
    const turns = [...parsed.data.history, { role: 'student' as const, text: parsed.data.message }];
    const first = turns.findIndex((t) => t.role === 'student');
    const kept = turns.slice(first);
    // The filled prompt goes through the backstop too: a teacher's template, topic or
    // subject can name a student (A1-F6). One call, so labels match across the prompt
    // and the turns.
    const blurred = backstop.blur(
      [fill(context.course, context.persona), ...kept.map((t) => t.text)],
      { names: context.names, identifiers: context.identifiers },
    );
    const [template, ...texts] = blurred.texts as [string, ...string[]];
    // A student-facing persona gets the fixed guardrails after the teacher's template,
    // whatever the template, pack or class says (A2-F3).
    const studentFacing = context.persona.audience === 'Students';
    const system = studentFacing ? withGuardrails(template) : template;
    const messages: ModelTurn[] = kept.map((t, i) => ({
      role: t.role === 'student' ? 'user' : 'assistant',
      content: texts[i]!,
    }));
    const user = pseudonym(session.orgId, session.userId);
    const blocked: Blocked = { input: null, output: null, moderationFailure: null };

    // Input moderation (A2-F1, F6): the new message, as blurred, before any model call.
    let inputCategories: ModerationCategory[] = [];
    if (studentFacing) {
      try {
        inputCategories = (
          await moderate(
            moderation,
            { text: texts[texts.length - 1]!, direction: 'input', user },
            config.moderationTimeoutMs,
          )
        ).categories;
      } catch (error) {
        blocked.moderationFailure =
          error instanceof ModerationError ? error.failure : 'provider_error';
      }
    }
    const concern = flagCategory(inputCategories);
    if (inputCategories.length > 0) blocked.input = inputCategories;

    let result: ModelReply | null = null;
    let failure: ModelFailure | null = null;
    if (!blocked.moderationFailure && !blocked.input) {
      try {
        result = await callWithTimeout(
          provider,
          { model: config.model, system, messages, user, maxTokens: config.maxTokens },
          config.timeoutMs,
        );
      } catch (error) {
        failure = error instanceof ModelError ? error.failure : 'provider_error';
      }
    }

    // The stored reply is blurred too, in case the model echoed an identifier.
    const storedReply = result
      ? backstop.blur([result.text], { names: context.names, identifiers: context.identifiers })
          .texts[0]!
      : null;

    // Output moderation (A2-F2, S2): the reply never reaches the student unchecked.
    if (studentFacing && storedReply !== null) {
      if (requestsPersonalData(storedReply)) {
        blocked.output = { reason: 'personal_data', categories: [] };
      } else {
        try {
          const verdict = await moderate(
            moderation,
            { text: storedReply, direction: 'output', user },
            config.moderationTimeoutMs,
          );
          if (verdict.categories.length > 0) {
            blocked.output = { reason: 'moderation', categories: verdict.categories };
          }
        } catch (error) {
          blocked.moderationFailure =
            error instanceof ModerationError ? error.failure : 'provider_error';
        }
      }
    }

    // What the student is shown, if not the model's reply.
    let help: string | null = null;
    const row = await req.withOrg(async (trx) => {
      const stored = await trx
        .insertInto('ai_interaction')
        .values({
          org_id: session.orgId,
          class_id: classId,
          user_id: session.userId,
          persona: context.persona.persona_id,
          model:
            result?.model ?? (blocked.input || blocked.moderationFailure ? 'none' : config.model),
          request: json({
            provider: provider.name,
            system,
            messages,
            privacy_misses: blurred.misses,
            ...(studentFacing ? { moderation: moderation.name } : {}),
          }),
          response: json(
            blocked.moderationFailure
              ? { error: `moderation_${blocked.moderationFailure}` }
              : blocked.input
                ? { blocked: 'input', categories: blocked.input }
                : blocked.output
                  ? { blocked: 'output', ...blocked.output }
                  : result
                    ? { text: storedReply }
                    : { error: failure },
          ),
          flagged: Boolean(concern) && !blocked.moderationFailure,
          input_tokens: result?.inputTokens ?? null,
          output_tokens: result?.outputTokens ?? null,
          redacted_at: deps.now(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (concern && !blocked.moderationFailure) {
        // Raised with the transcript, in one transaction, so a flag always has its text.
        const policy = await raiseFlag(trx, {
          orgId: session.orgId,
          classId,
          interactionId: stored.id,
          category: concern,
        });
        help = policy.helpText;
      }
      return stored;
    });

    const log = {
      persona: personaId,
      interactionId: row.id,
      privacyMisses: blurred.misses,
      inputTokens: result?.inputTokens,
      outputTokens: result?.outputTokens,
    };
    if (blocked.moderationFailure) {
      // Fails closed: nothing went to the model, or nothing came back to the student.
      req.log.warn(
        { ...log, failure: `moderation_${blocked.moderationFailure}` },
        'ai call failed',
      );
      return fail(reply, 502, 'unavailable', AI_UNAVAILABLE_MESSAGE);
    }
    if (blocked.input) {
      req.log.info({ ...log, blocked: 'input', flagged: Boolean(concern) }, 'ai turn moderated');
      return respond(
        reply,
        row.id,
        context,
        concern ? supportMessage(help) : REDIRECT_MESSAGE,
        concern ? 'support' : 'redirect',
      );
    }
    if (!result) {
      req.log.warn({ ...log, failure }, 'ai call failed');
      return fail(reply, 502, 'unavailable', AI_UNAVAILABLE_MESSAGE);
    }
    if (blocked.output) {
      req.log.warn(
        { ...log, blocked: 'output', reason: blocked.output.reason },
        'ai reply withheld',
      );
      return respond(reply, row.id, context, FALLBACK_MESSAGE, 'fallback');
    }
    req.log.info(log, 'ai call');
    return respond(reply, row.id, context, result.text);
  }
}

interface Blocked {
  input: ModerationCategory[] | null;
  output: { reason: 'moderation' | 'personal_data'; categories: ModerationCategory[] } | null;
  moderationFailure: 'timeout' | 'provider_error' | 'malformed' | null;
}

function respond(
  reply: FastifyReply,
  interactionId: string,
  context: CallContext,
  text: string,
  safety?: AiChatResponse['safety'],
) {
  const body: AiChatResponse = {
    interactionId,
    persona: { id: context.persona.persona_id, name: context.persona.name },
    reply: text,
    ...(safety ? { safety } : {}),
  };
  return reply.header('cache-control', 'no-store').send(body);
}

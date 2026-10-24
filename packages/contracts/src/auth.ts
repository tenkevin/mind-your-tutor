import { z } from 'zod';
import { USE_FOR } from './spec.js';

// Sign-in, sessions and the access API (ARCHITECTURE.md §10 "Sign-in", "Access"; F5).

export const ROLES = ['admin', 'author', 'teacher', 'student'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** A configured SSO provider id, such as `google`, `clever` or `classlink`. */
export const ProviderIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);

/** GET /auth/providers: one entry per enabled provider, for the sign-in buttons. */
export const ProvidersResponseSchema = z.object({
  providers: z.array(z.object({ id: ProviderIdSchema, label: z.string().min(1).max(60) })),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;

/** GET /api/me. */
export const MeResponseSchema = z.object({
  user: z.object({ id: z.uuid(), role: RoleSchema, name: z.string() }),
  org: z.object({ id: z.uuid(), name: z.string() }),
  /** Send back as the `x-csrf-token` header on every POST, PUT and DELETE. */
  csrfToken: z.string().min(1),
  session: z.object({ idleMinutes: z.number().int().positive(), expiresAt: z.iso.datetime() }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Why a sign-in was refused, as `/sign-in?error=<code>`. The messages are plain and
 * never say whether an account exists (F5-S7, F5-U2).
 */
export const SIGN_IN_ERRORS = {
  not_linked: "Your school account isn't linked to a class yet. Ask your teacher.",
  linked_elsewhere:
    'Your school account already signs in with a different button. Please use that one.',
  expired: 'Your session ended. Please sign in again.',
  too_many: 'Too many sign-in attempts. Please wait a minute and try again.',
  failed: "Sign-in didn't work. Please try again.",
} as const;
export type SignInError = keyof typeof SIGN_IN_ERRORS;

export function signInMessage(code: string | null): string | null {
  if (code === null) return null;
  return Object.hasOwn(SIGN_IN_ERRORS, code)
    ? SIGN_IN_ERRORS[code as SignInError]
    : SIGN_IN_ERRORS.failed;
}

/**
 * A `returnTo` value that stays on this site: a path starting with one `/`, with no
 * scheme, host or backslash. Anything else becomes `/` (F5-S6).
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  const base = 'http://same.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return '/';
  }
  if (url.origin !== base) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

/** GET /api/classes. */
export const ClassSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  curriculumId: z.uuid(),
  teacherId: z.uuid(),
});
export const ClassesResponseSchema = z.object({ classes: z.array(ClassSummarySchema) });

/**
 * GET /api/classes/:classId/header: what the teacher console header shows (T1). Subject
 * and topic are the class's values, else the curriculum's defaults, else the latest
 * version's Course tab; null when the curriculum has no version yet.
 */
export const ClassHeaderResponseSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
});
export type ClassHeaderResponse = z.infer<typeof ClassHeaderResponseSchema>;

/** PUT /api/classes/:classId/library/:libraryDocId (D11). */
export const ClassLibrarySettingRequestSchema = z.strictObject({
  use_for: z.enum([...USE_FOR, 'off']),
});

/** PUT /api/users/:userId/role. */
export const RoleChangeRequestSchema = z.strictObject({ role: RoleSchema });

/** POST /api/roster/import: the three OneRoster 1.1 CSV files, as text. */
export const RosterImportRequestSchema = z.strictObject({
  /** Curriculum for classes the import creates. Existing classes keep their own. */
  curriculumId: z.uuid(),
  users: z.string().max(5_000_000),
  classes: z.string().max(5_000_000),
  enrollments: z.string().max(5_000_000),
});
export type RosterImportRequest = z.infer<typeof RosterImportRequestSchema>;

import type { Role } from '@ideamap/contracts';
import type { Db } from '@ideamap/db';
import type { AuthConfig } from './config.js';
import { scoped } from './db.js';
import { randomToken, sha256 } from './tokens.js';

// Server-side sessions (F5-F7). The browser holds a random token in an HttpOnly cookie;
// the database holds its SHA-256. Sign-out revokes the row, so a replayed cookie is
// refused. Sessions end after the role's idle limit or the absolute limit.

export interface Session {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  name: string;
  /** The cookie token, kept only in memory for this request (to derive the CSRF token). */
  token: string;
  expiresAt: Date;
  idleMinutes: number;
}

/** last_seen_at is written at most this often, so most requests only read. */
const TOUCH_EVERY_MS = 60_000;

export async function createSession(
  db: Db,
  config: AuthConfig,
  input: { orgId: string; userId: string; provider: string; now: Date },
): Promise<{ id: string; token: string }> {
  const token = randomToken();
  const row = await scoped(db, { orgId: input.orgId }, (trx) =>
    trx
      .insertInto('auth_session')
      .values({
        org_id: input.orgId,
        user_id: input.userId,
        token_hash: sha256(token),
        provider: input.provider,
        created_at: input.now,
        last_seen_at: input.now,
        expires_at: new Date(input.now.getTime() + config.maxSessionHours * 3_600_000),
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );
  return { id: row.id, token };
}

/** The live session for a cookie, or null if it's unknown, revoked, idle or expired. */
export async function findSession(
  db: Db,
  config: AuthConfig,
  cookie: { orgId: string; token: string },
  now: Date,
): Promise<Session | null> {
  return scoped(db, { orgId: cookie.orgId }, async (trx) => {
    const row = await trx
      .selectFrom('auth_session as s')
      .innerJoin('app_user as u', 'u.id', 's.user_id')
      .select([
        's.id',
        's.org_id',
        's.user_id',
        's.last_seen_at',
        's.expires_at',
        's.revoked_at',
        'u.role',
        'u.name',
      ])
      .where('s.token_hash', '=', sha256(cookie.token))
      .executeTakeFirst();
    if (!row || row.revoked_at || row.expires_at <= now) return null;
    const idleMinutes = config.idleMinutes[row.role];
    const idleFor = now.getTime() - row.last_seen_at.getTime();
    if (idleFor > idleMinutes * 60_000) return null;
    if (idleFor > TOUCH_EVERY_MS) {
      await trx
        .updateTable('auth_session')
        .set({ last_seen_at: now })
        .where('id', '=', row.id)
        .execute();
    }
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      role: row.role,
      name: row.name,
      token: cookie.token,
      expiresAt: row.expires_at,
      idleMinutes,
    };
  });
}

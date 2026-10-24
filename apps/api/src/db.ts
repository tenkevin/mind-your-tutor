import {
  ACTOR_SETTING,
  APP_ROLE,
  CLASS_SETTING,
  ORG_SETTING,
  json,
  type Database,
  type Db,
} from '@ideamap/db';
import { sql, type Transaction } from 'kysely';

export type Trx = Transaction<Database>;

export interface Scope {
  /** The organization row-level security shows; null shows no tenant rows at all. */
  orgId: string | null;
  /** Also show this class's uploads (D11). */
  classId?: string | null;
  /** The signed-in user, recorded as the actor on audit rows the triggers write (F6). */
  actorId?: string | null;
}

/**
 * Run `fn` in a transaction acting for one organization, as the app role (§10). Every
 * query the API makes goes through here: route handlers get only this, never the pool,
 * so row-level security applies to every request (F5-S4). Switching to the app role
 * drops any extra privileges the pool's login has, so this holds even when the API
 * connects as a more privileged role, as it may locally.
 */
export function scoped<T>(db: Db, scope: Scope, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`
      SELECT set_config('role', ${APP_ROLE}, true),
        set_config(${ORG_SETTING}, ${scope.orgId ?? ''}, true),
        set_config(${CLASS_SETTING}, ${scope.classId ?? ''}, true),
        set_config(${ACTOR_SETTING}, ${scope.actorId ?? ''}, true)
    `.execute(trx);
    return fn(trx);
  });
}

export async function audit(
  trx: Trx,
  event: {
    orgId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    detail?: Record<string, unknown>;
    at: Date;
  },
): Promise<void> {
  await trx
    .insertInto('audit_event')
    .values({
      org_id: event.orgId,
      actor_id: event.actorId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId,
      detail: json(event.detail ?? {}),
      at: event.at,
    })
    .execute();
}

import type { Roster, RosterSkip } from '@ideamap/connectors';
import type { Trx } from './db.js';

// OneRoster import into one org (F5-F8). Users and classes are matched by their
// sourcedId, and users not yet rostered by school email, so re-importing the same
// files changes nothing. Roles of existing users are kept: an admin may have made a
// teacher an author in the app, and a roster file doesn't know that.

export interface RosterImportResult {
  users: { created: number; updated: number };
  classes: { created: number; updated: number };
  enrollments: { created: number };
  skipped: RosterSkip[];
}

export async function importRoster(
  trx: Trx,
  orgId: string,
  curriculumId: string,
  roster: Roster,
): Promise<RosterImportResult | { error: string }> {
  const curriculum = await trx
    .selectFrom('curriculum')
    .select('id')
    .where('id', '=', curriculumId)
    .executeTakeFirst();
  if (!curriculum) return { error: 'Unknown curriculum' };

  const result: RosterImportResult = {
    users: { created: 0, updated: 0 },
    classes: { created: 0, updated: 0 },
    enrollments: { created: 0 },
    skipped: [...roster.skipped],
  };

  const userIds = new Map<string, string>();
  for (const user of roster.users) {
    let existing = await trx
      .selectFrom('app_user')
      .select(['id', 'name', 'roster_source_id'])
      .where('roster_source_id', '=', user.sourcedId)
      .executeTakeFirst();
    if (!existing && user.email) {
      existing = await trx
        .selectFrom('app_user')
        .select(['id', 'name', 'roster_source_id'])
        .where('email', '=', user.email)
        .where('roster_source_id', 'is', null)
        .executeTakeFirst();
    }
    if (existing) {
      userIds.set(user.sourcedId, existing.id);
      if (existing.name !== user.name || existing.roster_source_id !== user.sourcedId) {
        await trx
          .updateTable('app_user')
          .set({ name: user.name, roster_source_id: user.sourcedId })
          .where('id', '=', existing.id)
          .execute();
        result.users.updated++;
      }
      continue;
    }
    if (user.email) {
      const taken = await trx
        .selectFrom('app_user')
        .select('id')
        .where('email', '=', user.email)
        .executeTakeFirst();
      if (taken) {
        result.skipped.push({
          file: 'users.csv',
          line: 0,
          reason: `${user.sourcedId}: email already belongs to another rostered user`,
        });
        continue;
      }
    }
    const created = await trx
      .insertInto('app_user')
      .values({
        org_id: orgId,
        role: user.role,
        name: user.name,
        email: user.email,
        roster_source_id: user.sourcedId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    userIds.set(user.sourcedId, created.id);
    result.users.created++;
  }

  const classIds = new Map<string, string>();
  for (const klass of roster.classes) {
    const existing = await trx
      .selectFrom('class')
      .select(['id', 'name'])
      .where('roster_source_id', '=', klass.sourcedId)
      .executeTakeFirst();
    if (existing) {
      classIds.set(klass.sourcedId, existing.id);
      if (existing.name !== klass.title) {
        await trx
          .updateTable('class')
          .set({ name: klass.title })
          .where('id', '=', existing.id)
          .execute();
        result.classes.updated++;
      }
      continue;
    }
    const teachers = roster.enrollments
      .filter((e) => e.classSourcedId === klass.sourcedId && e.role === 'teacher')
      .sort((a, b) => Number(b.primary) - Number(a.primary));
    const teacherId = teachers.map((t) => userIds.get(t.userSourcedId)).find(Boolean);
    if (!teacherId) {
      result.skipped.push({
        file: 'classes.csv',
        line: 0,
        reason: `${klass.sourcedId}: no teacher enrolled`,
      });
      continue;
    }
    const created = await trx
      .insertInto('class')
      .values({
        org_id: orgId,
        curriculum_id: curriculumId,
        teacher_id: teacherId,
        name: klass.title,
        roster_source_id: klass.sourcedId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    classIds.set(klass.sourcedId, created.id);
    result.classes.created++;
  }

  for (const enrollment of roster.enrollments) {
    if (enrollment.role !== 'student') continue;
    const classId = classIds.get(enrollment.classSourcedId);
    const studentId = userIds.get(enrollment.userSourcedId);
    if (!classId || !studentId) continue;
    const inserted = await trx
      .insertInto('enrollment')
      .values({ org_id: orgId, class_id: classId, student_id: studentId })
      .onConflict((oc) => oc.columns(['class_id', 'student_id']).doNothing())
      .returning('student_id')
      .executeTakeFirst();
    if (inserted) result.enrollments.created++;
  }
  return result;
}

// OneRoster 1.1 CSV rostering (ARCHITECTURE.md §10 "rostering by OneRoster CSV
// import"; import-only, as D4). Reads users.csv, classes.csv and enrollments.csv and
// keeps only what §10's COPPA row allows: names, school email and roster ids. Phone,
// SMS, grades, birth dates, passwords and every other column are dropped here.

/** Parse RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, an optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new RosterError('A quoted CSV field is never closed.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export class RosterError extends Error {}

/** Rows as records keyed by header, header names trimmed and case-folded. */
function records(text: string, file: string, required: readonly string[]) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new RosterError(`${file} is empty.`);
  const names = header.map((h) => h.trim().toLowerCase());
  for (const name of required) {
    if (!names.includes(name.toLowerCase())) {
      throw new RosterError(`${file} has no ${name} column.`);
    }
  }
  return rows.map((cells, index) => {
    const get = (name: string) => (cells[names.indexOf(name.toLowerCase())] ?? '').trim();
    return { get, line: index + 2 };
  });
}

export type RosterRole = 'admin' | 'teacher' | 'student';

export interface RosterUser {
  sourcedId: string;
  role: RosterRole;
  name: string;
  /** Lower-case school email, or null. */
  email: string | null;
}

export interface RosterClass {
  sourcedId: string;
  title: string;
}

export interface RosterEnrollment {
  classSourcedId: string;
  userSourcedId: string;
  role: 'teacher' | 'student';
  primary: boolean;
}

export interface RosterSkip {
  file: 'users.csv' | 'classes.csv' | 'enrollments.csv';
  line: number;
  reason: string;
}

export interface Roster {
  users: RosterUser[];
  classes: RosterClass[];
  enrollments: RosterEnrollment[];
  skipped: RosterSkip[];
}

const USER_ROLES: Record<string, RosterRole> = {
  administrator: 'admin',
  teacher: 'teacher',
  student: 'student',
};
const ID = /^[^\s,]{1,255}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function deleted(get: (name: string) => string): boolean {
  return get('status').toLowerCase() === 'tobedeleted';
}

/** Parse the three files. Rows that can't be used are listed in `skipped`, not thrown. */
export function parseOneRoster(files: {
  users: string;
  classes: string;
  enrollments: string;
}): Roster {
  const skipped: RosterSkip[] = [];
  const users: RosterUser[] = [];
  const seenUsers = new Set<string>();
  for (const { get, line } of records(files.users, 'users.csv', [
    'sourcedId',
    'role',
    'givenName',
    'familyName',
  ])) {
    const skip = (reason: string) => skipped.push({ file: 'users.csv', line, reason });
    const sourcedId = get('sourcedId');
    const role = USER_ROLES[get('role').toLowerCase()];
    const name = `${get('givenName')} ${get('familyName')}`.trim().slice(0, 200);
    const email = get('email').toLowerCase();
    if (!ID.test(sourcedId)) skip('sourcedId is missing or not an id');
    else if (deleted(get)) skip('marked tobedeleted');
    else if (!role) skip(`role "${get('role').slice(0, 40)}" is not imported`);
    else if (!name) skip('no name');
    else if (seenUsers.has(sourcedId)) skip('duplicate sourcedId');
    else {
      seenUsers.add(sourcedId);
      users.push({
        sourcedId,
        role,
        name,
        email: email && EMAIL.test(email) && email.length <= 320 ? email : null,
      });
    }
  }

  const classes: RosterClass[] = [];
  const seenClasses = new Set<string>();
  for (const { get, line } of records(files.classes, 'classes.csv', ['sourcedId', 'title'])) {
    const skip = (reason: string) => skipped.push({ file: 'classes.csv', line, reason });
    const sourcedId = get('sourcedId');
    const title = get('title').slice(0, 200);
    if (!ID.test(sourcedId)) skip('sourcedId is missing or not an id');
    else if (deleted(get)) skip('marked tobedeleted');
    else if (!title) skip('no title');
    else if (seenClasses.has(sourcedId)) skip('duplicate sourcedId');
    else {
      seenClasses.add(sourcedId);
      classes.push({ sourcedId, title });
    }
  }

  const enrollments: RosterEnrollment[] = [];
  const seenEnrollments = new Set<string>();
  for (const { get, line } of records(files.enrollments, 'enrollments.csv', [
    'classSourcedId',
    'userSourcedId',
    'role',
  ])) {
    const skip = (reason: string) => skipped.push({ file: 'enrollments.csv', line, reason });
    const classSourcedId = get('classSourcedId');
    const userSourcedId = get('userSourcedId');
    const role = get('role').toLowerCase();
    const key = `${classSourcedId}\u0000${userSourcedId}`;
    if (deleted(get)) skip('marked tobedeleted');
    else if (role !== 'teacher' && role !== 'student')
      skip(`role "${role.slice(0, 40)}" is not imported`);
    else if (!seenClasses.has(classSourcedId)) skip('unknown class');
    else if (!seenUsers.has(userSourcedId)) skip('unknown user');
    else if (seenEnrollments.has(key)) skip('duplicate enrollment');
    else {
      seenEnrollments.add(key);
      enrollments.push({
        classSourcedId,
        userSourcedId,
        role,
        primary: get('primary').toLowerCase() === 'true',
      });
    }
  }
  return { users, classes, enrollments, skipped };
}

import { readFileSync } from 'node:fs';
import { parsePack, type ClassConfig } from '@ideamap/contracts';
import { json, type Db, type UserRole } from '@ideamap/db';
import type { MockProvider, MockUser } from './mock-idp.js';

// Sample organizations and users for the mock identity provider, local development
// and the API tests. Clearly fake: example.org addresses and made-up names.

export const SAMPLE_PROVIDERS = {
  google: { label: 'Google', tenantClaim: 'hd' },
  clever: { label: 'Clever', tenantClaim: 'district' },
  classlink: { label: 'ClassLink', tenantClaim: 'tenant_id' },
} as const;
export type SampleProvider = keyof typeof SAMPLE_PROVIDERS;

const TENANTS = {
  a: { google: 'district-a.example.org', clever: 'clever-district-a', classlink: 'classlink-a' },
  b: { google: 'district-b.example.org', clever: 'clever-district-b', classlink: 'classlink-b' },
} as const;

interface SampleUser {
  key: string;
  org: 'a' | 'b';
  role: UserRole;
  name: string;
  email: string | null;
  /** How this user signs in; null for a rostered user not yet linked to a provider. */
  sso: { provider: SampleProvider; sub: string } | null;
}

export const SAMPLE_USERS = [
  {
    key: 'admin-a',
    org: 'a',
    role: 'admin',
    name: 'Ada Admin',
    email: 'ada.admin@district-a.example.org',
    sso: { provider: 'google', sub: 'g-admin-a' },
  },
  {
    key: 'author-a',
    org: 'a',
    role: 'author',
    name: 'Alex Author',
    email: 'alex.author@district-a.example.org',
    sso: { provider: 'google', sub: 'g-author-a' },
  },
  {
    key: 'teacher-a1',
    org: 'a',
    role: 'teacher',
    name: 'Terry Teacher',
    email: 'terry.teacher@district-a.example.org',
    sso: { provider: 'google', sub: 'g-teacher-a1' },
  },
  {
    key: 'teacher-a2',
    org: 'a',
    role: 'teacher',
    name: 'Tess Teacher',
    email: 'tess.teacher@district-a.example.org',
    sso: { provider: 'clever', sub: 'c-teacher-a2' },
  },
  {
    key: 'student-a1',
    org: 'a',
    role: 'student',
    name: 'Sam Student',
    email: 'sam.student@district-a.example.org',
    sso: { provider: 'google', sub: 'g-student-a1' },
  },
  {
    key: 'student-a2',
    org: 'a',
    role: 'student',
    name: 'Sky Student',
    email: null,
    sso: { provider: 'classlink', sub: 'l-student-a2' },
  },
  {
    key: 'unenrolled-a',
    org: 'a',
    role: 'student',
    name: 'Uma Unenrolled',
    email: 'uma.unenrolled@district-a.example.org',
    sso: { provider: 'google', sub: 'g-unenrolled-a' },
  },
  {
    key: 'rostered-a',
    org: 'a',
    role: 'student',
    name: 'Riley Rostered',
    email: 'riley.rostered@district-a.example.org',
    sso: null,
  },
  {
    key: 'admin-b',
    org: 'b',
    role: 'admin',
    name: 'Bea Admin',
    email: 'bea.admin@district-b.example.org',
    sso: { provider: 'google', sub: 'g-admin-b' },
  },
  {
    key: 'teacher-b1',
    org: 'b',
    role: 'teacher',
    name: 'Blake Teacher',
    email: 'blake.teacher@district-b.example.org',
    sso: { provider: 'google', sub: 'g-teacher-b1' },
  },
  {
    key: 'student-b1',
    org: 'b',
    role: 'student',
    name: 'Bo Student',
    email: 'bo.student@district-b.example.org',
    sso: { provider: 'google', sub: 'g-student-b1' },
  },
] as const satisfies readonly SampleUser[];

export type SampleUserKey = (typeof SAMPLE_USERS)[number]['key'];

/** Identities the mock provider offers that have no account (or a conflicting one). */
const EXTRA_IDENTITIES: (MockUser & { provider: SampleProvider })[] = [
  // The rostered student's first sign-in: matched by verified school email, then linked.
  {
    provider: 'google',
    key: 'rostered-a',
    sub: 'g-rostered-a',
    tenant: TENANTS.a.google,
    name: 'Riley Rostered',
    email: 'riley.rostered@district-a.example.org',
  },
  // Terry's email again, from a different provider: refused, never a second account.
  {
    provider: 'clever',
    key: 'teacher-a1-on-clever',
    sub: 'c-teacher-a1',
    tenant: TENANTS.a.clever,
    name: 'Terry Teacher',
    email: 'terry.teacher@district-a.example.org',
  },
  {
    provider: 'google',
    key: 'stranger-a',
    sub: 'g-stranger-a',
    tenant: TENANTS.a.google,
    name: 'Stan Stranger',
    email: 'stan.stranger@district-a.example.org',
  },
  {
    provider: 'google',
    key: 'other-school',
    sub: 'g-other',
    tenant: 'unknown-school.example.org',
    name: 'Oli Other',
    email: 'oli@unknown-school.example.org',
  },
];

/** Claims real providers may send that the API must never keep (F5-S5). */
export const PII_CLAIMS = {
  picture: 'https://photos.example.org/sam.jpg',
  birthdate: '2015-04-01',
  phone_number: '+1 555 0100',
  address: { street_address: '1 Example Way', locality: 'Exampleton' },
  gender: 'unspecified',
};

export function mockProviders(): Record<SampleProvider, MockProvider> {
  const out = {} as Record<SampleProvider, MockProvider>;
  for (const [id, p] of Object.entries(SAMPLE_PROVIDERS) as [
    SampleProvider,
    (typeof SAMPLE_PROVIDERS)[SampleProvider],
  ][]) {
    const users: MockUser[] = [];
    for (const u of SAMPLE_USERS as readonly SampleUser[]) {
      if (u.sso?.provider !== id) continue;
      users.push({
        key: u.key,
        sub: u.sso.sub,
        tenant: TENANTS[u.org][id],
        name: u.name,
        ...(u.email ? { email: u.email } : {}),
        ...(u.role === 'student' ? { extra: PII_CLAIMS } : {}),
      });
    }
    for (const { provider, ...identity } of EXTRA_IDENTITIES) {
      if (provider === id) users.push(identity);
    }
    out[id] = { tenantClaim: p.tenantClaim, users };
  }
  return out;
}

export interface Sample {
  orgs: { a: string; b: string };
  users: Record<SampleUserKey, string>;
  curricula: { a: string; b: string };
  classes: { a1: string; a2: string; b1: string };
  libraryDocs: { a: string };
}

function waterCycle() {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../../../../fixtures/water-cycle/pack.json', import.meta.url), 'utf8'),
  );
  const pack = parsePack(raw).value;
  if (!pack) throw new Error('fixtures/water-cycle/pack.json did not parse');
  return pack;
}

/**
 * Create the sample orgs, users, curricula and classes. Runs as the migration role
 * (which bypasses row-level security), on a migrated database without them.
 */
export async function seedSample(db: Db): Promise<Sample> {
  const pack = waterCycle();
  const orgs = { a: '', b: '' };
  for (const key of ['a', 'b'] as const) {
    const org = await db
      .insertInto('organization')
      .values({ name: `Example District ${key.toUpperCase()}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    orgs[key] = org.id;
    await db
      .insertInto('sso_tenant')
      .values(
        (Object.keys(SAMPLE_PROVIDERS) as SampleProvider[]).map((provider) => ({
          provider,
          tenant: TENANTS[key][provider],
          org_id: org.id,
        })),
      )
      .execute();
  }

  const users = {} as Record<SampleUserKey, string>;
  for (const u of SAMPLE_USERS as readonly SampleUser[]) {
    const row = await db
      .insertInto('app_user')
      .values({
        org_id: orgs[u.org],
        role: u.role,
        name: u.name,
        email: u.email,
        sso_provider: u.sso?.provider ?? null,
        sso_subject: u.sso?.sub ?? null,
        roster_source_id: `roster-${u.key}`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    users[u.key as SampleUserKey] = row.id;
  }

  const curriculum = async (org: 'a' | 'b', author: string) => {
    const c = await db
      .insertInto('curriculum')
      .values({ org_id: orgs[org], title: 'The water cycle', created_by: author })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('curriculum_version')
      .values({
        org_id: orgs[org],
        curriculum_id: c.id,
        number: 1,
        status: 'published',
        pack: json(pack),
        source: json({
          kind: 'json' as const,
          file_ref: 'samples/water-cycle/pack.json',
          file_name: 'pack.json',
          checksum: '0'.repeat(64),
          column_mapping: [],
        }),
        published_at: new Date(),
      })
      .execute();
    await db
      .insertInto('curriculum_defaults')
      .values({
        org_id: orgs[org],
        curriculum_id: c.id,
        config: json<ClassConfig>({ course: { grade: '6' } }),
      })
      .execute();
    return c.id;
  };
  const curricula = {
    a: await curriculum('a', users['author-a']),
    b: await curriculum('b', users['admin-b']),
  };

  const doc = await db
    .insertInto('library_doc')
    .values({
      org_id: orgs.a,
      curriculum_id: curricula.a,
      title: 'Water cycle notes',
      file_url: 'samples/water-cycle/notes.pdf',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const klass = async (org: 'a' | 'b', name: string, teacher: string, students: string[]) => {
    const c = await db
      .insertInto('class')
      .values({ org_id: orgs[org], curriculum_id: curricula[org], teacher_id: teacher, name })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('class_config')
      .values({ org_id: orgs[org], class_id: c.id, config: json<ClassConfig>({}) })
      .execute();
    for (const student of students) {
      await db
        .insertInto('enrollment')
        .values({ org_id: orgs[org], class_id: c.id, student_id: student })
        .execute();
    }
    await db
      .insertInto('class_library_doc')
      .values({
        org_id: orgs[org],
        class_id: c.id,
        title: `${name} lab sheet`,
        file_url: `samples/${c.id}/lab-sheet.pdf`,
        uploaded_by: teacher,
      })
      .execute();
    return c.id;
  };
  // Two classes share curriculum A (D3).
  const classes = {
    a1: await klass('a', 'Science 6A', users['teacher-a1'], [
      users['student-a1'],
      users['rostered-a'],
    ]),
    a2: await klass('a', 'Science 6B', users['teacher-a2'], [users['student-a2']]),
    b1: await klass('b', 'Science 6 (B)', users['teacher-b1'], [users['student-b1']]),
  };
  return { orgs, users, curricula, classes, libraryDocs: { a: doc.id } };
}

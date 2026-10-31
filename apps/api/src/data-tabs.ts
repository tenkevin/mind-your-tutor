import {
  ColumnMappingRequestSchema,
  DATA_PAGE_DEFAULT,
  DATA_PAGE_MAX,
  DATA_TABS,
  TAB_NAMES,
  isSafeMediaRef,
  tabSpec,
  type ColumnMappingResponse,
  type DataTabId,
  type DataTabPage,
  type Pack,
  type TabName,
  type VersionIssue,
  type VersionListResponse,
} from '@ideamap/contracts';
import { json } from '@ideamap/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit } from './db.js';
import type { PolicyDeps } from './policy.js';

// Teacher Settings → From the spreadsheet (T6): a version's data as five read-only views
// (D4: data changes go through export, edit and re-import) and the curriculum's column
// mapping (§6: it belongs to the source, so a class can't override it; §11: it applies on
// the next import, never to versions already made). Reading is for the curriculum's
// author, its teachers and admins; changing the mapping is the author's or an admin's (D3).

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|ogv)$/i;

function shows(url: string | null): 'Image' | 'Video' | 'Link' | 'Placeholder' {
  if (!url) return 'Placeholder';
  const path = url.split(/[?#]/)[0] ?? url;
  if (IMAGE.test(path)) return 'Image';
  if (VIDEO.test(path)) return 'Video';
  return 'Link';
}

export interface PageRequest {
  offset: number;
  limit: number;
  /** For the standards view: only ideas with this code. */
  code?: string;
}

/** One page of a data view, built from a version's pack alone. */
export function dataTabPage(
  pack: Pack,
  tab: DataTabId,
  version: DataTabPage['version'],
  request: PageRequest,
): DataTabPage {
  const { offset, limit } = request;
  const page = <T>(rows: readonly T[]) => rows.slice(offset, offset + limit);
  const common = { version, offset, limit };
  const titles = new Map(pack.ideas.map((i) => [i.idea_id, i.title]));
  switch (tab) {
    case 'prerequisites': {
      // Ideas with prerequisites first, as the design lists them; order otherwise kept.
      const rows = pack.ideas
        .map((idea) => {
          const requires = idea.requires.map((id) => ({
            idea_id: id,
            title: titles.get(id) ?? null,
          }));
          const status: 'ok' | 'unknown' | 'none' =
            requires.length === 0
              ? 'none'
              : requires.some((r) => r.title === null)
                ? 'unknown'
                : 'ok';
          return { idea_id: idea.idea_id, title: idea.title, requires, status };
        })
        .sort((a, b) => Number(a.status === 'none') - Number(b.status === 'none'));
      return { tab, ...common, total: rows.length, rows: page(rows) };
    }
    case 'categories': {
      const counts = new Map<string, number>();
      for (const idea of pack.ideas)
        counts.set(idea.category, (counts.get(idea.category) ?? 0) + 1);
      const rows = pack.categories.map((c) => ({
        category: c.category,
        icon: c.icon,
        description: c.description,
        ideas: counts.get(c.category) ?? 0,
      }));
      return { tab, ...common, total: rows.length, rows: page(rows) };
    }
    case 'standards': {
      const counts = new Map<string, number>();
      for (const idea of pack.ideas) {
        for (const code of new Set(idea.standard_codes))
          counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      const codes = [...counts]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      const rows = pack.ideas
        .filter((i) => !request.code || i.standard_codes.includes(request.code))
        .map((i) => ({
          idea_id: i.idea_id,
          title: i.title,
          unit: i.unit,
          codes: i.standard_codes,
        }));
      return { tab, ...common, total: rows.length, codes, rows: page(rows) };
    }
    case 'media': {
      const row = (t: 'Ideas' | 'Links', label: string, url: string | null) => ({
        tab: t,
        label,
        media_url: url,
        shows: shows(url),
        usable: url === null ? true : isSafeMediaRef(url),
      });
      const rows = [
        ...pack.ideas.map((i) => row('Ideas', i.title, i.media_url)),
        ...pack.links
          .filter((l) => l.media_url)
          .map((l) =>
            row(
              'Links',
              `${titles.get(l.from_id) ?? l.from_id} → ${titles.get(l.to_id) ?? l.to_id}`,
              l.media_url,
            ),
          ),
      ];
      return { tab, ...common, total: rows.length, rows: page(rows) };
    }
    case 'assessment': {
      const ideasIn = new Map<number, number>();
      for (const idea of pack.ideas) ideasIn.set(idea.unit, (ideasIn.get(idea.unit) ?? 0) + 1);
      const asked = new Map<number, number>();
      for (const item of pack.assessment) {
        if (item.question) asked.set(item.unit, (asked.get(item.unit) ?? 0) + 1);
      }
      const rows = pack.units.map((u) => ({
        unit: u.unit,
        name: u.name,
        questions: asked.get(u.unit) ?? 0,
        ideas: ideasIn.get(u.unit) ?? 0,
      }));
      return { tab, ...common, total: rows.length, rows: page(rows) };
    }
  }
}

/** The source headers the newest import saw, by tab, for the mapping pickers. */
export function sourceHeaders(
  issues: readonly VersionIssue[],
  mapping: readonly { tab: TabName; source_column: string }[],
): Partial<Record<TabName, string[]>> {
  const found = new Map<TabName, Set<string>>();
  const add = (tab: TabName | null, header: string | null | undefined) => {
    if (!tab || !header) return;
    (found.get(tab) ?? found.set(tab, new Set()).get(tab)!).add(header);
  };
  for (const issue of issues) {
    if (issue.origin !== 'import') continue;
    if (issue.code === 'column_ignored') add(issue.tab, issue.column);
    if (issue.code === 'mapping_suggestion') add(issue.tab, issue.suggestion?.source_column);
  }
  for (const m of mapping) add(m.tab, m.source_column);
  return Object.fromEntries([...found].map(([tab, set]) => [tab, [...set].sort()]));
}

type CurriculumParams = { Params: { curriculumId: string } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function int(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export function dataTabRoutes(app: FastifyInstance, deps: PolicyDeps): void {
  const read = (param = 'curriculumId') => ({
    policy: {
      roles: ['admin', 'author', 'teacher'] as const,
      scope: { kind: 'curriculum' as const, param, edit: false },
    },
  });
  const edit = {
    policy: {
      roles: ['admin', 'author'] as const,
      scope: { kind: 'curriculum' as const, param: 'curriculumId', edit: true },
    },
  };

  app.get<CurriculumParams>(
    '/api/curricula/:curriculumId/versions',
    { config: read() },
    async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const rows = await req.withOrg((trx) =>
        trx
          .selectFrom('curriculum_version')
          .select(['id', 'number', 'status', 'created_at', 'source'])
          .where('curriculum_id', '=', req.params.curriculumId)
          .orderBy('number', 'desc')
          .execute(),
      );
      const body: VersionListResponse = {
        versions: rows.map((r) => ({
          id: r.id,
          number: r.number,
          status: r.status,
          created_at: r.created_at.toISOString(),
          file_name: r.source.file_name,
        })),
      };
      return body;
    },
  );

  app.get<{
    Params: { curriculumId: string; versionId: string; tab: string };
    Querystring: { offset?: string; limit?: string; code?: string };
  }>(
    '/api/curricula/:curriculumId/versions/:versionId/data/:tab',
    { config: read() },
    async (req, reply) => {
      const { curriculumId, versionId, tab } = req.params;
      if (!(DATA_TABS as readonly string[]).includes(tab) || !uuid.test(versionId)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      const offset = int(req.query.offset, 0, 0, 1_000_000);
      const limit = int(req.query.limit, DATA_PAGE_DEFAULT, 1, DATA_PAGE_MAX);
      const code = req.query.code;
      if (offset === null || limit === null || (code !== undefined && code.length > 100)) {
        return reply.code(400).send({ error: 'Invalid page' });
      }
      const row = await req.withOrg((trx) =>
        trx
          .selectFrom('curriculum_version')
          .select(['id', 'number', 'status', 'pack'])
          .where('curriculum_id', '=', curriculumId)
          .where('id', '=', versionId)
          .executeTakeFirst(),
      );
      if (!row) return reply.code(404).send({ error: 'Not found' });
      reply.header('cache-control', 'no-store');
      return dataTabPage(
        row.pack,
        tab as DataTabId,
        { id: row.id, number: row.number, status: row.status },
        { offset, limit, code },
      );
    },
  );

  const mappingBody = async (
    req: FastifyRequest,
    curriculumId: string,
  ): Promise<ColumnMappingResponse> => {
    const { role, userId } = req.session!;
    const { defaults, newest, curriculum } = await req.withOrg(async (trx) => ({
      defaults: await trx
        .selectFrom('curriculum_defaults')
        .select('column_mapping')
        .where('curriculum_id', '=', curriculumId)
        .executeTakeFirst(),
      newest: await trx
        .selectFrom('curriculum_version')
        .select('issues')
        .where('curriculum_id', '=', curriculumId)
        .orderBy('number', 'desc')
        .limit(1)
        .executeTakeFirst(),
      curriculum: await trx
        .selectFrom('curriculum')
        .select('created_by')
        .where('id', '=', curriculumId)
        .executeTakeFirst(),
    }));
    const mapping = defaults?.column_mapping ?? [];
    return {
      mapping,
      headers: sourceHeaders(newest?.issues ?? [], mapping),
      can_edit: role === 'admin' || curriculum?.created_by === userId,
    };
  };

  app.get<CurriculumParams>(
    '/api/curricula/:curriculumId/column-mapping',
    { config: read() },
    async (req, reply) => {
      reply.header('cache-control', 'no-store');
      return mappingBody(req, req.params.curriculumId);
    },
  );

  app.put<CurriculumParams>(
    '/api/curricula/:curriculumId/column-mapping',
    { config: edit },
    async (req, reply) => {
      const parsed = ColumnMappingRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid column mapping' });
      const { mapping } = parsed.data;
      // Each line names a real column of a tab that reads columns, once.
      const seen = new Set<string>();
      for (const entry of mapping) {
        const key = `${entry.tab}\u0000${entry.column}`;
        const known =
          TAB_NAMES.includes(entry.tab) &&
          tabSpec(entry.tab).cols.some((c) => c.name === entry.column);
        if (!known || seen.has(key)) {
          return reply.code(400).send({ error: 'Invalid column mapping' });
        }
        seen.add(key);
      }
      const { orgId, userId } = req.session!;
      const curriculumId = req.params.curriculumId;
      await req.withOrg(async (trx) => {
        await trx
          .insertInto('curriculum_defaults')
          .values({
            curriculum_id: curriculumId,
            org_id: orgId,
            column_mapping: json(mapping),
            updated_by: userId,
          })
          .onConflict((oc) =>
            oc
              .column('curriculum_id')
              .doUpdateSet({ column_mapping: json(mapping), updated_by: userId }),
          )
          .execute();
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'curriculum_defaults.column_mapping',
          targetType: 'curriculum',
          targetId: curriculumId,
          at: deps.now(),
        });
      });
      return mappingBody(req, curriculumId);
    },
  );
}

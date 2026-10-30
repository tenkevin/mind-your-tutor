import { randomUUID } from 'node:crypto';
import type {
  Pack,
  StudentIdeaResponse,
  StudentMap,
  StudentMapResponse,
  VersionDerived,
} from '@ideamap/contracts';
import { mapStates } from '@ideamap/domain';
import type { FastifyInstance } from 'fastify';
import { ALL_ROLES } from '../policy.js';
import type { Trx } from '../db.js';

// The student map (S10): the class's pinned published version (D2), drawn from its
// stored layout, with each idea's lock state worked out here (§8.4). A teacher or admin
// can ask for a preview, where every idea opens and nothing is recorded; a student
// asking for one gets their normal map. No tracker events yet (S2 adds them).

type ClassParams = { Params: { classId: string }; Querystring: { preview?: string } };
type IdeaParams = {
  Params: { classId: string; ideaId: string };
  Querystring: { preview?: string };
};

interface Pinned {
  className: string;
  curriculumId: string;
  versionNumber: number;
  pack: Pack;
  derived: VersionDerived;
}

async function loadPinned(
  trx: Trx,
  classId: string,
): Promise<{ className: string; pinned: Pinned | null }> {
  const klass = await trx
    .selectFrom('class')
    .select(['name', 'curriculum_id', 'pinned_version_id'])
    .where('id', '=', classId)
    .executeTakeFirstOrThrow();
  if (!klass.pinned_version_id) return { className: klass.name, pinned: null };
  const v = await trx
    .selectFrom('curriculum_version')
    .select(['number', 'pack', 'derived'])
    .where('id', '=', klass.pinned_version_id)
    .where('status', '=', 'published')
    .executeTakeFirst();
  if (!v?.derived) return { className: klass.name, pinned: null };
  return {
    className: klass.name,
    pinned: {
      className: klass.name,
      curriculumId: klass.curriculum_id,
      versionNumber: v.number,
      pack: v.pack,
      derived: v.derived,
    },
  };
}

export function buildMap(p: Pinned, preview: boolean): StudentMap {
  const { pack, derived } = p;
  const byId = new Map(pack.ideas.map((i) => [i.idea_id, i]));
  const titles = (id: string) => byId.get(id)?.title ?? id;
  const locks = new Map(mapStates(pack.ideas).map((l) => [l.idea_id, l]));
  // Reading order: the centre, then each ring by angle.
  const positions = derived.layout.positions
    .filter((pos) => byId.has(pos.idea_id))
    .sort((a, b) => a.ring - b.ring || (a.angle ?? 0) - (b.angle ?? 0));
  const shown = new Set(positions.map((pos) => pos.idea_id));
  // A far idea is hidden (D47): it goes out under a random id that is good for this
  // response only, so nothing in the page source names it.
  const hidden = (id: string) => !preview && locks.get(id)?.state === 'far';
  const opaque = new Map<string, string>();
  const wire = (id: string) => {
    if (!hidden(id)) return id;
    if (!opaque.has(id)) opaque.set(id, `hidden-${randomUUID()}`);
    return opaque.get(id)!;
  };
  return {
    versionNumber: p.versionNumber,
    subject: pack.course.subject,
    topic: pack.course.topic,
    centre: derived.layout.centre && wire(derived.layout.centre),
    ideas: positions.map((pos) => {
      const idea = byId.get(pos.idea_id)!;
      const lock = locks.get(idea.idea_id)!;
      const open = preview || lock.state === 'open';
      if (hidden(idea.idea_id))
        return {
          id: wire(idea.idea_id),
          title: null,
          category: null,
          unit: null,
          ring: pos.ring,
          x: pos.x,
          y: pos.y,
          state: 'far' as const,
          unlocksAfter: [],
        };
      return {
        id: idea.idea_id,
        title: idea.title,
        category: idea.category,
        unit: idea.unit,
        ring: pos.ring,
        x: pos.x,
        y: pos.y,
        state: open ? ('open' as const) : lock.state,
        unlocksAfter: open ? [] : lock.unlocks_after.map((id) => ({ id, title: titles(id) })),
      };
    }),
    links: derived.ranked_links.kept
      .filter((l) => shown.has(l.from_id) && shown.has(l.to_id))
      .map((l) => ({
        from: wire(l.from_id),
        to: wire(l.to_id),
        relation: l.relation,
        importance: l.importance,
      })),
    // A unit is named only if the student can see at least one of its ideas: a unit
    // made only of far ideas would otherwise give away what is hidden (D47).
    units: pack.units
      .filter((u) =>
        pack.ideas.some((i) => i.unit === u.unit && shown.has(i.idea_id) && !hidden(i.idea_id)),
      )
      .map((u) => ({ unit: u.unit, name: u.name })),
    categories: pack.categories.map((c) => ({ category: c.category, icon: c.icon })),
  };
}

export function studentMapRoutes(app: FastifyInstance): void {
  const config = {
    policy: {
      roles: ALL_ROLES,
      scope: { kind: 'class' as const, param: 'classId', students: true },
    },
  };
  // Preview is for staff only; for a student the parameter is ignored.
  const wantsPreview = (role: string, q: { preview?: string }) =>
    role !== 'student' && q.preview === '1';

  app.get<ClassParams>('/api/classes/:classId/map', { config }, async (req) => {
    const preview = wantsPreview(req.session!.role, req.query);
    const { className, pinned } = await req.withOrg((trx) => loadPinned(trx, req.params.classId));
    const body: StudentMapResponse = {
      classId: req.params.classId,
      className,
      preview,
      map: pinned ? buildMap(pinned, preview) : null,
    };
    return body;
  });

  app.get<IdeaParams>('/api/classes/:classId/ideas/:ideaId', { config }, async (req, reply) => {
    const preview = wantsPreview(req.session!.role, req.query);
    const found = await req.withOrg(async (trx) => {
      const { pinned } = await loadPinned(trx, req.params.classId);
      if (!pinned) return null;
      const idea = pinned.pack.ideas.find((i) => i.idea_id === req.params.ideaId);
      if (!idea) return null;
      const approved = idea.explanation
        ? null
        : await trx
            .selectFrom('approved_explanation')
            .select('text')
            .where('curriculum_id', '=', pinned.curriculumId)
            .where('idea_id', '=', idea.idea_id)
            .executeTakeFirst();
      return { pinned, idea, approved: approved?.text ?? null };
    });
    if (!found) return reply.code(404).send({ error: 'Not found' });
    const { pinned, idea, approved } = found;
    const lock = mapStates(pinned.pack.ideas).find((l) => l.idea_id === idea.idea_id)!;
    // A locked idea can't be opened by URL either (§8.4).
    if (!preview && lock.state !== 'open') {
      // A far idea stays hidden (D47): it answers exactly as an unknown id does, so a
      // student can't probe which ideas exist.
      if (lock.state === 'far') return reply.code(404).send({ error: 'Not found' });
      // Says what unlocks it, as the map card does, and nothing else about the idea.
      const titlesOf = new Map(pinned.pack.ideas.map((i) => [i.idea_id, i.title]));
      return reply.code(403).send({
        error: 'Locked',
        title: idea.title,
        unlocksAfter: lock.unlocks_after.map((id) => ({ id, title: titlesOf.get(id) ?? id })),
      });
    }
    const titles = new Map(pinned.pack.ideas.map((i) => [i.idea_id, i.title]));
    const kept = pinned.derived.ranked_links.kept;
    // A far idea is hidden here too (D47): the link keeps its relation but not who it is.
    const states = new Map(mapStates(pinned.pack.ideas).map((l) => [l.idea_id, l.state]));
    const link = (id: string, relation: string) =>
      !preview && states.get(id) === 'far'
        ? { id: null, title: null, relation }
        : { id, title: titles.get(id) ?? id, relation };
    // key_terms arrive with the pack columns of C14/C16 (D43); none until then.
    const keyTerms = (idea as { key_terms?: string[] }).key_terms ?? [];
    const body: StudentIdeaResponse = {
      id: idea.idea_id,
      title: idea.title,
      category: idea.category,
      unit: idea.unit,
      unitName: pinned.pack.units.find((u) => u.unit === idea.unit)?.name ?? null,
      objective: idea.objective,
      explanation: idea.explanation ?? approved,
      keyTerms,
      linksIn: kept.filter((l) => l.to_id === idea.idea_id).map((l) => link(l.from_id, l.relation)),
      linksOut: kept
        .filter((l) => l.from_id === idea.idea_id)
        .map((l) => link(l.to_id, l.relation)),
    };
    return body;
  });
}

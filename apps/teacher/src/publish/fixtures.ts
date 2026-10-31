import type {
  CurriculumDiff,
  DiffResponse,
  PublishPreview,
  PublishResult,
  PublishingOptions,
} from '@ideamap/contracts';
import { data } from '../curriculum/fixtures';

// Response bodies shaped like C5's for the water-cycle sample (T8 tests): version 1
// published, draft version 2, two classes.

export const V1 = '11111111-1111-4111-8111-111111111111';
export const V2 = '22222222-2222-4222-8222-222222222222';
export const V3 = '33333333-3333-4333-8333-333333333333';
export const CLASS1 = 'c1111111-1111-4111-8111-111111111111';
export const CLASS2 = 'c2222222-2222-4222-8222-222222222222';

const unit = (n: number, name: string) => ({ unit: n, name });

export const DIFF: CurriculumDiff = {
  first_publish: false,
  empty: false,
  ideas_added: [{ idea_id: 'snow', title: 'Snow', unit: unit(2, 'Water falls') }],
  ideas_removed: [{ idea_id: 'fog', title: 'Fog', unit: unit(1, 'Water goes up') }],
  ideas_renamed: [{ idea_id: 'rain', before: 'Rain', after: 'Rainfall' }],
  prerequisites_changed: [
    {
      idea_id: 'runoff',
      title: 'Runoff',
      before: ['rain'],
      after: ['rain', 'ground'],
      added: [{ idea_id: 'ground', title: 'Ground' }],
      removed: [],
    },
  ],
  units_changed: [
    {
      idea_id: 'cloud',
      title: 'Cloud',
      from: unit(1, 'Water goes up'),
      to: unit(2, 'Water falls'),
    },
  ],
  assessment_changed: [
    {
      idea_id: 'rain',
      title: 'Rainfall',
      unit: unit(2, 'Water falls'),
      before: ['Why does it rain?'],
      after: ['What makes rain fall?'],
      removed: ['Why does it rain?'],
      added: ['What makes rain fall?'],
    },
  ],
};

export function draftData(canPublish = true) {
  const base = data();
  return {
    ...base,
    job: base.job && { ...base.job, status: 'succeeded' as const },
    version: {
      ...base.version!,
      id: V2,
      number: 2,
      can_publish: canPublish,
      groups: canPublish
        ? base.version!.groups.filter((g) => g.level !== 'error')
        : base.version!.groups,
    },
  };
}

export const DIFF_RESPONSE: DiffResponse = {
  from_version: { id: V1, number: 1 },
  to_version: { id: V2, number: 2 },
  diff: DIFF,
};

export const OPTIONS: PublishingOptions = {
  classes: [
    { id: CLASS1, name: 'Period 1', pinned_version: { id: V1, number: 1 } },
    { id: CLASS2, name: 'Period 2', pinned_version: { id: V1, number: 1 } },
  ],
  published_versions: [{ id: V1, number: 1, published_at: '2026-10-20T10:00:00.000Z' }],
};

export function previewFor(ids: string[], count: number, canPublish = true): PublishPreview {
  return {
    version: { id: V2, number: 2, status: 'draft', published_at: null },
    from_version: { id: V1, number: 1 },
    diff: DIFF,
    can_publish: canPublish,
    blocking: [],
    students_receiving_this_update: {
      label: 'Students receiving this update',
      count,
      class_ids: ids,
    },
  };
}

export function publishResult(ids: string[], count: number): PublishResult {
  return {
    version: { id: V2, number: 2, status: 'published', published_at: '2026-10-28T10:00:00.000Z' },
    classes: ids.map((id) => ({ class_id: id, from_version_id: V1, to_version_id: V2 })),
    students_receiving_this_update: {
      label: 'Students receiving this update',
      count,
      class_ids: ids,
    },
  };
}

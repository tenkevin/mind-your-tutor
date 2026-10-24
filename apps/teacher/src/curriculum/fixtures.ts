import type {
  CurriculumDataResponse,
  ImportJobView,
  ImportStep,
  IssueGroup,
} from '@ideamap/contracts';

// Response bodies shaped like the API's for the water-cycle sample (T2 tests).

export const CURRICULUM = '5f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f05';
const JOB = '6f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f06';
const VERSION = '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f07';
const CHECKSUM = 'a'.repeat(64);

const NAMES = [
  'Read sheet',
  'Check data',
  'Rank links',
  'Lay out map',
  'Make quizzes',
  'Index library',
] as const;
const RESULTS = [
  '18 ideas, 31 links',
  '3 notes',
  'Top 3 in and out per idea',
  'Most connected in the centre',
  '8 per idea from links',
  '5 documents for RAG',
];

/** The six steps, the first `done` of them done and the next one running. */
export function steps(done: number, failedAt: number | null = null): ImportStep[] {
  return NAMES.map((name, i) => ({
    name,
    status:
      failedAt === i
        ? 'failed'
        : i < done
          ? 'done'
          : i === done && failedAt === null
            ? 'running'
            : 'pending',
    result: failedAt === i ? '2 problems' : i < done ? RESULTS[i]! : null,
    started_at: i <= done ? '2026-10-24T10:00:00.000Z' : null,
    finished_at: i < done ? '2026-10-24T10:00:01.000Z' : null,
  }));
}

export function job(overrides: Partial<ImportJobView> = {}): ImportJobView {
  return {
    id: JOB,
    curriculum_id: CURRICULUM,
    status: 'succeeded',
    steps: steps(6),
    source: { kind: 'xlsx', file_name: 'water-cycle.xlsx', checksum: CHECKSUM },
    error: null,
    version: { id: VERSION, number: 1, status: 'draft', can_publish: false },
    created_at: '2026-10-24T10:00:00.000Z',
    started_at: '2026-10-24T10:00:00.000Z',
    finished_at: '2026-10-24T10:00:02.000Z',
    ...overrides,
  };
}

export const SAMPLE_GROUPS: IssueGroup[] = [
  {
    level: 'error',
    origin: 'data_check',
    cause: 'prereq',
    label: 'Unknown prerequisite',
    fix: { tab: 'Ideas', column: 'requires' },
    blocks_publish: true,
    draftable: false,
    issues: [
      {
        message:
          'Groundwater requires "aquifer", which isn\'t an idea_id in Ideas. Fix it in Ideas → requires.',
        items: ['ground'],
        item_rows: [{ tab: 'Ideas', row: 19 }],
        at: null,
      },
    ],
  },
  {
    level: 'warning',
    origin: 'data_check',
    cause: 'codes',
    label: 'Missing standard codes',
    fix: { tab: 'Ideas', column: 'standard_codes' },
    blocks_publish: false,
    draftable: false,
    issues: [
      {
        message:
          '1 idea has no standard_codes, so it is missing from alignment reports: Rain. Add codes in Ideas → standard_codes.',
        items: ['rain'],
        item_rows: [{ tab: 'Ideas', row: 14 }],
        at: null,
      },
    ],
  },
  {
    level: 'info',
    origin: 'data_check',
    cause: 'media',
    label: 'Missing media',
    fix: { tab: 'Ideas', column: 'media_url' },
    blocks_publish: false,
    draftable: false,
    issues: [
      {
        message: '11 ideas have no media_url, so they show a placeholder card.',
        items: [
          'cond',
          'cloud',
          'prec',
          'rain',
          'snow',
          'hail',
          'coll',
          'ground',
          'ocean',
          'lake',
          'river',
        ],
        item_rows: [],
        at: null,
      },
    ],
  },
];

export function data(overrides: Partial<CurriculumDataResponse> = {}): CurriculumDataResponse {
  return {
    job: job(),
    unchanged: false,
    version: {
      id: VERSION,
      number: 1,
      status: 'draft',
      can_publish: false,
      created_at: '2026-10-24T10:00:02.000Z',
      source: { kind: 'xlsx', file_name: 'water-cycle.xlsx', checksum: CHECKSUM },
      tabs: [
        { tab: 'Course', rows: 6 },
        { tab: 'Units', rows: 3 },
        { tab: 'Ideas', rows: 18 },
        { tab: 'Links', rows: 31 },
        { tab: 'Categories', rows: 3 },
        { tab: 'Assessment', rows: 18 },
        { tab: 'Personas', rows: 3 },
        { tab: 'Library', rows: 5 },
      ],
      groups: SAMPLE_GROUPS,
    },
    ...overrides,
  };
}

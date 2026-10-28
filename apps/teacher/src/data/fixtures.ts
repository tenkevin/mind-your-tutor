import type { ColumnMappingResponse, DataTabPage, VersionListResponse } from '@ideamap/contracts';

export const CURRICULUM = '11111111-1111-4111-8111-111111111111';
export const V2 = '22222222-2222-4222-8222-222222222222';
export const V1 = '33333333-3333-4333-8333-333333333333';

export const versions = (): VersionListResponse['versions'] => [
  {
    id: V2,
    number: 2,
    status: 'draft',
    created_at: '2026-10-28T10:00:00.000Z',
    file_name: 'v2.xlsx',
  },
  {
    id: V1,
    number: 1,
    status: 'published',
    created_at: '2026-10-20T10:00:00.000Z',
    file_name: 'v1.xlsx',
  },
];

export const mapping = (over: Partial<ColumnMappingResponse> = {}): ColumnMappingResponse => ({
  mapping: [],
  headers: { Ideas: ['Prereqs'] },
  can_edit: true,
  ...over,
});

const ver = (id: string, number: number, status: 'draft' | 'published') => ({ id, number, status });

export const prerequisites = (id = V2, number = 2): DataTabPage => ({
  tab: 'prerequisites',
  version: ver(id, number, id === V2 ? 'draft' : 'published'),
  total: 2,
  offset: 0,
  limit: 100,
  rows: [
    {
      idea_id: 'ground',
      title: 'Groundwater',
      requires: [{ idea_id: 'aquifer', title: null }],
      status: 'unknown',
    },
    { idea_id: 'sun', title: 'The Sun', requires: [], status: 'none' },
  ],
});

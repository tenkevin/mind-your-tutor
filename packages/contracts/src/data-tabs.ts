import { z } from 'zod';
import { VERSION_STATUSES } from './curriculum-version.js';
import { ColumnMappingSchema } from './import.js';
import { TAB_NAMES } from './spec.js';

// Teacher Settings → From the spreadsheet (ARCHITECTURE.md §11, task T6): the read-only
// views of one version's data (D4: data changes go through export, edit and re-import)
// and the curriculum's column mapping (§6: it belongs to the source; a class can't
// override it, and a change applies on the next import). The tab names and icons follow
// project/Teacher Settings.dc.html.

/** The five data views, in the design's order. */
export const DATA_TABS = [
  'prerequisites',
  'categories',
  'standards',
  'media',
  'assessment',
] as const;
export type DataTabId = (typeof DATA_TABS)[number];

/** Rows a page of a data view holds at most. */
export const DATA_PAGE_MAX = 200;
export const DATA_PAGE_DEFAULT = 100;

/** `GET /api/curricula/:curriculumId/versions`: newest first, for the version picker. */
export const VersionListResponseSchema = z.object({
  versions: z.array(
    z.object({
      id: z.uuid(),
      number: z.number().int().min(1),
      status: z.enum(VERSION_STATUSES),
      created_at: z.iso.datetime({ offset: true }),
      file_name: z.string().nullable(),
    }),
  ),
});
export type VersionListResponse = z.infer<typeof VersionListResponseSchema>;

const IdeaRef = z.object({
  idea_id: z.string(),
  title: z.string(),
});

export const DataPrerequisiteRowSchema = IdeaRef.extend({
  /** Each required idea; `title` is null when the id names no idea (data check "prereq"). */
  requires: z.array(z.object({ idea_id: z.string(), title: z.string().nullable() })),
  status: z.enum(['ok', 'unknown', 'none']),
});
export const DataCategoryRowSchema = z.object({
  category: z.string(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  ideas: z.number().int().min(0),
});
export const DataStandardsRowSchema = IdeaRef.extend({
  unit: z.number().int(),
  codes: z.array(z.string()),
});
export const DataMediaRowSchema = z.object({
  /** Where the reference is in the sheet. */
  tab: z.enum(['Ideas', 'Links']),
  label: z.string(),
  /** Shown as text, never loaded (T6-S2). */
  media_url: z.string().nullable(),
  /** What students get: from the file's extension; a placeholder without media. */
  shows: z.enum(['Image', 'Video', 'Link', 'Placeholder']),
  /** False for a reference the app won't use (not https and not a file name). */
  usable: z.boolean(),
});
export const DataAssessmentRowSchema = z.object({
  unit: z.number().int(),
  name: z.string(),
  questions: z.number().int().min(0),
  ideas: z.number().int().min(0),
});

const base = {
  version: z.object({
    id: z.uuid(),
    number: z.number().int().min(1),
    status: z.enum(VERSION_STATUSES),
  }),
  /** All rows of the view (after any filter), for paging. */
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
};

/** `GET /api/curricula/:curriculumId/versions/:versionId/data/:tab`. */
export const DataTabPageSchema = z.discriminatedUnion('tab', [
  z.object({ tab: z.literal('prerequisites'), ...base, rows: z.array(DataPrerequisiteRowSchema) }),
  z.object({ tab: z.literal('categories'), ...base, rows: z.array(DataCategoryRowSchema) }),
  z.object({
    tab: z.literal('standards'),
    ...base,
    /** Every code in the version and how many ideas carry it (all pages). */
    codes: z.array(z.object({ code: z.string(), count: z.number().int().min(1) })),
    rows: z.array(DataStandardsRowSchema),
  }),
  z.object({ tab: z.literal('media'), ...base, rows: z.array(DataMediaRowSchema) }),
  z.object({ tab: z.literal('assessment'), ...base, rows: z.array(DataAssessmentRowSchema) }),
]);
export type DataTabPage = z.infer<typeof DataTabPageSchema>;

/** `GET` and `PUT /api/curricula/:curriculumId/column-mapping`. */
export const ColumnMappingResponseSchema = z.object({
  /** Only the columns that aren't matched by name; the rest are automatic. */
  mapping: ColumnMappingSchema,
  /** Source headers seen in the newest import, by tab, for the pickers. */
  headers: z.partialRecord(z.enum(TAB_NAMES), z.array(z.string())),
  /** The curriculum's author or an admin (D3). Others see the mapping read-only. */
  can_edit: z.boolean(),
});
export type ColumnMappingResponse = z.infer<typeof ColumnMappingResponseSchema>;

export const ColumnMappingRequestSchema = z.object({ mapping: ColumnMappingSchema });
export type ColumnMappingRequest = z.infer<typeof ColumnMappingRequestSchema>;

import type {
  ClassConfig,
  ExplanationSource,
  ImportStep,
  Pack,
  PersonaId,
  VersionDerived,
  VersionIssue,
  VersionSource,
  VersionStatus,
} from '@ideamap/contracts';
import type { ColumnType, Generated } from 'kysely';

// Row types for every table the migrations create, for Kysely's typed queries.
// jsonb columns carry the `@ideamap/contracts` type they hold; `columns.test.ts`
// checks this file against the live schema so the two can't drift apart.

/** JSON text for a jsonb column, made by `json()` so its shape is type-checked. */
export type JsonText<T> = string & { readonly __json: T };

/** A jsonb column: read as T, written as `json(value)`. */
export type Json<T> = ColumnType<T, JsonText<T>, JsonText<T>>;
export type NullableJson<T> = ColumnType<T | null, JsonText<T> | null, JsonText<T> | null>;

/** timestamptz: read as Date, written as Date or an ISO string. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;
/** A timestamptz with a database default. */
export type CreatedAt = ColumnType<Date, Date | string | undefined, Date | string>;

/** pgvector text form, `[0.1,0.2,…]`; see `toVector` and `fromVector`. */
export type VectorText = string;

export type UserRole = 'admin' | 'author' | 'teacher' | 'student';
/** A configured SSO provider's id: `google`, `clever`, `classlink` or another slug (F5). */
export type SsoProvider = string;
export type UseFor = 'agent' | 'tutor' | 'both';
/** A class's setting for a shared document (D11): a UseFor, or `off` to hide it. */
export type ClassUseFor = UseFor | 'off';
export type IndexStatus = 'pending' | 'indexing' | 'indexed' | 'failed';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type ExportKind =
  | 'template'
  | 'data_checks'
  | 'standards_alignment'
  | 'drafted_rows'
  | 'class_progress'
  | 'student_record';
export type TextKind = 'chat' | 'teachback' | 'transcript';
/** A column-mapping entry, as in VersionSource. */
export type ColumnMapping = VersionSource['column_mapping'];

export interface OrganizationTable {
  id: Generated<string>;
  name: string;
  /** Days typed student text is kept (§10; default 90). */
  text_retention_days: Generated<number>;
  created_at: CreatedAt;
  updated_at: CreatedAt;
  /** Days AI transcripts are kept (§10; default 90, from 0015). */
  ai_retention_days: Generated<number>;
  /** Days export files are kept (default 7, from 0015). */
  export_retention_days: Generated<number>;
  /** Days sign-in sessions are kept after expiry or revocation (default 30, from 0015). */
  session_retention_days: Generated<number>;
}

export interface AppUserTable {
  id: Generated<string>;
  org_id: string;
  role: UserRole;
  name: string;
  email: string | null;
  sso_provider: SsoProvider | null;
  sso_subject: string | null;
  roster_source_id: string | null;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

export interface CurriculumTable {
  id: Generated<string>;
  org_id: string;
  title: string;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

/** Mirrors CurriculumVersionSchema, plus org_id and created_by. */
export interface CurriculumVersionTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  number: number;
  status: ColumnType<VersionStatus, VersionStatus | undefined, VersionStatus>;
  pack: Json<Pack>;
  derived: NullableJson<VersionDerived>;
  issues: ColumnType<
    VersionIssue[],
    JsonText<VersionIssue[]> | undefined,
    JsonText<VersionIssue[]>
  >;
  source: Json<VersionSource>;
  created_by: string | null;
  created_at: CreatedAt;
  published_at: NullableTimestamp;
}

export interface CurriculumDefaultsTable {
  curriculum_id: string;
  org_id: string;
  config: ColumnType<ClassConfig, JsonText<ClassConfig> | undefined, JsonText<ClassConfig>>;
  column_mapping: ColumnType<
    ColumnMapping,
    JsonText<ColumnMapping> | undefined,
    JsonText<ColumnMapping>
  >;
  updated_by: string | null;
  updated_at: CreatedAt;
}

/** Mirrors ExplanationOverrideSchema (approvedBy and approvedAt in snake case). */
export interface ApprovedExplanationTable {
  curriculum_id: string;
  idea_id: string;
  org_id: string;
  text: string;
  source: ExplanationSource;
  approved_by: string;
  approved_at: CreatedAt;
}

/** Drafts to approve (A6): AI-drafted curriculum text waiting for a teacher (D9, D12). */
export interface ContentDraftTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  kind: 'idea_explanation' | 'unit_objective' | 'assessment_question';
  row_key: string;
  status: Generated<'pending' | 'approved' | 'rejected'>;
  draft_text: string;
  approved_text: string | null;
  model: string;
  source_version_id: string | null;
  decided_by: string | null;
  decided_at: NullableTimestamp;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

export interface LibraryDocTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  title: string;
  file_url: string;
  use_for: ColumnType<UseFor, UseFor | undefined, UseFor>;
  checksum: string | null;
  index_status: ColumnType<IndexStatus, IndexStatus | undefined, IndexStatus>;
  indexed_at: NullableTimestamp;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

export interface ChunkTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  library_doc_id: string;
  ordinal: number;
  content: string;
  embedding: VectorText;
  created_at: CreatedAt;
}

/** D11: how one class uses one shared library document. */
export interface ClassLibrarySettingTable {
  class_id: string;
  library_doc_id: string;
  org_id: string;
  curriculum_id: string;
  use_for: ClassUseFor;
  updated_by: string | null;
  updated_at: CreatedAt;
}

/** D11: a document uploaded for one class only. */
export interface ClassLibraryDocTable {
  id: Generated<string>;
  org_id: string;
  class_id: string;
  title: string;
  file_url: string;
  use_for: ColumnType<UseFor, UseFor | undefined, UseFor>;
  checksum: string | null;
  index_status: ColumnType<IndexStatus, IndexStatus | undefined, IndexStatus>;
  indexed_at: NullableTimestamp;
  uploaded_by: string | null;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

export interface ClassChunkTable {
  id: Generated<string>;
  org_id: string;
  class_id: string;
  class_library_doc_id: string;
  ordinal: number;
  content: string;
  embedding: VectorText;
  created_at: CreatedAt;
}

export interface ClassTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  pinned_version_id: string | null;
  teacher_id: string;
  name: string;
  time_zone: Generated<string>;
  created_at: CreatedAt;
  updated_at: CreatedAt;
  /** OneRoster sourcedId, set by a roster import (0014). */
  roster_source_id: string | null;
}

export interface ClassConfigTable {
  class_id: string;
  org_id: string;
  config: ColumnType<ClassConfig, JsonText<ClassConfig> | undefined, JsonText<ClassConfig>>;
  updated_by: string | null;
  updated_at: CreatedAt;
}

export interface EnrollmentTable {
  class_id: string;
  student_id: string;
  org_id: string;
  created_at: CreatedAt;
}

/** The draft envelope of ARCHITECTURE.md §8.2; M1 may change it. */
export interface InteractionEventTable {
  id: string;
  org_id: string;
  student_id: string;
  class_id: string;
  version_id: string;
  seq: number;
  at: Timestamp;
  type: string;
  payload: ColumnType<unknown, JsonText<unknown> | undefined, never>;
  recorded_at: CreatedAt;
}

export interface InteractionEventKeyTable {
  id: string;
  org_id: string;
  student_id: string;
  seq: number;
  recorded_at: Timestamp;
}

export interface InteractionTextTable {
  id: Generated<string>;
  org_id: string;
  class_id: string;
  student_id: string;
  kind: TextKind;
  body: string;
  redacted_at: NullableTimestamp;
  created_at: CreatedAt;
}

export interface GeneratedMapViewTable {
  id: Generated<string>;
  org_id: string;
  class_id: string;
  student_id: string;
  version_id: string;
  generator: string;
  view: Json<Record<string, unknown>>;
  created_at: CreatedAt;
}

export interface AiOutputTable {
  id: Generated<string>;
  org_id: string;
  class_id: string;
  student_id: string | null;
  version_id: string | null;
  persona: PersonaId | null;
  kind: string;
  content: Json<unknown>;
  model: string | null;
  created_at: CreatedAt;
}

export interface ProgressSnapshotTable {
  class_id: string;
  student_id: string;
  rules_version: string;
  org_id: string;
  state: Json<unknown>;
  last_seq: number;
  updated_at: CreatedAt;
}

export interface ImportJobTable {
  id: Generated<string>;
  org_id: string;
  curriculum_id: string;
  status: ColumnType<JobStatus, JobStatus | undefined, JobStatus>;
  source: Json<VersionSource>;
  version_id: string | null;
  error: NullableJson<unknown>;
  created_by: string | null;
  created_at: CreatedAt;
  started_at: NullableTimestamp;
  finished_at: NullableTimestamp;
  updated_at: CreatedAt;
  steps: ColumnType<ImportStep[], JsonText<ImportStep[]> | undefined, JsonText<ImportStep[]>>;
  idempotency_key: string | null;
}

export interface ExportJobTable {
  id: Generated<string>;
  org_id: string;
  kind: ExportKind;
  curriculum_id: string | null;
  class_id: string | null;
  status: ColumnType<JobStatus, JobStatus | undefined, JobStatus>;
  params: ColumnType<
    Record<string, unknown>,
    JsonText<Record<string, unknown>> | undefined,
    JsonText<Record<string, unknown>>
  >;
  result_ref: string | null;
  error: NullableJson<unknown>;
  created_by: string | null;
  created_at: CreatedAt;
  finished_at: NullableTimestamp;
  updated_at: CreatedAt;
}

/** Which students an export file holds (0015). */
export interface ExportSubjectTable {
  export_job_id: string;
  student_id: string;
  org_id: string;
}

export interface AuditEventTable {
  id: Generated<string>;
  org_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: ColumnType<Record<string, unknown>, JsonText<Record<string, unknown>> | undefined, never>;
  at: CreatedAt;
  /** The class the change belongs to, for a class's history (0015). */
  class_id: string | null;
  curriculum_id: string | null;
  /** Only what changed, with secrets redacted. Null for a create (before) or a delete (after). */
  before: ColumnType<
    Record<string, unknown> | null,
    JsonText<Record<string, unknown>> | null | undefined,
    never
  >;
  after: ColumnType<
    Record<string, unknown> | null,
    JsonText<Record<string, unknown>> | null | undefined,
    never
  >;
}

export interface AiInteractionTable {
  id: Generated<string>;
  org_id: string;
  class_id: string | null;
  user_id: string | null;
  persona: PersonaId;
  model: string;
  request: Json<unknown>;
  response: NullableJson<unknown>;
  flagged: Generated<boolean>;
  input_tokens: number | null;
  output_tokens: number | null;
  redacted_at: NullableTimestamp;
  created_at: CreatedAt;
}

/** Maps a provider's tenant (domain, district) to an organization (0014, F5). */
export interface SsoTenantTable {
  provider: SsoProvider;
  tenant: string;
  org_id: string;
  created_at: CreatedAt;
}

/** A signed-in session (0014, F5). Only the SHA-256 of the cookie token is kept. */
export interface AuthSessionTable {
  id: Generated<string>;
  org_id: string;
  user_id: string;
  token_hash: Buffer;
  provider: SsoProvider;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
}

export interface Database {
  organization: OrganizationTable;
  app_user: AppUserTable;
  curriculum: CurriculumTable;
  curriculum_version: CurriculumVersionTable;
  curriculum_defaults: CurriculumDefaultsTable;
  approved_explanation: ApprovedExplanationTable;
  content_draft: ContentDraftTable;
  library_doc: LibraryDocTable;
  chunk: ChunkTable;
  class: ClassTable;
  class_config: ClassConfigTable;
  enrollment: EnrollmentTable;
  class_library_setting: ClassLibrarySettingTable;
  class_library_doc: ClassLibraryDocTable;
  class_chunk: ClassChunkTable;
  interaction_event: InteractionEventTable;
  interaction_event_key: InteractionEventKeyTable;
  interaction_text: InteractionTextTable;
  generated_map_view: GeneratedMapViewTable;
  ai_output: AiOutputTable;
  progress_snapshot: ProgressSnapshotTable;
  import_job: ImportJobTable;
  export_job: ExportJobTable;
  export_subject: ExportSubjectTable;
  audit_event: AuditEventTable;
  ai_interaction: AiInteractionTable;
  sso_tenant: SsoTenantTable;
  auth_session: AuthSessionTable;
}

export type TableName = keyof Database;

/**
 * The columns of every table, in order. Typed against `Database`, so a column added
 * here must be added there too; `columns.test.ts` compares this with the live schema.
 */
export const COLUMNS = {
  organization: [
    'id',
    'name',
    'text_retention_days',
    'created_at',
    'updated_at',
    'ai_retention_days',
    'export_retention_days',
    'session_retention_days',
  ],
  app_user: [
    'id',
    'org_id',
    'role',
    'name',
    'email',
    'sso_provider',
    'sso_subject',
    'roster_source_id',
    'created_at',
    'updated_at',
  ],
  curriculum: ['id', 'org_id', 'title', 'created_by', 'created_at', 'updated_at'],
  curriculum_version: [
    'id',
    'org_id',
    'curriculum_id',
    'number',
    'status',
    'pack',
    'derived',
    'issues',
    'source',
    'created_by',
    'created_at',
    'published_at',
  ],
  curriculum_defaults: [
    'curriculum_id',
    'org_id',
    'config',
    'column_mapping',
    'updated_by',
    'updated_at',
  ],
  approved_explanation: [
    'curriculum_id',
    'idea_id',
    'org_id',
    'text',
    'source',
    'approved_by',
    'approved_at',
  ],
  content_draft: [
    'id',
    'org_id',
    'curriculum_id',
    'kind',
    'row_key',
    'status',
    'draft_text',
    'approved_text',
    'model',
    'source_version_id',
    'decided_by',
    'decided_at',
    'created_at',
    'updated_at',
  ],
  library_doc: [
    'id',
    'org_id',
    'curriculum_id',
    'title',
    'file_url',
    'use_for',
    'checksum',
    'index_status',
    'indexed_at',
    'created_at',
    'updated_at',
  ],
  chunk: [
    'id',
    'org_id',
    'curriculum_id',
    'library_doc_id',
    'ordinal',
    'content',
    'embedding',
    'created_at',
  ],
  class: [
    'id',
    'org_id',
    'curriculum_id',
    'pinned_version_id',
    'teacher_id',
    'name',
    'time_zone',
    'created_at',
    'updated_at',
    'roster_source_id',
  ],
  class_config: ['class_id', 'org_id', 'config', 'updated_by', 'updated_at'],
  enrollment: ['class_id', 'student_id', 'org_id', 'created_at'],
  class_library_setting: [
    'class_id',
    'library_doc_id',
    'org_id',
    'curriculum_id',
    'use_for',
    'updated_by',
    'updated_at',
  ],
  class_library_doc: [
    'id',
    'org_id',
    'class_id',
    'title',
    'file_url',
    'use_for',
    'checksum',
    'index_status',
    'indexed_at',
    'uploaded_by',
    'created_at',
    'updated_at',
  ],
  class_chunk: [
    'id',
    'org_id',
    'class_id',
    'class_library_doc_id',
    'ordinal',
    'content',
    'embedding',
    'created_at',
  ],
  interaction_event: [
    'id',
    'org_id',
    'student_id',
    'class_id',
    'version_id',
    'seq',
    'at',
    'type',
    'payload',
    'recorded_at',
  ],
  interaction_event_key: ['id', 'org_id', 'student_id', 'seq', 'recorded_at'],
  interaction_text: [
    'id',
    'org_id',
    'class_id',
    'student_id',
    'kind',
    'body',
    'redacted_at',
    'created_at',
  ],
  generated_map_view: [
    'id',
    'org_id',
    'class_id',
    'student_id',
    'version_id',
    'generator',
    'view',
    'created_at',
  ],
  ai_output: [
    'id',
    'org_id',
    'class_id',
    'student_id',
    'version_id',
    'persona',
    'kind',
    'content',
    'model',
    'created_at',
  ],
  progress_snapshot: [
    'class_id',
    'student_id',
    'rules_version',
    'org_id',
    'state',
    'last_seq',
    'updated_at',
  ],
  import_job: [
    'id',
    'org_id',
    'curriculum_id',
    'status',
    'source',
    'version_id',
    'error',
    'created_by',
    'created_at',
    'started_at',
    'finished_at',
    'updated_at',
    'steps',
    'idempotency_key',
  ],
  export_job: [
    'id',
    'org_id',
    'kind',
    'curriculum_id',
    'class_id',
    'status',
    'params',
    'result_ref',
    'error',
    'created_by',
    'created_at',
    'finished_at',
    'updated_at',
  ],
  export_subject: ['export_job_id', 'student_id', 'org_id'],
  audit_event: [
    'id',
    'org_id',
    'actor_id',
    'action',
    'target_type',
    'target_id',
    'detail',
    'at',
    'class_id',
    'curriculum_id',
    'before',
    'after',
  ],
  ai_interaction: [
    'id',
    'org_id',
    'class_id',
    'user_id',
    'persona',
    'model',
    'request',
    'response',
    'flagged',
    'input_tokens',
    'output_tokens',
    'redacted_at',
    'created_at',
  ],
  sso_tenant: ['provider', 'tenant', 'org_id', 'created_at'],
  auth_session: [
    'id',
    'org_id',
    'user_id',
    'token_hash',
    'provider',
    'created_at',
    'last_seen_at',
    'expires_at',
    'revoked_at',
  ],
} as const satisfies { [T in TableName]: readonly (keyof Database[T] & string)[] };

/** Tables whose rows belong to one organization, with row-level security forced. */
export const TENANT_TABLES = Object.keys(COLUMNS) as TableName[];

/** Tables also scoped to one class (D11): visible only inside `withClass`. */
export const CLASS_SCOPED_TABLES = [
  'class_library_setting',
  'class_library_doc',
  'class_chunk',
] as const satisfies readonly TableName[];

/** Tables with one extra policy beyond tenant isolation: the owner's lookup (0014). */
export const OWNER_LOOKUP_TABLES = ['sso_tenant'] as const satisfies readonly TableName[];

// Fails to compile if a `Database` column is missing from COLUMNS.
type MissingColumns = {
  [T in TableName]: Exclude<keyof Database[T], (typeof COLUMNS)[T][number]>;
};
type AssertNone<T extends Record<TableName, never>> = T;
export type ColumnsCoverDatabase = AssertNone<MissingColumns>;

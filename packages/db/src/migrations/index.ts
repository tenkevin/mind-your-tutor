import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_extensions.js';
import * as m0002 from './0002_app_role.js';
import * as m0003 from './0003_job_queue.js';
import * as m0004 from './0004_tenancy.js';
import * as m0005 from './0005_curricula.js';
import * as m0006 from './0006_library.js';
import * as m0007 from './0007_classes.js';
import * as m0008 from './0008_tracker.js';
import * as m0009 from './0009_jobs_and_audit.js';
import * as m0010 from './0010_class_library.js';
import * as m0011 from './0011_isolation.js';
import * as m0012 from './0012_function_binding.js';
import * as m0013 from './0013_import_jobs.js';
import * as m0014 from './0014_auth.js';
import * as m0015 from './0015_privacy.js';
import * as m0016 from './0016_library_search.js';

// Every migration, in order. Listed by hand rather than read from disk, so the same
// list works from src (tests) and dist (the CLI). Add new ones at the end; never
// edit or reorder one that has run.
export const migrations: Record<string, Migration> = {
  '0001_extensions': m0001,
  '0002_app_role': m0002,
  '0003_job_queue': m0003,
  '0004_tenancy': m0004,
  '0005_curricula': m0005,
  '0006_library': m0006,
  '0007_classes': m0007,
  '0008_tracker': m0008,
  '0009_jobs_and_audit': m0009,
  '0010_class_library': m0010,
  '0011_isolation': m0011,
  '0012_function_binding': m0012,
  '0013_import_jobs': m0013,
  '0014_auth': m0014,
  '0015_privacy': m0015,
  '0016_library_search': m0016,
};

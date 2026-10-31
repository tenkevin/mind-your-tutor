import { sql, type Kysely, type RawBuilder } from 'kysely';
import { SECRET_KEY_PATTERN } from './0015_privacy.js';

// Field-level audit paths for config edits (T3; docs/qa/CXB.md, agent-f6 on PR #20).
//
// A config save used to write two audit rows: the API's summary (`class_config.update`)
// and 0015's trigger row (`class_config.updated`). T3 keeps one convention, the
// trigger row, and the API no longer writes its own. For that row to name the field a
// teacher changed, an update now compares nested jsonb objects all the way down: a
// topic override reads `config.course.topic`, not the whole `config.course`. A key
// present on one side only reads null on the other, so a reset to the curriculum
// value reads its old value before and null after. Arrays (units, ideas, personas)
// are still compared whole.
//
// Two limits on the walk keep 0015's guarantees (T3 QA run 1):
// - A key that looks like a secret is never opened. It stays one path, such as
//   `config.connector.token`, whose last segment `redact_secrets` matches, so its whole
//   value is redacted however deep it is or whatever it holds.
// - An object that changes with no key to descend into ({} to nothing, or back) is
//   recorded whole, so emptying one is still audited.
//
// Inserts and deletes are recorded whole, as before, except that inserting a row
// with nothing in it (every value apart from its ids null, {} or []) writes no row: the
// API creates an empty config row before its first save, and that save's update row
// is the one that says what changed.

const ROW_CHANGE_HEAD = sql`
  DECLARE
    target_type text := TG_ARGV[0];
    ignored text[] := string_to_array(TG_ARGV[5], ',');
    key_cols text[] := string_to_array(TG_ARGV[6], ',');
    verbs text[] := string_to_array(TG_ARGV[7], ',');
    full_row jsonb;
    old_row jsonb;
    new_row jsonb;
    before_v jsonb := '{}';
    after_v jsonb := '{}';
    changed text[] := '{}';
    k text;
    k2 text;
    o jsonb;
    n jsonb;
    verb text;
    paths text[] := '{}';
    olds jsonb[] := '{}';
    news jsonb[] := '{}';
    i integer := 1;
    descended integer;
  BEGIN
    IF TG_OP = 'DELETE' THEN full_row := to_jsonb(OLD); ELSE full_row := to_jsonb(NEW); END IF;
    IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD) - ignored; END IF;
    IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW) - ignored; END IF;

    IF TG_OP = 'UPDATE' THEN
      verb := verbs[2];
`;

const ROW_CHANGE_MIDDLE = sql`
      IF cardinality(changed) = 0 THEN RETURN NULL; END IF;
    ELSIF TG_OP = 'INSERT' THEN
      verb := verbs[1];
      after_v := new_row;
`;

const ROW_CHANGE_TAIL = sql`
    ELSE
      verb := verbs[3];
      before_v := old_row;
    END IF;

    INSERT INTO public.audit_event
      (org_id, actor_id, action, target_type, target_id, class_id, curriculum_id, before, after, detail)
    VALUES (
      coalesce(full_row ->> 'org_id', full_row ->> 'id')::uuid,
      coalesce(app.current_actor_id(), (full_row ->> TG_ARGV[4])::uuid),
      target_type || '.' || verb,
      target_type,
      (full_row ->> TG_ARGV[1])::uuid,
      (full_row ->> TG_ARGV[2])::uuid,
      (full_row ->> TG_ARGV[3])::uuid,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE app.redact_secrets(before_v) END,
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE app.redact_secrets(after_v) END,
      jsonb_build_object('changed', to_jsonb(changed))
        || CASE WHEN cardinality(key_cols) > 0
             THEN jsonb_build_object('key', (SELECT jsonb_object_agg(c, full_row -> c) FROM unnest(key_cols) AS c))
             ELSE '{}'::jsonb END);
    RETURN NULL;
  END
`;

/** 0021: walk every changed column down through nested objects to the changed leaves. */
const NESTED_DIFF = sql`
      FOR k IN SELECT jsonb_object_keys(new_row) ORDER BY 1 LOOP
        paths := paths || k;
        olds := olds || (old_row -> k);
        news := news || (new_row -> k);
      END LOOP;
      WHILE i <= cardinality(paths) LOOP
        o := olds[i];
        n := news[i];
        IF o IS DISTINCT FROM n THEN
          descended := 0;
          -- Both objects, or an object on one side and nothing on the other, under a
          -- key that doesn't look like a secret.
          IF coalesce(jsonb_typeof(o), 'object') = 'object'
             AND coalesce(jsonb_typeof(n), 'object') = 'object'
             AND regexp_replace(paths[i], '^.*[.]', '') !~* ${sql.lit(SECRET_KEY_PATTERN)} THEN
            FOR k2 IN
              SELECT jsonb_object_keys(coalesce(o, '{}'))
              UNION SELECT jsonb_object_keys(coalesce(n, '{}')) ORDER BY 1
            LOOP
              paths := paths || (paths[i] || '.' || k2);
              olds := olds || (o -> k2);
              news := news || (n -> k2);
              descended := descended + 1;
            END LOOP;
          END IF;
          -- A leaf, a secret, or an empty object appearing or going: recorded whole.
          IF descended = 0 THEN
            changed := changed || paths[i];
            before_v := before_v || jsonb_build_object(paths[i], o);
            after_v := after_v || jsonb_build_object(paths[i], n);
          END IF;
        END IF;
        i := i + 1;
      END LOOP;
      changed := ARRAY(SELECT unnest(changed) ORDER BY 1);
`;

/** 0021: an insert of a row that holds nothing beyond its ids writes no audit row. */
const SKIP_EMPTY_INSERT = sql`
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_each(new_row - TG_ARGV[1] - TG_ARGV[2] - TG_ARGV[3] - key_cols) AS e(c, v)
        WHERE v NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb)
      ) THEN
        RETURN NULL;
      END IF;
`;

/** 0015: a jsonb object column compared one level down. Restored by `down`. */
const ONE_LEVEL_DIFF = sql`
      FOR k IN SELECT jsonb_object_keys(new_row) ORDER BY 1 LOOP
        o := old_row -> k;
        n := new_row -> k;
        CONTINUE WHEN o IS NOT DISTINCT FROM n;
        IF jsonb_typeof(o) = 'object' AND jsonb_typeof(n) = 'object' THEN
          FOR k2 IN SELECT jsonb_object_keys(o) UNION SELECT jsonb_object_keys(n) ORDER BY 1 LOOP
            CONTINUE WHEN o -> k2 IS NOT DISTINCT FROM n -> k2;
            changed := changed || (k || '.' || k2);
            before_v := before_v || jsonb_build_object(k || '.' || k2, o -> k2);
            after_v := after_v || jsonb_build_object(k || '.' || k2, n -> k2);
          END LOOP;
        ELSE
          changed := changed || k;
          before_v := before_v || jsonb_build_object(k, o);
          after_v := after_v || jsonb_build_object(k, n);
        END IF;
      END LOOP;
`;

// CREATE OR REPLACE keeps the function's owner, grants and pinned search_path settings,
// and every trigger 0015 attached to it.
function rowChange(diff: RawBuilder<unknown>, onInsert: RawBuilder<unknown> = sql``) {
  return sql`
    CREATE OR REPLACE FUNCTION app.audit_row_change() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$ ${ROW_CHANGE_HEAD} ${diff} ${ROW_CHANGE_MIDDLE} ${onInsert} ${ROW_CHANGE_TAIL} $$
  `;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await rowChange(NESTED_DIFF, SKIP_EMPTY_INSERT).execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await rowChange(ONE_LEVEL_DIFF).execute(db);
}

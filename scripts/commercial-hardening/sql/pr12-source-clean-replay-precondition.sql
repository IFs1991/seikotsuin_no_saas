\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

SELECT to_regclass('supabase_migrations.schema_migrations') IS NULL
  AS history_table_absent
\gset

\if :history_table_absent
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'operation', 'SOURCE_CLEAN_REPLAY_PRECONDITION',
  'historyTablePresent', false,
  'appliedMigrationCount', 0,
  'isClean', true
)::text;
\else
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'operation', 'SOURCE_CLEAN_REPLAY_PRECONDITION',
  'historyTablePresent', true,
  'appliedMigrationCount', count(*),
  'isClean', count(*) = 0
)::text
FROM supabase_migrations.schema_migrations;
\endif

ROLLBACK;


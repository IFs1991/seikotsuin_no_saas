\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

SELECT jsonb_build_object(
  'schemaVersion', 1,
  'operation', 'MIGRATION_HISTORY_PARITY',
  'migrationCount', count(*),
  'versions', COALESCE(
    jsonb_agg(to_jsonb(version::text) ORDER BY version::text),
    '[]'::jsonb
  )
)::text
FROM supabase_migrations.schema_migrations;

ROLLBACK;


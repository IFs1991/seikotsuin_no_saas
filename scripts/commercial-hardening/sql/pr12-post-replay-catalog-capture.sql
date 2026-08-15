\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '300s';
SET LOCAL lock_timeout = '5s';

WITH relation_rows AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS object_name,
    CASE relation.relkind
      WHEN 'r' THEN 'table'
      WHEN 'p' THEN 'partitioned_table'
      WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized_view'
    END AS object_kind,
    relation.relrowsecurity AS rls_enabled
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'v', 'm')
),
routine_rows AS (
  SELECT
    namespace.nspname AS schema_name,
    routine.proname AS object_name,
    pg_catalog.pg_get_function_identity_arguments(routine.oid)
      AS identity_arguments,
    routine.prosecdef AS security_definer
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
),
auth_target_rows AS (
  SELECT
    namespace.nspname AS schema_name,
    relation.relname AS object_name,
    CASE
      WHEN relation.relkind IN ('r', 'p') THEN 'table'
      WHEN relation.relkind IN ('v', 'm') THEN 'view'
    END AS object_kind
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'auth'
    AND relation.relkind IN ('r', 'p', 'v', 'm')
  UNION ALL
  SELECT
    namespace.nspname,
    routine.proname,
    'routine'
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'auth'
),
platform_setting_rows AS (
  SELECT
    role.rolname AS role_name,
    setting.value AS setting
  FROM pg_catalog.pg_db_role_setting AS role_setting
  INNER JOIN pg_catalog.pg_roles AS role
    ON role.oid = role_setting.setrole
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting(value)
  WHERE setting.value LIKE 'pgrst.db_schemas=%'
     OR setting.value LIKE 'pgrst.db_extra_search_path=%'
     OR setting.value LIKE 'graphql.%introspection%'
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'operation', 'POST_REPLAY_CATALOG_CAPTURE',
  'relations', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'schema', schema_name,
          'name', object_name,
          'kind', object_kind,
          'rlsEnabled', rls_enabled
        )
        ORDER BY schema_name, object_name, object_kind
      )
      FROM relation_rows
    ),
    '[]'::jsonb
  ),
  'routines', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'schema', schema_name,
          'name', object_name,
          'identityArguments', identity_arguments,
          'securityDefiner', security_definer
        )
        ORDER BY schema_name, object_name, identity_arguments
      )
      FROM routine_rows
    ),
    '[]'::jsonb
  ),
  'authTargets', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'schema', schema_name,
          'name', object_name,
          'kind', object_kind
        )
        ORDER BY schema_name, object_name, object_kind
      )
      FROM auth_target_rows
    ),
    '[]'::jsonb
  ),
  'databasePlatformSettings', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('role', role_name, 'setting', setting)
        ORDER BY role_name, setting
      )
      FROM platform_setting_rows
    ),
    '[]'::jsonb
  ),
  'graphqlDatabaseObservation', jsonb_build_object(
    'extensionEnabled',
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_extension
      WHERE extname = 'pg_graphql'
    ),
    'defaultAssumed', false
  )
)::text;

ROLLBACK;


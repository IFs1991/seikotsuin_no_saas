with relevant_namespaces as (
  select oid, nspname, nspowner, nspacl
  from pg_namespace
  where nspname in ('public', 'app_private')
),
object_grants as (
  select
    namespace.nspname as schema,
    case relation.relkind
      when 'S' then 'SEQUENCE'
      when 'v' then 'VIEW'
      when 'm' then 'MATERIALIZED_VIEW'
      else 'TABLE'
    end::text as object_type,
    relation.relname::text as object_name,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
    acl.privilege_type,
    case when acl.is_grantable then 'YES' else 'NO' end as is_grantable,
    owner_role.rolname as owner
  from pg_class relation
  join relevant_namespaces namespace on namespace.oid = relation.relnamespace
  join pg_roles owner_role on owner_role.oid = relation.relowner
  cross join lateral aclexplode(
    coalesce(
      relation.relacl,
      acldefault(
        case when relation.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
        relation.relowner
      )
    )
  ) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  where relation.relkind in ('r', 'p', 'v', 'm', 'S')

  union all

  select
    namespace.nspname,
    'FUNCTION',
    routine.oid::regprocedure::text,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
    acl.privilege_type,
    case when acl.is_grantable then 'YES' else 'NO' end,
    owner_role.rolname
  from pg_proc routine
  join relevant_namespaces namespace on namespace.oid = routine.pronamespace
  join pg_roles owner_role on owner_role.oid = routine.proowner
  cross join lateral aclexplode(
    coalesce(routine.proacl, acldefault('f', routine.proowner))
  ) acl
  left join pg_roles grantee on grantee.oid = acl.grantee

  union all

  select
    namespace.nspname,
    'SCHEMA',
    namespace.nspname,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
    acl.privilege_type,
    case when acl.is_grantable then 'YES' else 'NO' end,
    owner_role.rolname
  from relevant_namespaces namespace
  join pg_roles owner_role on owner_role.oid = namespace.nspowner
  cross join lateral aclexplode(
    coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
  ) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
),
relevant_owners as (
  select distinct relation.relowner as owner_oid
  from pg_class relation
  join relevant_namespaces namespace on namespace.oid = relation.relnamespace

  union

  select distinct routine.proowner
  from pg_proc routine
  join relevant_namespaces namespace on namespace.oid = routine.pronamespace
),
default_object_types(object_type, acl_type) as (
  values
    ('DEFAULT_TABLE'::text, 'r'::"char"),
    ('DEFAULT_SEQUENCE'::text, 'S'::"char"),
    ('DEFAULT_FUNCTION'::text, 'f'::"char")
),
effective_global_defaults as (
  select
    '*'::text as schema,
    object_type.object_type,
    '*future* (effective global)'::text as object_name,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
    acl.privilege_type,
    case when acl.is_grantable then 'YES' else 'NO' end as is_grantable,
    owner_role.rolname as owner
  from relevant_owners object_owner
  join pg_roles owner_role on owner_role.oid = object_owner.owner_oid
  cross join default_object_types object_type
  left join pg_default_acl defaults
    on defaults.defaclrole = object_owner.owner_oid
   and defaults.defaclnamespace = 0
   and defaults.defaclobjtype = object_type.acl_type
  cross join lateral aclexplode(
    coalesce(
      defaults.defaclacl,
      acldefault(object_type.acl_type, object_owner.owner_oid)
    )
  ) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
),
schema_defaults as (
  select
    namespace.nspname as schema,
    case defaults.defaclobjtype
      when 'r' then 'DEFAULT_TABLE'
      when 'S' then 'DEFAULT_SEQUENCE'
      when 'f' then 'DEFAULT_FUNCTION'
      when 'T' then 'DEFAULT_TYPE'
      when 'n' then 'DEFAULT_SCHEMA'
      else 'DEFAULT_' || defaults.defaclobjtype::text
    end as object_type,
    '*future* (schema addition)'::text as object_name,
    case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
    acl.privilege_type,
    case when acl.is_grantable then 'YES' else 'NO' end as is_grantable,
    owner_role.rolname as owner
  from pg_default_acl defaults
  join relevant_namespaces namespace on namespace.oid = defaults.defaclnamespace
  join pg_roles owner_role on owner_role.oid = defaults.defaclrole
  cross join lateral aclexplode(defaults.defaclacl) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
)
select
  schema,
  object_type,
  object_name,
  grantee,
  privilege_type,
  is_grantable,
  'UNKNOWN_NOT_IN_PG_CATALOG'::text as source_migration_if_known,
  owner,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from object_grants
union all
select schema, object_type, object_name, grantee, privilege_type, is_grantable,
  'UNKNOWN_NOT_IN_PG_CATALOG', owner,
  'UNCLASSIFIED', 'UNDECIDED', 'UNKNOWN'
from effective_global_defaults
union all
select schema, object_type, object_name, grantee, privilege_type, is_grantable,
  'UNKNOWN_NOT_IN_PG_CATALOG', owner,
  'UNCLASSIFIED', 'UNDECIDED', 'UNKNOWN'
from schema_defaults
order by schema, object_type, object_name, grantee, privilege_type, owner;

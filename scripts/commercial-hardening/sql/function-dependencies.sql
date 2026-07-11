with target_functions as (
  select
    routine.oid,
    routine.oid::regprocedure::text as function_signature
  from pg_proc routine
  join pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname in ('public', 'app_private')
),
dependencies as (
  select
    target.function_signature,
    'TRIGGER'::text as dependency_type,
    relation_namespace.nspname as dependent_schema,
    relation.relname as dependent_object,
    trigger.tgname::text as detail
  from target_functions target
  join pg_trigger trigger on trigger.tgfoid = target.oid
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace
  where not trigger.tgisinternal

  union all

  select
    target.function_signature,
    'POLICY',
    relation_namespace.nspname,
    relation.relname,
    policy.polname
  from target_functions target
  join pg_depend dependency
    on dependency.refclassid = 'pg_proc'::regclass
   and dependency.refobjid = target.oid
   and dependency.classid = 'pg_policy'::regclass
  join pg_policy policy on policy.oid = dependency.objid
  join pg_class relation on relation.oid = policy.polrelid
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace

  union all

  select
    target.function_signature,
    case when relation.relkind in ('v', 'm') then 'VIEW' else 'REWRITE_RULE' end,
    relation_namespace.nspname,
    relation.relname,
    rewrite.rulename
  from target_functions target
  join pg_depend dependency
    on dependency.refclassid = 'pg_proc'::regclass
   and dependency.refobjid = target.oid
   and dependency.classid = 'pg_rewrite'::regclass
  join pg_rewrite rewrite on rewrite.oid = dependency.objid
  join pg_class relation on relation.oid = rewrite.ev_class
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace

  union all

  select
    target.function_signature,
    'FUNCTION',
    caller_namespace.nspname,
    caller.oid::regprocedure::text,
    dependency.deptype::text
  from target_functions target
  join pg_depend dependency
    on dependency.refclassid = 'pg_proc'::regclass
   and dependency.refobjid = target.oid
   and dependency.classid = 'pg_proc'::regclass
  join pg_proc caller on caller.oid = dependency.objid
  join pg_namespace caller_namespace on caller_namespace.oid = caller.pronamespace
  where caller.oid <> target.oid

  union all

  select
    target.function_signature,
    'CONSTRAINT',
    relation_namespace.nspname,
    relation.relname,
    table_constraint.conname
  from target_functions target
  join pg_depend dependency
    on dependency.refclassid = 'pg_proc'::regclass
   and dependency.refobjid = target.oid
   and dependency.classid = 'pg_constraint'::regclass
  join pg_constraint table_constraint on table_constraint.oid = dependency.objid
  join pg_class relation on relation.oid = table_constraint.conrelid
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace

  union all

  select
    target.function_signature,
    'COLUMN_DEFAULT',
    relation_namespace.nspname,
    relation.relname,
    attribute.attname
  from target_functions target
  join pg_depend dependency
    on dependency.refclassid = 'pg_proc'::regclass
   and dependency.refobjid = target.oid
   and dependency.classid = 'pg_attrdef'::regclass
  join pg_attrdef attribute_default on attribute_default.oid = dependency.objid
  join pg_class relation on relation.oid = attribute_default.adrelid
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace
  join pg_attribute attribute
    on attribute.attrelid = attribute_default.adrelid
   and attribute.attnum = attribute_default.adnum
)
select distinct
  function_signature,
  dependency_type,
  dependent_schema,
  dependent_object,
  detail
from dependencies
order by function_signature, dependency_type, dependent_schema, dependent_object, detail;

select
  child_ns.nspname as schema,
  child.relname as child_table,
  con.conname as constraint_name,
  case con.contype
    when 'f' then 'FOREIGN KEY'
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  coalesce(child_columns.columns, '') as child_columns,
  parent_ns.nspname as parent_schema,
  parent.relname as parent_table,
  coalesce(parent_columns.columns, '') as parent_columns,
  case con.confupdtype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as on_update,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as on_delete,
  con.convalidated as validated,
  (
    con.contype = 'f'
    and array_position(child_columns.column_array, 'clinic_id') is not null
    and array_position(child_columns.column_array, 'clinic_id') =
      array_position(parent_columns.column_array, 'clinic_id')
  ) as tenant_pair_detected,
  pg_get_constraintdef(con.oid) as definition,
  'UNCLASSIFIED'::text as classification,
  'UNDECIDED'::text as expected,
  'UNKNOWN'::text as difference
from pg_constraint con
join pg_class child on child.oid = con.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
left join pg_class parent on parent.oid = con.confrelid
left join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
left join lateral (
  select
    string_agg(att.attname, ',' order by key_columns.ordinality) as columns,
    array_agg(att.attname order by key_columns.ordinality) as column_array
  from unnest(con.conkey) with ordinality as key_columns(attnum, ordinality)
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = key_columns.attnum
) child_columns on true
left join lateral (
  select
    string_agg(att.attname, ',' order by key_columns.ordinality) as columns,
    array_agg(att.attname order by key_columns.ordinality) as column_array
  from unnest(con.confkey) with ordinality as key_columns(attnum, ordinality)
  join pg_attribute att
    on att.attrelid = con.confrelid
   and att.attnum = key_columns.attnum
) parent_columns on true
where child_ns.nspname in ('public', 'app_private')
order by child_ns.nspname, child.relname, con.conname;

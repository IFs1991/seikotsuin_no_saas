-- Caller-owned outer transaction only. The DROP is always rolled back in Phase A.

drop index public.idx_blocks_resource_id;

do $pr11_blocks_resource_index_candidate_guard$
declare
  drift text;
begin
  if to_regclass('public.idx_blocks_resource_id') is not null then
    raise exception 'PR-11 blocks resource index candidate: target index still exists';
  end if;

  with expected(index_name) as (
    values
      ('blocks_created_by_idx'),
      ('blocks_deleted_by_idx'),
      ('blocks_pkey'),
      ('blocks_resource_clinic_idx'),
      ('idx_blocks_clinic_id'),
      ('idx_blocks_clinic_time'),
      ('idx_blocks_end_time'),
      ('idx_blocks_is_active'),
      ('idx_blocks_resource_time'),
      ('idx_blocks_start_time')
  ), actual as (
    select index_class.relname::text as index_name
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    where index_data.indrelid = 'public.blocks'::regclass
  ), drift_rows as (
    (select index_name from expected except select index_name from actual)
    union all
    (select index_name from actual except select index_name from expected)
  )
  select string_agg(index_name, ', ' order by index_name)
  into drift
  from drift_rows;

  if drift is not null then
    raise exception
      'PR-11 blocks resource index candidate: unintended blocks index drift: %',
      drift;
  end if;

  if (
    select count(*)
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_am access_method on access_method.oid = index_class.relam
    join lateral (
      select array_agg(attribute_data.attname::text order by keys.ordinality)
        as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = index_data.indrelid
       and attribute_data.attnum = keys.attnum
      where keys.ordinality <= index_data.indnkeyatts
    ) key_data on true
    where index_class.oid = 'public.blocks_resource_clinic_idx'::regclass
      and index_data.indrelid = 'public.blocks'::regclass
      and key_data.columns = array['resource_id', 'clinic_id']
      and index_data.indnkeyatts = 2
      and index_data.indnatts = 2
      and access_method.amname = 'btree'
      and not index_data.indisunique
      and index_data.indisvalid
      and index_data.indisready
      and index_data.indislive
      and index_data.indpred is null
      and index_data.indexprs is null
  ) <> 1
    or (
      select count(*)
      from pg_constraint constraint_data
      where constraint_data.conrelid = 'public.blocks'::regclass
        and constraint_data.confrelid = 'public.resources'::regclass
        and constraint_data.conname = 'blocks_resource_id_fkey'
        and constraint_data.contype = 'f'
        and constraint_data.confupdtype = 'a'
        and constraint_data.confdeltype = 'c'
        and constraint_data.confmatchtype = 's'
        and constraint_data.convalidated
        and not constraint_data.condeferrable
    ) <> 1
  then
    raise exception
      'PR-11 blocks resource index candidate: replacement index or FK drift';
  end if;
end
$pr11_blocks_resource_index_candidate_guard$;

select jsonb_build_object(
  'kind', 'blocks_resource_index_drop_candidate_catalog',
  'target_present', false,
  'replacement_definition_md5', md5(pg_get_indexdef(
    'public.blocks_resource_clinic_idx'::regclass
  )),
  'blocks_index_count', (
    select count(*) from pg_index
    where indrelid = 'public.blocks'::regclass
  ),
  'contract_pass', true
) as candidate_catalog_row;


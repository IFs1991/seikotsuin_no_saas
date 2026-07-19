-- Shared 10,000-row ON DELETE CASCADE probe. The caller owns the transaction.

\set ON_ERROR_STOP on
\pset pager off

do $pr11_blocks_resource_index_cascade_settings$
begin
  if current_setting('enable_seqscan') <> 'on'
    or current_setting('enable_indexscan') <> 'on'
    or current_setting('enable_bitmapscan') <> 'on'
  then
    raise exception
      'PR-11 blocks resource index cascade probe refused: planner forcing detected';
  end if;
end
$pr11_blocks_resource_index_cascade_settings$;

create temporary table pr11_blocks_resource_index_cascade_result (
  state text primary key,
  plan_data jsonb not null,
  deleted_rows bigint not null,
  lock_timeout boolean not null
) on commit drop;

create function pg_temp.pr11_blocks_resource_index_cascade_explain(
  statement_text text
)
returns jsonb
language plpgsql
as $function$
declare
  result_data jsonb;
begin
  execute
    'explain (analyze, buffers, wal, timing off, summary on, format json) '
      || statement_text
    into result_data;
  return result_data;
end
$function$;

insert into public.clinics (id, name, parent_id)
values (
  'fb110000-0000-4000-8000-000000009101',
  '__pr11_blocks_resource_index_cascade__',
  null
);

insert into public.resources (id, clinic_id, name, type)
values
  (
    'fb110000-0000-4000-8000-000000009111',
    'fb110000-0000-4000-8000-000000009101',
    'PR11 Cascade Target',
    'room'
  ),
  (
    'fb110000-0000-4000-8000-000000009112',
    'fb110000-0000-4000-8000-000000009101',
    'PR11 Cascade Sentinel',
    'room'
  );

insert into public.blocks (
  id,
  clinic_id,
  resource_id,
  start_time,
  end_time
)
select
  md5('pr11-resource-index-cascade-block-' || fixture_number::text)::uuid,
  'fb110000-0000-4000-8000-000000009101'::uuid,
  'fb110000-0000-4000-8000-000000009111'::uuid,
  timestamptz '2105-01-01 00:00:00+00'
    + fixture_number * interval '1 minute',
  timestamptz '2105-01-01 00:00:30+00'
    + fixture_number * interval '1 minute'
from generate_series(1, 10000) fixture(fixture_number);

insert into public.blocks (
  id,
  clinic_id,
  resource_id,
  start_time,
  end_time
)
values (
  'fb110000-0000-4000-8000-000000009121',
  'fb110000-0000-4000-8000-000000009101',
  'fb110000-0000-4000-8000-000000009112',
  '2105-12-01 00:00:00+00',
  '2105-12-01 00:30:00+00'
);

insert into pr11_blocks_resource_index_cascade_result values (
  :'pr11_resource_index_state',
  pg_temp.pr11_blocks_resource_index_cascade_explain($statement$
    delete from public.resources
    where id = 'fb110000-0000-4000-8000-000000009111'::uuid
      and clinic_id = 'fb110000-0000-4000-8000-000000009101'::uuid
  $statement$),
  0,
  false
);

update pr11_blocks_resource_index_cascade_result
set deleted_rows = 10000 - (
  select count(*)
  from public.blocks
  where resource_id = 'fb110000-0000-4000-8000-000000009111'::uuid
    and clinic_id = 'fb110000-0000-4000-8000-000000009101'::uuid
);

do $pr11_blocks_resource_index_cascade_contract$
begin
  if (
    select count(*)
    from pr11_blocks_resource_index_cascade_result
    where deleted_rows = 10000
      and not lock_timeout
      and nullif(plan_data #>> '{0,Execution Time}', '') is not null
      and nullif(plan_data #>> '{0,Plan,WAL Records}', '') is not null
      and nullif(plan_data #>> '{0,Plan,WAL Bytes}', '') is not null
  ) <> 1
    or exists (
      select 1 from public.resources
      where id = 'fb110000-0000-4000-8000-000000009111'::uuid
    )
    or exists (
      select 1 from public.blocks
      where resource_id = 'fb110000-0000-4000-8000-000000009111'::uuid
    )
    or not exists (
      select 1 from public.resources
      where id = 'fb110000-0000-4000-8000-000000009112'::uuid
        and clinic_id = 'fb110000-0000-4000-8000-000000009101'::uuid
    )
    or not exists (
      select 1 from public.blocks
      where id = 'fb110000-0000-4000-8000-000000009121'::uuid
        and resource_id = 'fb110000-0000-4000-8000-000000009112'::uuid
    )
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
        and not constraint_data.condeferred
    ) <> 1
    or (
      select count(*)
      from pg_trigger trigger_data
      join pg_constraint constraint_data
        on constraint_data.oid = trigger_data.tgconstraint
      where constraint_data.conrelid = 'public.blocks'::regclass
        and constraint_data.conname = 'blocks_resource_id_fkey'
        and trigger_data.tgisinternal
        and trigger_data.tgenabled = 'O'
    ) <> 4
    or (
      select count(*)
      from pg_trigger trigger_data
      where trigger_data.tgrelid = 'public.blocks'::regclass
        and trigger_data.tgname = 'blocks_clinic_ref_check'
        and not trigger_data.tgisinternal
        and trigger_data.tgenabled = 'O'
        and trigger_data.tgfoid =
          'public.validate_blocks_clinic_refs()'::regprocedure
    ) <> 1
  then
    raise exception 'PR-11 blocks resource index cascade contract failed';
  end if;
end
$pr11_blocks_resource_index_cascade_contract$;

select jsonb_build_object(
  'kind', 'blocks_resource_index_cascade',
  'state', state,
  'execution_ms',
    (plan_data #>> '{0,Execution Time}')::numeric,
  'wal_records',
    (plan_data #>> '{0,Plan,WAL Records}')::bigint,
  'wal_bytes',
    (plan_data #>> '{0,Plan,WAL Bytes}')::bigint,
  'deleted_rows', deleted_rows,
  'lock_timeout', lock_timeout,
  'raw_plan_md5', md5(plan_data::text),
  'raw_plan', plan_data,
  'contract_pass', true
) as cascade_row
from pr11_blocks_resource_index_cascade_result;

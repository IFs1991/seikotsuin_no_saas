-- Shared natural-planner probe. The caller owns the transaction and state.

\set ON_ERROR_STOP on
\pset pager off

do $pr11_blocks_resource_index_plan_settings$
begin
  if current_setting('enable_seqscan') <> 'on'
    or current_setting('enable_indexscan') <> 'on'
    or current_setting('enable_bitmapscan') <> 'on'
  then
    raise exception
      'PR-11 blocks resource index plan probe refused: planner forcing detected';
  end if;
end
$pr11_blocks_resource_index_plan_settings$;

create temporary table pr11_blocks_resource_index_plan_result (
  state text not null,
  probe_name text not null,
  expected_rows bigint not null,
  plan_data jsonb not null,
  primary key (state, probe_name)
) on commit drop;

create function pg_temp.pr11_blocks_resource_index_explain(
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
  'fb110000-0000-4000-8000-000000009001',
  '__pr11_blocks_resource_index_plan__',
  null
);

insert into public.resources (id, clinic_id, name, type)
select
  md5('pr11-resource-index-plan-resource-' || resource_number::text)::uuid,
  'fb110000-0000-4000-8000-000000009001'::uuid,
  'PR11 Resource Index Plan ' || resource_number::text,
  'room'
from generate_series(1, 200) fixture(resource_number);

insert into public.blocks (
  id,
  clinic_id,
  resource_id,
  start_time,
  end_time,
  is_active,
  is_deleted
)
select
  md5(
    'pr11-resource-index-plan-block-'
      || resource_number::text || '-' || block_number::text
  )::uuid,
  'fb110000-0000-4000-8000-000000009001'::uuid,
  md5('pr11-resource-index-plan-resource-' || resource_number::text)::uuid,
  timestamptz '2104-01-01 00:00:00+00'
    + block_number * interval '2 minutes',
  timestamptz '2104-01-01 00:00:00+00'
    + block_number * interval '2 minutes'
    + interval '1 minute',
  true,
  false
from generate_series(1, 200) resources(resource_number)
cross join generate_series(1, 100) blocks(block_number);

analyze public.blocks;

insert into pr11_blocks_resource_index_plan_result values
  (
    :'pr11_resource_index_state',
    'resource_only',
    100,
    pg_temp.pr11_blocks_resource_index_explain($query$
      select id, clinic_id, resource_id
      from public.blocks
      where resource_id =
        md5('pr11-resource-index-plan-resource-42')::uuid
    $query$)
  ),
  (
    :'pr11_resource_index_state',
    'resource_clinic',
    100,
    pg_temp.pr11_blocks_resource_index_explain($query$
      select id, clinic_id, resource_id
      from public.blocks
      where resource_id =
          md5('pr11-resource-index-plan-resource-42')::uuid
        and clinic_id = 'fb110000-0000-4000-8000-000000009001'::uuid
    $query$)
  ),
  (
    :'pr11_resource_index_state',
    'active_time',
    10,
    pg_temp.pr11_blocks_resource_index_explain($query$
      select id, clinic_id, resource_id
      from public.blocks
      where resource_id =
          md5('pr11-resource-index-plan-resource-42')::uuid
        and clinic_id = 'fb110000-0000-4000-8000-000000009001'::uuid
        and is_active = true
        and is_deleted = false
        and start_time < timestamptz '2104-01-01 00:22:00+00'
        and end_time > timestamptz '2104-01-01 00:02:00+00'
    $query$)
  );

-- Emit the untouched plans before the fail-closed contract so a rejected
-- natural plan remains diagnosable in the raw evidence. The runner ignores
-- this diagnostic kind when evaluating the hard gate.
select jsonb_build_object(
  'kind', 'blocks_resource_index_plan_diagnostic',
  'state', result_data.state,
  'probe', result_data.probe_name,
  'actual_rows',
    (result_data.plan_data #>> '{0,Plan,Actual Rows}')::bigint,
  'expected_rows', result_data.expected_rows,
  'raw_plan_md5', md5(result_data.plan_data::text),
  'raw_plan', result_data.plan_data
) as plan_diagnostic_row
from pr11_blocks_resource_index_plan_result result_data
order by result_data.probe_name;

do $pr11_blocks_resource_index_plan_contract$
begin
  if (
    select count(*)
    from pr11_blocks_resource_index_plan_result
  ) <> 3
    or exists (
      select 1
      from pr11_blocks_resource_index_plan_result result_data
      where (result_data.plan_data #>> '{0,Plan,Actual Rows}')::bigint
        <> result_data.expected_rows
    )
    or exists (
      select 1
      from pr11_blocks_resource_index_plan_result result_data
      where exists (
        with recursive plan_nodes(node_data) as (
          select result_data.plan_data #> '{0,Plan}'
          union all
          select child.value
          from plan_nodes parent
          cross join lateral jsonb_array_elements(
            coalesce(parent.node_data -> 'Plans', '[]'::jsonb)
          ) child
        )
        select 1
        from plan_nodes
        where node_data ->> 'Relation Name' = 'blocks'
          and node_data ->> 'Node Type' = 'Seq Scan'
      )
    )
    or exists (
      select 1
      from pr11_blocks_resource_index_plan_result result_data
      where not exists (
        with recursive plan_nodes(node_data) as (
          select result_data.plan_data #> '{0,Plan}'
          union all
          select child.value
          from plan_nodes parent
          cross join lateral jsonb_array_elements(
            coalesce(parent.node_data -> 'Plans', '[]'::jsonb)
          ) child
        )
        select 1
        from plan_nodes
        where node_data ->> 'Index Name' = any (
            case
              when result_data.state = 'candidate'
                and result_data.probe_name = 'active_time'
                then array[
                  'idx_blocks_resource_time',
                  'blocks_resource_clinic_idx'
                ]
              when result_data.state = 'candidate'
                then array['blocks_resource_clinic_idx']
              else array[
                'idx_blocks_resource_id',
                'blocks_resource_clinic_idx',
                'idx_blocks_resource_time'
              ]
            end
          )
      )
    )
    or exists (
      select 1
      from pr11_blocks_resource_index_plan_result result_data
      where result_data.state = 'candidate'
        and exists (
          with recursive plan_nodes(node_data) as (
            select result_data.plan_data #> '{0,Plan}'
            union all
            select child.value
            from plan_nodes parent
            cross join lateral jsonb_array_elements(
              coalesce(parent.node_data -> 'Plans', '[]'::jsonb)
            ) child
          )
          select 1
          from plan_nodes
          where node_data ->> 'Index Name' = 'idx_blocks_resource_id'
        )
    )
  then
    raise exception 'PR-11 blocks resource index natural plan contract failed';
  end if;
end
$pr11_blocks_resource_index_plan_contract$;

select jsonb_build_object(
  'kind', 'blocks_resource_index_plan',
  'state', result_data.state,
  'probe', result_data.probe_name,
  'actual_rows',
    (result_data.plan_data #>> '{0,Plan,Actual Rows}')::bigint,
  'expected_rows', result_data.expected_rows,
  'selected_indexes', coalesce((
    with recursive plan_nodes(node_data) as (
      select result_data.plan_data #> '{0,Plan}'
      union all
      select child.value
      from plan_nodes parent
      cross join lateral jsonb_array_elements(
        coalesce(parent.node_data -> 'Plans', '[]'::jsonb)
      ) child
    )
    select jsonb_agg(index_name order by index_name)
    from (
      select distinct node_data ->> 'Index Name' as index_name
      from plan_nodes
      where node_data ? 'Index Name'
    ) indexes
  ), '[]'::jsonb),
  'raw_plan_md5', md5(result_data.plan_data::text),
  'raw_plan', result_data.plan_data,
  'contract_pass', true
) as plan_row
from pr11_blocks_resource_index_plan_result result_data
order by result_data.probe_name;

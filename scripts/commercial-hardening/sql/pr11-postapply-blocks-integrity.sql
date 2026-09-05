-- Exact BEFORE/AFTER behavior and error-diagnostic comparison from the
-- permanently applied fast path. All temporary DDL is rolled back.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

\ir pr11-postapply-blocks-before-ddl.sql

create temporary table pr11_blocks_diagnostic_result (
  state text not null,
  sequence_number integer not null,
  case_name text not null,
  returned_sqlstate text not null,
  message_text text not null,
  detail_text text,
  hint_text text,
  schema_name text,
  table_name text,
  column_name text,
  constraint_name text,
  primary key (state, case_name)
) on commit drop;

create temporary table pr11_blocks_behavior_result (
  state text not null,
  sequence_number integer not null,
  case_name text not null,
  actual text not null,
  primary key (state, case_name)
) on commit drop;

create function pg_temp.pr11_capture_blocks_error(
  state_name text,
  sequence_value integer,
  case_value text,
  statement_text text
)
returns void
language plpgsql
as $function$
declare
  returned_sqlstate_value text;
  message_text_value text;
  detail_text_value text;
  hint_text_value text;
  schema_name_value text;
  table_name_value text;
  column_name_value text;
  constraint_name_value text;
begin
  begin
    execute statement_text;
  exception
    when others then
      get stacked diagnostics
        returned_sqlstate_value = returned_sqlstate,
        message_text_value = message_text,
        detail_text_value = pg_exception_detail,
        hint_text_value = pg_exception_hint,
        schema_name_value = schema_name,
        table_name_value = table_name,
        column_name_value = column_name,
        constraint_name_value = constraint_name;

      insert into pr11_blocks_diagnostic_result values (
        state_name,
        sequence_value,
        case_value,
        returned_sqlstate_value,
        message_text_value,
        nullif(detail_text_value, ''),
        nullif(hint_text_value, ''),
        nullif(schema_name_value, ''),
        nullif(table_name_value, ''),
        nullif(column_name_value, ''),
        nullif(constraint_name_value, '')
      );
      return;
  end;

  raise exception 'PR-11 blocks case % unexpectedly succeeded', case_value;
end
$function$;

insert into public.clinics (id, name, parent_id)
values
  ('fb110000-0000-4000-8000-000000008001', '__pr11_blocks_root_a__', null),
  ('fb110000-0000-4000-8000-000000008002', '__pr11_blocks_root_b__', null),
  ('fb110000-0000-4000-8000-000000008003', '__pr11_blocks_current_cascade__', null),
  ('fb110000-0000-4000-8000-000000008004', '__pr11_blocks_candidate_cascade__', null);

insert into public.resources (id, clinic_id, name, type)
values
  ('fb110000-0000-4000-8000-000000008101', 'fb110000-0000-4000-8000-000000008001', 'PR11 A1', 'room'),
  ('fb110000-0000-4000-8000-000000008102', 'fb110000-0000-4000-8000-000000008001', 'PR11 A2', 'room'),
  ('fb110000-0000-4000-8000-000000008201', 'fb110000-0000-4000-8000-000000008002', 'PR11 B1', 'room'),
  ('fb110000-0000-4000-8000-000000008202', 'fb110000-0000-4000-8000-000000008002', 'PR11 B2', 'room'),
  ('fb110000-0000-4000-8000-000000008301', 'fb110000-0000-4000-8000-000000008003', 'PR11 Current Cascade', 'room'),
  ('fb110000-0000-4000-8000-000000008401', 'fb110000-0000-4000-8000-000000008004', 'PR11 Candidate Cascade', 'room');

insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
values (
  'fb110000-0000-4000-8000-000000008501',
  'fb110000-0000-4000-8000-000000008001',
  'fb110000-0000-4000-8000-000000008101',
  '2103-01-01 00:00:00+00',
  '2103-01-01 00:30:00+00'
);

create function pg_temp.pr11_run_blocks_error_matrix(state_name text)
returns void
language plpgsql
as $function$
begin
  perform pg_temp.pr11_capture_blocks_error(state_name, 1, 'null_clinic_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008901', null,
        'fb110000-0000-4000-8000-000000008101',
        '2103-02-01 00:00:00+00', '2103-02-01 00:30:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 2, 'null_resource_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008902',
        'fb110000-0000-4000-8000-000000008001', null,
        '2103-02-01 01:00:00+00', '2103-02-01 01:30:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 3, 'missing_resource_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008903',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008999',
        '2103-02-01 02:00:00+00', '2103-02-01 02:30:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 4, 'cross_clinic_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008904',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008201',
        '2103-02-01 03:00:00+00', '2103-02-01 03:30:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 5, 'cross_resource_update',
    $$update public.blocks
      set resource_id = 'fb110000-0000-4000-8000-000000008201'
      where id = 'fb110000-0000-4000-8000-000000008501'$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 6, 'clinic_only_rehome',
    $$update public.blocks
      set clinic_id = 'fb110000-0000-4000-8000-000000008002'
      where id = 'fb110000-0000-4000-8000-000000008501'$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 7, 'parent_resource_rehome',
    $$update public.resources
      set clinic_id = 'fb110000-0000-4000-8000-000000008002'
      where id = 'fb110000-0000-4000-8000-000000008101'$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 8, 'null_both_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008908', null, null,
        '2103-02-01 04:00:00+00', '2103-02-01 04:30:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 9, 'cross_clinic_invalid_times_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008909',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008201',
        '2103-02-01 06:00:00+00', '2103-02-01 05:00:00+00')$$);
  perform pg_temp.pr11_capture_blocks_error(state_name, 10, 'missing_resource_invalid_times_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008910',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008999',
        '2103-02-01 06:00:00+00', '2103-02-01 05:00:00+00')$$);
end
$function$;

select pg_temp.pr11_run_blocks_error_matrix('current');

insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
values (
  'fb110000-0000-4000-8000-000000008601',
  'fb110000-0000-4000-8000-000000008001',
  'fb110000-0000-4000-8000-000000008102',
  '2103-03-01 00:00:00+00', '2103-03-01 00:30:00+00'
);
insert into pr11_blocks_behavior_result values
  ('current', 11, 'same_clinic_insert', 'ROW_COUNT=1');

update public.blocks
set start_time = '2103-03-01 00:05:00+00'
where id = 'fb110000-0000-4000-8000-000000008601';
insert into pr11_blocks_behavior_result values
  ('current', 12, 'same_clinic_update', 'ROW_COUNT=1');

update public.blocks
set clinic_id = 'fb110000-0000-4000-8000-000000008002',
    resource_id = 'fb110000-0000-4000-8000-000000008202'
where id = 'fb110000-0000-4000-8000-000000008601';
insert into pr11_blocks_behavior_result values
  ('current', 13, 'atomic_valid_rehome', 'ROW_COUNT=1');

delete from public.resources
where id = 'fb110000-0000-4000-8000-000000008202';
insert into pr11_blocks_behavior_result
select 'current', 14, 'resource_delete_cascade',
  case when exists (
    select 1 from public.blocks
    where id = 'fb110000-0000-4000-8000-000000008601'
  ) then 'BLOCK_PRESENT' else 'BLOCK_ABSENT' end;

insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
values (
  'fb110000-0000-4000-8000-000000008603',
  'fb110000-0000-4000-8000-000000008003',
  'fb110000-0000-4000-8000-000000008301',
  '2103-03-03 00:00:00+00', '2103-03-03 00:30:00+00'
);
delete from public.clinics
where id = 'fb110000-0000-4000-8000-000000008003';
insert into pr11_blocks_behavior_result
select 'current', 15, 'clinic_delete_cascade',
  case when exists (
      select 1 from public.blocks
      where id = 'fb110000-0000-4000-8000-000000008603'
    ) or exists (
      select 1 from public.resources
      where id = 'fb110000-0000-4000-8000-000000008301'
    ) then 'RESOURCE_OR_BLOCK_PRESENT' else 'RESOURCE_AND_BLOCK_ABSENT' end;

\ir pr11-forward-blocks-trigger-fast-path-ddl.sql

select pg_temp.pr11_run_blocks_error_matrix('candidate');

insert into public.resources (id, clinic_id, name, type)
values
  ('fb110000-0000-4000-8000-000000008111', 'fb110000-0000-4000-8000-000000008001', 'PR11 Candidate A1', 'room'),
  ('fb110000-0000-4000-8000-000000008211', 'fb110000-0000-4000-8000-000000008002', 'PR11 Candidate B1', 'room');

insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
values (
  'fb110000-0000-4000-8000-000000008602',
  'fb110000-0000-4000-8000-000000008001',
  'fb110000-0000-4000-8000-000000008111',
  '2103-04-01 00:00:00+00', '2103-04-01 00:30:00+00'
);
insert into pr11_blocks_behavior_result values
  ('candidate', 11, 'same_clinic_insert', 'ROW_COUNT=1');

update public.blocks
set start_time = '2103-04-01 00:05:00+00'
where id = 'fb110000-0000-4000-8000-000000008602';
insert into pr11_blocks_behavior_result values
  ('candidate', 12, 'same_clinic_update', 'ROW_COUNT=1');

update public.blocks
set clinic_id = 'fb110000-0000-4000-8000-000000008002',
    resource_id = 'fb110000-0000-4000-8000-000000008211'
where id = 'fb110000-0000-4000-8000-000000008602';
insert into pr11_blocks_behavior_result values
  ('candidate', 13, 'atomic_valid_rehome', 'ROW_COUNT=1');

delete from public.resources
where id = 'fb110000-0000-4000-8000-000000008211';
insert into pr11_blocks_behavior_result
select 'candidate', 14, 'resource_delete_cascade',
  case when exists (
    select 1 from public.blocks
    where id = 'fb110000-0000-4000-8000-000000008602'
  ) then 'BLOCK_PRESENT' else 'BLOCK_ABSENT' end;

insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
values (
  'fb110000-0000-4000-8000-000000008604',
  'fb110000-0000-4000-8000-000000008004',
  'fb110000-0000-4000-8000-000000008401',
  '2103-04-03 00:00:00+00', '2103-04-03 00:30:00+00'
);
delete from public.clinics
where id = 'fb110000-0000-4000-8000-000000008004';
insert into pr11_blocks_behavior_result
select 'candidate', 15, 'clinic_delete_cascade',
  case when exists (
      select 1 from public.blocks
      where id = 'fb110000-0000-4000-8000-000000008604'
    ) or exists (
      select 1 from public.resources
      where id = 'fb110000-0000-4000-8000-000000008401'
    ) then 'RESOURCE_OR_BLOCK_PRESENT' else 'RESOURCE_AND_BLOCK_ABSENT' end;

do $comparison_guard$
begin
  if (
    select count(*)
    from pr11_blocks_diagnostic_result
  ) <> 20
    or (
      select count(*)
      from pr11_blocks_behavior_result
    ) <> 10
    or exists (
      select 1
      from pr11_blocks_diagnostic_result current_result
      full join pr11_blocks_diagnostic_result candidate_result
        on candidate_result.state = 'candidate'
       and candidate_result.case_name = current_result.case_name
      where current_result.state = 'current'
        and (
          candidate_result.case_name is null
          or row(
            current_result.returned_sqlstate,
            current_result.message_text,
            current_result.detail_text,
            current_result.hint_text,
            current_result.schema_name,
            current_result.table_name,
            current_result.column_name,
            current_result.constraint_name
          ) is distinct from row(
            candidate_result.returned_sqlstate,
            candidate_result.message_text,
            candidate_result.detail_text,
            candidate_result.hint_text,
            candidate_result.schema_name,
            candidate_result.table_name,
            candidate_result.column_name,
            candidate_result.constraint_name
          )
        )
    )
    or exists (
      select 1
      from pr11_blocks_behavior_result current_result
      full join pr11_blocks_behavior_result candidate_result
        on candidate_result.state = 'candidate'
       and candidate_result.case_name = current_result.case_name
      where current_result.state = 'current'
        and (
          candidate_result.case_name is null
          or current_result.actual is distinct from candidate_result.actual
        )
    )
  then
    raise exception 'PR-11 blocks exact compatibility comparison failed';
  end if;
end
$comparison_guard$;

select jsonb_build_object(
  'kind', 'blocks_integrity_case',
  'state', state,
  'sequence', sequence_number,
  'case', case_name,
  'pass', true,
  'sqlstate', returned_sqlstate,
  'message', message_text,
  'detail', detail_text,
  'hint', hint_text,
  'schema', schema_name,
  'table', table_name,
  'column', column_name,
  'constraint', constraint_name
) as integrity_case
from pr11_blocks_diagnostic_result
order by sequence_number, state;

select jsonb_build_object(
  'kind', 'blocks_integrity_case',
  'state', state,
  'sequence', sequence_number,
  'case', case_name,
  'pass', true,
  'actual', actual
) as behavior_case
from pr11_blocks_behavior_result
order by sequence_number, state;

select jsonb_build_object(
  'kind', 'blocks_integrity_summary',
  'paired_cases', 15,
  'diagnostic_cases', 10,
  'behavior_cases', 5,
  'passed', true,
  'sqlstate_equivalent', true,
  'message_equivalent', true,
  'diagnostic_equivalent', true,
  'behavior_equivalent', true
) as integrity_summary;

rollback;

\ir pr11-postapply-permanent-state.sql

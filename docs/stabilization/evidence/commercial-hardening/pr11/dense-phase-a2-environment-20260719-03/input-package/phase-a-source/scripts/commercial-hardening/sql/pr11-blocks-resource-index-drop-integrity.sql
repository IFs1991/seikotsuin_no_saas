-- Exact current/candidate behavior, diagnostics, FK, and trigger comparison.
-- The only persistent-schema candidate DDL is the transaction-local DROP.

\set ON_ERROR_STOP on
\pset pager off

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

begin;

set local role postgres;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr11_blocks_resource_index_diagnostic_result (
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

create temporary table pr11_blocks_resource_index_behavior_result (
  state text not null,
  sequence_number integer not null,
  case_name text not null,
  actual text not null,
  primary key (state, case_name)
) on commit drop;

create temporary table pr11_blocks_resource_index_metadata_result (
  state text primary key,
  metadata jsonb not null
) on commit drop;

create function pg_temp.pr11_blocks_resource_index_capture_error(
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

      insert into pr11_blocks_resource_index_diagnostic_result values (
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

  raise exception 'PR-11 blocks resource index case % unexpectedly succeeded',
    case_value;
end
$function$;

create function pg_temp.pr11_blocks_resource_index_capture_metadata(
  state_name text
)
returns void
language plpgsql
as $function$
begin
  insert into pr11_blocks_resource_index_metadata_result (state, metadata)
  select state_name, jsonb_build_object(
    'fk', (
      select jsonb_build_object(
        'definition', pg_get_constraintdef(constraint_data.oid),
        'validated', constraint_data.convalidated,
        'deferrable', constraint_data.condeferrable,
        'deferred', constraint_data.condeferred,
        'update_action', constraint_data.confupdtype,
        'delete_action', constraint_data.confdeltype,
        'match_type', constraint_data.confmatchtype
      )
      from pg_constraint constraint_data
      where constraint_data.conrelid = 'public.blocks'::regclass
        and constraint_data.conname = 'blocks_resource_id_fkey'
    ),
    'ri_triggers', (
      select jsonb_agg(
        jsonb_build_object(
          'name', trigger_data.tgname,
          'enabled', trigger_data.tgenabled,
          'definition', pg_get_triggerdef(trigger_data.oid)
        ) order by trigger_data.tgname
      )
      from pg_trigger trigger_data
      join pg_constraint constraint_data
        on constraint_data.oid = trigger_data.tgconstraint
      where constraint_data.conrelid = 'public.blocks'::regclass
        and constraint_data.conname = 'blocks_resource_id_fkey'
        and trigger_data.tgisinternal
    ),
    'custom_trigger', (
      select jsonb_build_object(
        'name', trigger_data.tgname,
        'enabled', trigger_data.tgenabled,
        'definition', pg_get_triggerdef(trigger_data.oid)
      )
      from pg_trigger trigger_data
      where trigger_data.tgrelid = 'public.blocks'::regclass
        and trigger_data.tgname = 'blocks_clinic_ref_check'
        and not trigger_data.tgisinternal
    ),
    'function', (
      select jsonb_build_object(
        'definition', pg_get_functiondef(procedure_data.oid),
        'owner', pg_get_userbyid(procedure_data.proowner),
        'security_definer', procedure_data.prosecdef,
        'config', procedure_data.proconfig,
        'acl', procedure_data.proacl
      )
      from pg_proc procedure_data
      where procedure_data.oid =
        'public.validate_blocks_clinic_refs()'::regprocedure
    )
  );
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
  ('fb110000-0000-4000-8000-000000008111', 'fb110000-0000-4000-8000-000000008001', 'PR11 Candidate A1', 'room'),
  ('fb110000-0000-4000-8000-000000008201', 'fb110000-0000-4000-8000-000000008002', 'PR11 B1', 'room'),
  ('fb110000-0000-4000-8000-000000008202', 'fb110000-0000-4000-8000-000000008002', 'PR11 B2', 'room'),
  ('fb110000-0000-4000-8000-000000008211', 'fb110000-0000-4000-8000-000000008002', 'PR11 Candidate B1', 'room'),
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

create function pg_temp.pr11_blocks_resource_index_run_error_matrix(
  state_name text
)
returns void
language plpgsql
as $function$
begin
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 1, 'null_clinic_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008901', null,
        'fb110000-0000-4000-8000-000000008101',
        '2103-02-01 00:00:00+00', '2103-02-01 00:30:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 2, 'null_resource_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008902',
        'fb110000-0000-4000-8000-000000008001', null,
        '2103-02-01 01:00:00+00', '2103-02-01 01:30:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 3, 'missing_resource_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008903',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008999',
        '2103-02-01 02:00:00+00', '2103-02-01 02:30:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 4, 'cross_clinic_insert',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008904',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008201',
        '2103-02-01 03:00:00+00', '2103-02-01 03:30:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 5, 'cross_resource_update',
    $$update public.blocks
      set resource_id = 'fb110000-0000-4000-8000-000000008201'
      where id = 'fb110000-0000-4000-8000-000000008501'$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 6, 'clinic_only_rehome',
    $$update public.blocks
      set clinic_id = 'fb110000-0000-4000-8000-000000008002'
      where id = 'fb110000-0000-4000-8000-000000008501'$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 7, 'parent_resource_rehome',
    $$update public.resources
      set clinic_id = 'fb110000-0000-4000-8000-000000008002'
      where id = 'fb110000-0000-4000-8000-000000008101'$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 8, 'null_both_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008908', null, null,
        '2103-02-01 04:00:00+00', '2103-02-01 04:30:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 9, 'cross_clinic_invalid_times_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008909',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008201',
        '2103-02-01 06:00:00+00', '2103-02-01 05:00:00+00')$$
  );
  perform pg_temp.pr11_blocks_resource_index_capture_error(
    state_name, 10, 'missing_resource_invalid_times_precedence',
    $$insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
      values ('fb110000-0000-4000-8000-000000008910',
        'fb110000-0000-4000-8000-000000008001',
        'fb110000-0000-4000-8000-000000008999',
        '2103-02-01 06:00:00+00', '2103-02-01 05:00:00+00')$$
  );
end
$function$;

create function pg_temp.pr11_blocks_resource_index_run_behavior_matrix(
  state_name text,
  block_id uuid,
  source_clinic_id uuid,
  source_resource_id uuid,
  target_clinic_id uuid,
  target_resource_id uuid,
  cascade_clinic_id uuid,
  cascade_resource_id uuid,
  cascade_block_id uuid,
  time_base timestamptz
)
returns void
language plpgsql
as $function$
declare
  affected_rows bigint;
  actual_value text;
begin
  insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
  values (
    block_id,
    source_clinic_id,
    source_resource_id,
    time_base,
    time_base + interval '30 minutes'
  );
  get diagnostics affected_rows = row_count;
  insert into pr11_blocks_resource_index_behavior_result values
    (state_name, 11, 'same_clinic_insert',
      format('ROW_COUNT=%s', affected_rows));

  update public.blocks
  set start_time = time_base + interval '5 minutes'
  where id = block_id;
  get diagnostics affected_rows = row_count;
  insert into pr11_blocks_resource_index_behavior_result values
    (state_name, 12, 'same_clinic_update',
      format('ROW_COUNT=%s', affected_rows));

  update public.blocks
  set clinic_id = target_clinic_id,
      resource_id = target_resource_id
  where id = block_id;
  get diagnostics affected_rows = row_count;
  insert into pr11_blocks_resource_index_behavior_result values
    (state_name, 13, 'atomic_valid_rehome',
      format('ROW_COUNT=%s', affected_rows));

  delete from public.resources where id = target_resource_id;
  actual_value := case when exists (
    select 1 from public.blocks where id = block_id
  ) then 'BLOCK_PRESENT' else 'BLOCK_ABSENT' end;
  insert into pr11_blocks_resource_index_behavior_result values
    (state_name, 14, 'resource_delete_cascade', actual_value);

  insert into public.blocks (id, clinic_id, resource_id, start_time, end_time)
  values (
    cascade_block_id,
    cascade_clinic_id,
    cascade_resource_id,
    time_base + interval '2 days',
    time_base + interval '2 days 30 minutes'
  );
  delete from public.clinics where id = cascade_clinic_id;
  actual_value := case when exists (
      select 1 from public.blocks where id = cascade_block_id
    ) or exists (
      select 1 from public.resources where id = cascade_resource_id
    ) then 'RESOURCE_OR_BLOCK_PRESENT'
    else 'RESOURCE_AND_BLOCK_ABSENT' end;
  insert into pr11_blocks_resource_index_behavior_result values
    (state_name, 15, 'clinic_delete_cascade', actual_value);
end
$function$;

select pg_temp.pr11_blocks_resource_index_capture_metadata('current');
select pg_temp.pr11_blocks_resource_index_run_error_matrix('current');
select pg_temp.pr11_blocks_resource_index_run_behavior_matrix(
  'current',
  'fb110000-0000-4000-8000-000000008601',
  'fb110000-0000-4000-8000-000000008001',
  'fb110000-0000-4000-8000-000000008102',
  'fb110000-0000-4000-8000-000000008002',
  'fb110000-0000-4000-8000-000000008202',
  'fb110000-0000-4000-8000-000000008003',
  'fb110000-0000-4000-8000-000000008301',
  'fb110000-0000-4000-8000-000000008603',
  '2103-03-01 00:00:00+00'
);

\ir pr11-blocks-resource-index-drop-ddl.sql

select pg_temp.pr11_blocks_resource_index_capture_metadata('candidate');
select pg_temp.pr11_blocks_resource_index_run_error_matrix('candidate');
select pg_temp.pr11_blocks_resource_index_run_behavior_matrix(
  'candidate',
  'fb110000-0000-4000-8000-000000008602',
  'fb110000-0000-4000-8000-000000008001',
  'fb110000-0000-4000-8000-000000008111',
  'fb110000-0000-4000-8000-000000008002',
  'fb110000-0000-4000-8000-000000008211',
  'fb110000-0000-4000-8000-000000008004',
  'fb110000-0000-4000-8000-000000008401',
  'fb110000-0000-4000-8000-000000008604',
  '2103-04-01 00:00:00+00'
);

do $pr11_blocks_resource_index_integrity_contract$
begin
  if (
    select count(*)
    from pr11_blocks_resource_index_diagnostic_result
  ) <> 20
    or (
      select count(*)
      from pr11_blocks_resource_index_behavior_result
    ) <> 10
    or (
      select count(*)
      from pr11_blocks_resource_index_metadata_result
    ) <> 2
    or exists (
      select 1
      from pr11_blocks_resource_index_diagnostic_result current_result
      full join pr11_blocks_resource_index_diagnostic_result candidate_result
        on candidate_result.state = 'candidate'
       and candidate_result.case_name = current_result.case_name
      where current_result.state = 'current'
        and (
          candidate_result.case_name is null
          or current_result.sequence_number
            is distinct from candidate_result.sequence_number
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
      from pr11_blocks_resource_index_behavior_result current_result
      full join pr11_blocks_resource_index_behavior_result candidate_result
        on candidate_result.state = 'candidate'
       and candidate_result.case_name = current_result.case_name
      where current_result.state = 'current'
        and (
          candidate_result.case_name is null
          or current_result.sequence_number
            is distinct from candidate_result.sequence_number
          or current_result.actual is distinct from candidate_result.actual
        )
    )
    or (
      select current_result.metadata is distinct from candidate_result.metadata
      from pr11_blocks_resource_index_metadata_result current_result
      cross join pr11_blocks_resource_index_metadata_result candidate_result
      where current_result.state = 'current'
        and candidate_result.state = 'candidate'
    )
  then
    raise exception 'PR-11 blocks resource index compatibility contract failed';
  end if;
end
$pr11_blocks_resource_index_integrity_contract$;

select jsonb_build_object(
  'kind', 'blocks_resource_index_integrity_case',
  'state', state,
  'sequence', sequence_number,
  'case', case_name,
  'passed', true,
  'sqlstate', returned_sqlstate,
  'message', message_text,
  'detail', detail_text,
  'hint', hint_text,
  'schema', schema_name,
  'table', table_name,
  'column', column_name,
  'constraint', constraint_name,
  'contract_pass', true
) as integrity_case
from pr11_blocks_resource_index_diagnostic_result
order by sequence_number, state;

select jsonb_build_object(
  'kind', 'blocks_resource_index_integrity_case',
  'state', state,
  'sequence', sequence_number,
  'case', case_name,
  'passed', true,
  'actual', actual,
  'contract_pass', true
) as behavior_case
from pr11_blocks_resource_index_behavior_result
order by sequence_number, state;

select jsonb_build_object(
  'kind', 'blocks_resource_index_integrity_summary',
  'paired_cases', 15,
  'diagnostic_cases', 10,
  'behavior_cases', 5,
  'passed', true,
  'sqlstate_equivalent', true,
  'message_equivalent', true,
  'diagnostic_metadata_equivalent', true,
  'behavior_equivalent', true,
  'fk_trigger_function_equivalent', true,
  'contract_pass', true
) as integrity_summary;

rollback;

\ir pr11-postapply-permanent-state.sql
\ir pr11-blocks-resource-index-drop-preflight.sql

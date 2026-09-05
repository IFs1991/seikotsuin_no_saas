do $contract$
declare
  function_source text;
begin
  perform pg_catalog.set_config(
    'search_path',
    'pg_catalog, extensions, public',
    true
  );

  if to_regprocedure('public.validate_blocks_clinic_refs()') is null then
    raise exception
      'RED COMM-PERF-003: blocks validation function is missing';
  end if;

  select function_data.prosrc
  into function_source
  from pg_proc function_data
  join pg_roles owner_data on owner_data.oid = function_data.proowner
  join pg_language language_data on language_data.oid = function_data.prolang
  where function_data.oid =
      'public.validate_blocks_clinic_refs()'::regprocedure
    and function_data.prokind = 'f'
    and function_data.pronargs = 0
    and function_data.pronargdefaults = 0
    and function_data.prorettype = 'pg_catalog.trigger'::regtype
    and not function_data.proretset
    and language_data.lanname = 'plpgsql'
    and owner_data.rolname = 'postgres'
    and function_data.provolatile = 'v'
    and function_data.proparallel = 'u'
    and not function_data.proisstrict
    and not function_data.prosecdef
    and not function_data.proleakproof
    and function_data.proconfig =
      array['search_path=public, auth, extensions']::text[]
    and md5(pg_get_functiondef(function_data.oid)) =
      'fe160976fe22dac01208d155ebf16984'
    and md5(function_data.prosrc) =
      '0fd20c5c75ffdb79d77363c1026063dc'
    and md5(coalesce(array_to_string(function_data.proacl, ','), '<NULL>')) =
      '8f838c64ac450430e53b33669676310e';

  if function_source is null
    or position(
      'r.id = new.resource_id and r.clinic_id = new.clinic_id'
      in regexp_replace(lower(function_source), '[[:space:]]+', ' ', 'g')
    ) = 0
    or position(
      'if found then return new; end if;'
      in regexp_replace(lower(function_source), '[[:space:]]+', ' ', 'g')
    ) = 0
  then
    raise exception
      'RED COMM-PERF-003: exact-compatible blocks fast path is absent or metadata drifted';
  end if;

  if (
    select count(*)
    from pg_trigger trigger_data
    where trigger_data.tgrelid = 'public.blocks'::regclass
      and trigger_data.tgname = 'blocks_clinic_ref_check'
      and not trigger_data.tgisinternal
      and trigger_data.tgenabled = 'O'
      and trigger_data.tgfoid =
        'public.validate_blocks_clinic_refs()'::regprocedure
      and md5(pg_get_triggerdef(trigger_data.oid)) =
        '39c16618a7c772d6b9ecd1a541d0c2a5'
  ) <> 1 then
    raise exception
      'RED COMM-PERF-003: blocks trigger identity or binding drift';
  end if;

  if (
    select count(*)
    from pg_constraint constraint_data
    where constraint_data.conname = 'blocks_resource_id_fkey'
      and constraint_data.conrelid = 'public.blocks'::regclass
      and constraint_data.confrelid = 'public.resources'::regclass
      and constraint_data.contype = 'f'
      and constraint_data.convalidated
      and not constraint_data.condeferrable
      and constraint_data.confmatchtype = 's'
      and constraint_data.confupdtype = 'a'
      and constraint_data.confdeltype = 'c'
      and md5(pg_get_constraintdef(constraint_data.oid)) =
        'a3e490b595d9cf3153c16f482e053df3'
  ) <> 1
    or (
      select count(*)
      from pg_constraint constraint_data
      where constraint_data.conname = 'resources_id_clinic_unique'
        and constraint_data.conrelid = 'public.resources'::regclass
        and constraint_data.contype = 'u'
        and constraint_data.convalidated
        and md5(pg_get_constraintdef(constraint_data.oid)) =
          '6c2d9cf01a89532d7a688b7d4a43b242'
    ) <> 1
    or (
      select count(*)
      from pg_attribute attribute_data
      where attribute_data.attrelid = 'public.blocks'::regclass
        and attribute_data.attname in ('resource_id', 'clinic_id')
        and attribute_data.attnotnull
        and not attribute_data.attisdropped
    ) <> 2
  then
    raise exception
      'RED COMM-PERF-003: blocks composite FK or NOT NULL contract drift';
  end if;
end
$contract$;

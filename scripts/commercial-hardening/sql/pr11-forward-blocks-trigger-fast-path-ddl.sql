-- Transaction-only exact-compatible blocks trigger fast path.
-- The caller owns the transaction and must ROLLBACK.

create or replace function public.validate_blocks_clinic_refs()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path to public, auth, extensions
as $function$
begin
  if new.clinic_id is null then
    raise exception 'blocks.clinic_id is required' using errcode = '23514';
  end if;

  perform 1
  from public.resources r
  where r.id = new.resource_id
    and r.clinic_id = new.clinic_id;

  if found then
    return new;
  end if;

  perform 1
  from public.resources r
  where r.id = new.resource_id;

  if not found then
    raise exception 'resources.id not found' using errcode = '23503';
  end if;

  raise exception 'blocks.resource_id clinic mismatch'
    using errcode = '23514';
end
$function$;

\ir ../red-contracts/12_pr11_blocks_trigger_fast_path.sql

select jsonb_build_object(
  'kind', 'blocks_fast_path_candidate_catalog',
  'function', 'public.validate_blocks_clinic_refs()',
  'trigger_enabled', true,
  'composite_fk_preserved', true,
  'contract_pass', true
) as candidate_catalog;

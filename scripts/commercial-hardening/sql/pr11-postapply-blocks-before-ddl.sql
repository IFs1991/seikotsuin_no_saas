-- Recreate the exact pre-forward-fix trigger function inside an outer
-- transaction. The caller must execute a canonical probe that ends ROLLBACK.

create or replace function public.validate_blocks_clinic_refs()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path to public, auth, extensions
as $function$
DECLARE
    v_resource_clinic_id uuid;
BEGIN
    IF NEW.clinic_id IS NULL THEN
        RAISE EXCEPTION 'blocks.clinic_id is required' USING ERRCODE = '23514';
    END IF;

    SELECT clinic_id INTO v_resource_clinic_id
    FROM public.resources
    WHERE id = NEW.resource_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'resources.id not found' USING ERRCODE = '23503';
    END IF;

    IF v_resource_clinic_id IS NULL OR v_resource_clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'blocks.resource_id clinic mismatch' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

do $exact_before_contract$
begin
  if md5(pg_get_functiondef(
    'public.validate_blocks_clinic_refs()'::regprocedure
  )) <> 'c7b71380054958e03ada965a5db5adc4'
  then
    raise exception 'PR-11 post-apply blocks BEFORE definition drift';
  end if;
end
$exact_before_contract$;

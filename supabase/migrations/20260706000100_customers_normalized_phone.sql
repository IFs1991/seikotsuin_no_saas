begin;

create or replace function public.normalize_customer_phone(input text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when regexp_replace(btrim(coalesce(input, '')), '[\s-]', '', 'g') like '+81%'
        then nullif('0' || substring(regexp_replace(btrim(coalesce(input, '')), '[\s-]', '', 'g') from 4), '0')
      else regexp_replace(btrim(coalesce(input, '')), '[\s-]', '', 'g')
    end,
    ''
  );
$$;

alter table public.customers
  add column if not exists normalized_phone text
  generated always as (public.normalize_customer_phone(phone)) stored;

create index if not exists customers_clinic_normalized_phone_idx
  on public.customers (clinic_id, normalized_phone)
  where normalized_phone is not null and is_deleted = false;

commit;

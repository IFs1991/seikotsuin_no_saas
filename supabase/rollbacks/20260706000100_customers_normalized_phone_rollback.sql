begin;

drop index if exists public.customers_clinic_normalized_phone_idx;

alter table public.customers
  drop column if exists normalized_phone;

drop function if exists public.normalize_customer_phone(text);

commit;

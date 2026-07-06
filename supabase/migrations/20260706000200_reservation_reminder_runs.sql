begin;

create table if not exists public.internal_job_runs (
  job_name text primary key,
  last_successful_run_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.internal_job_runs enable row level security;

revoke all on table public.internal_job_runs from anon;
revoke all on table public.internal_job_runs from authenticated;
grant all on table public.internal_job_runs to service_role;

commit;

-- Rollback admin AI chat auth/RLS alignment
-- @spec docs/stabilization/spec-admin-ai-cross-tenant-v0.1.md
-- @migration supabase/migrations/20260422000200_admin_ai_chat_alignment.sql

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end $$;

drop index if exists public.idx_chat_sessions_clinic_updated_at_desc;
drop index if exists public.idx_chat_messages_session_created_at_desc;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_user_id_fkey;

update public.chat_sessions cs
set user_id = up.id
from public.user_permissions up
where cs.user_id = up.staff_id;

update public.chat_sessions cs
set user_id = null
where cs.user_id is not null
  and not exists (
    select 1
    from public.user_permissions up
    where up.id = cs.user_id
  );

alter table public.chat_sessions
  add constraint chat_sessions_user_id_fkey
  foreign key (user_id)
  references public.user_permissions(id)
  on delete cascade;

drop policy if exists "chat_messages_insert" on public.chat_messages;
drop policy if exists "chat_messages_select" on public.chat_messages;
drop policy if exists "chat_sessions_delete" on public.chat_sessions;
drop policy if exists "chat_sessions_insert" on public.chat_sessions;
drop policy if exists "chat_sessions_select" on public.chat_sessions;
drop policy if exists "chat_sessions_update" on public.chat_sessions;

create policy "chat_messages_insert"
on public.chat_messages
for insert
with check (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and cs.user_id = auth.uid()
  )
);

create policy "chat_messages_select"
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chat_sessions cs
    where cs.id = chat_messages.session_id
      and (
        cs.user_id = auth.uid()
        or (
          public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text])
          and (
            (
              cs.clinic_id is not null
              and public.can_access_clinic(cs.clinic_id)
            )
            or (
              cs.clinic_id is null
              and public.jwt_is_admin()
            )
          )
        )
      )
  )
);

create policy "chat_sessions_delete"
on public.chat_sessions
for delete
using (
  public.jwt_is_admin()
  and (
    (
      clinic_id is not null
      and public.can_access_clinic(clinic_id)
    )
    or clinic_id is null
  )
);

create policy "chat_sessions_insert"
on public.chat_sessions
for insert
with check (
  user_id = auth.uid()
  and (
    (
      clinic_id is not null
      and public.can_access_clinic(clinic_id)
    )
    or (
      clinic_id is null
      and public.jwt_is_admin()
    )
  )
);

create policy "chat_sessions_select"
on public.chat_sessions
for select
using (
  user_id = auth.uid()
  or (
    public.get_current_role() = any (array['admin'::text, 'clinic_admin'::text])
    and (
      (
        clinic_id is not null
        and public.can_access_clinic(clinic_id)
      )
      or (
        clinic_id is null
        and public.jwt_is_admin()
      )
    )
  )
);

create policy "chat_sessions_update"
on public.chat_sessions
for update
using (
  user_id = auth.uid()
  and (
    (
      clinic_id is not null
      and public.can_access_clinic(clinic_id)
    )
    or (
      clinic_id is null
      and public.jwt_is_admin()
    )
  )
);

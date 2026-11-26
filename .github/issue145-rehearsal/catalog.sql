select jsonb_build_object(
  'mail_revision',(select jsonb_build_object('definer',prosecdef,'config',proconfig,'body',trim(prosrc),'owner',pg_get_userbyid(proowner),'acl',proacl::text)
      from pg_proc where oid=to_regprocedure('public.update_email_outbox_updated_at()')),
  'handoff',(select jsonb_build_object('definer',prosecdef,'config',proconfig,'owner',pg_get_userbyid(proowner),'acl',proacl::text,
      'anon',has_function_privilege('anon',oid,'execute'),'authenticated',has_function_privilege('authenticated',oid,'execute'),
      'service',has_function_privilege('service_role',oid,'execute'),'definition_md5',md5(pg_get_functiondef(oid)))
      from pg_proc where oid=to_regprocedure('app_private.persist_reservation_notification_outbox()')),
  'target_trigger',(select jsonb_build_object('enabled',tgenabled,'definition',pg_get_triggerdef(oid)) from pg_trigger
      where tgrelid='public.reservation_notifications'::regclass and tgname='reservation_notification_durable_enqueue'),
  'lease_index',(select jsonb_build_object('valid',indisvalid,'ready',indisready,'definition',pg_get_indexdef(indexrelid),
      'predicate',pg_get_expr(indpred,indrelid))
      from pg_index where indexrelid=to_regclass('public.email_outbox_processing_lease_idx')),
  'old_triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid))
      order by tgrelid::regclass::text,tgname) from pg_trigger
      where tgrelid in ('public.reservation_notifications'::regclass,'public.email_outbox'::regclass)
      and not tgisinternal and tgname<>'reservation_notification_durable_enqueue'),
  'boundaries',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
      'policy_digest',(select md5(coalesce(string_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,p.polroles,
             pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text,'|' order by p.polname),'')) from pg_policy p where p.polrelid=c.oid))
      order by c.relname) from pg_class c where c.oid in ('public.reservation_notifications'::regclass,'public.email_outbox'::regclass,'public.line_message_outbox'::regclass))
);

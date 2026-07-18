-- Commercial hardening PR-11: performance-safe FK indexes.
-- @spec docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md
-- @rollback supabase/rollbacks/20260716160342_commercial_performance_safe_fk_indexes_rollback.sql
--
-- The active/service table scope is classification-frozen. Nullable MATCH
-- SIMPLE foreign keys receive partial indexes so rows exempt from FK checking
-- do not add index entries. Three reviewed existing paths are retained rather
-- than duplicated. No existing index is removed by this migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set local search_path = pg_catalog, public, auth, extensions;

create temporary table pr11_fk_index_target (
  ordinal integer primary key,
  child_table regclass not null,
  constraint_name name not null unique,
  index_name name not null unique,
  index_columns name[] not null,
  predicate_sql text,
  predicate_fingerprint text,
  check (
    (predicate_sql is null and predicate_fingerprint is null)
    or (predicate_sql is not null and predicate_fingerprint is not null)
  )
) on commit drop;

insert into pr11_fk_index_target values
  (1, 'public.blocks', 'blocks_created_by_fkey', 'blocks_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (2, 'public.blocks', 'blocks_deleted_by_fkey', 'blocks_deleted_by_idx', array['deleted_by']::name[], 'deleted_by is not null', 'deleted_byisnotnull'),
  (3, 'public.care_episodes', 'care_episodes_created_by_fkey', 'care_episodes_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (4, 'public.care_episodes', 'care_episodes_updated_by_fkey', 'care_episodes_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (5, 'public.clinic_line_credentials', 'clinic_line_credentials_updated_by_fkey', 'clinic_line_credentials_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (6, 'public.customer_insurance_coverages', 'customer_insurance_coverages_created_by_fkey', 'customer_insurance_coverages_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (7, 'public.customer_insurance_coverages', 'customer_insurance_coverages_updated_by_fkey', 'customer_insurance_coverages_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (8, 'public.customer_insurance_coverages', 'customer_insurance_coverages_verified_by_fkey', 'customer_insurance_coverages_verified_by_idx', array['verified_by']::name[], 'verified_by is not null', 'verified_byisnotnull'),
  (9, 'public.customers', 'customers_created_by_fkey', 'customers_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (10, 'public.customers', 'customers_deleted_by_fkey', 'customers_deleted_by_idx', array['deleted_by']::name[], 'deleted_by is not null', 'deleted_byisnotnull'),
  (11, 'public.daily_report_item_tags', 'daily_report_item_tags_created_by_fkey', 'daily_report_item_tags_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (12, 'public.daily_report_item_tags', 'daily_report_item_tags_tag_code_fkey', 'daily_report_item_tags_tag_code_idx', array['tag_code']::name[], null, null),
  (13, 'public.daily_report_item_tags', 'daily_report_item_tags_updated_by_fkey', 'daily_report_item_tags_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (14, 'public.daily_report_items', 'daily_report_items_created_by_fkey', 'daily_report_items_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (15, 'public.daily_report_items', 'daily_report_items_revenue_context_code_fkey', 'daily_report_items_revenue_context_code_idx', array['revenue_context_code']::name[], null, null),
  (16, 'public.daily_report_items', 'daily_report_items_updated_by_fkey', 'daily_report_items_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (17, 'public.daily_report_items', 'daily_report_items_visit_stage_code_fkey', 'daily_report_items_visit_stage_code_idx', array['visit_stage_code']::name[], 'visit_stage_code is not null', 'visit_stage_codeisnotnull'),
  (18, 'public.daily_reports', 'daily_reports_staff_id_fkey', 'daily_reports_staff_id_idx', array['staff_id']::name[], 'staff_id is not null', 'staff_idisnotnull'),
  (19, 'public.manager_clinic_assignments', 'manager_clinic_assignments_assigned_by_fkey', 'manager_clinic_assignments_assigned_by_idx', array['assigned_by']::name[], 'assigned_by is not null', 'assigned_byisnotnull'),
  (20, 'public.manager_clinic_assignments', 'manager_clinic_assignments_revoked_by_fkey', 'manager_clinic_assignments_revoked_by_idx', array['revoked_by']::name[], 'revoked_by is not null', 'revoked_byisnotnull'),
  (21, 'public.menu_billing_profiles', 'menu_billing_profiles_created_by_fkey', 'menu_billing_profiles_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (22, 'public.menu_billing_profiles', 'menu_billing_profiles_revenue_context_code_fkey', 'menu_billing_profiles_revenue_context_code_idx', array['revenue_context_code']::name[], null, null),
  (23, 'public.menu_billing_profiles', 'menu_billing_profiles_source_template_profile_id_fkey', 'menu_billing_profiles_source_template_profile_id_idx', array['source_template_profile_id']::name[], 'source_template_profile_id is not null', 'source_template_profile_idisnotnull'),
  (24, 'public.menu_billing_profiles', 'menu_billing_profiles_updated_by_fkey', 'menu_billing_profiles_updated_by_idx', array['updated_by']::name[], 'updated_by is not null', 'updated_byisnotnull'),
  (25, 'public.menus', 'menus_created_by_fkey', 'menus_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (26, 'public.menus', 'menus_deleted_by_fkey', 'menus_deleted_by_idx', array['deleted_by']::name[], 'deleted_by is not null', 'deleted_byisnotnull'),
  (27, 'public.patient_outreach_campaigns', 'patient_outreach_campaigns_created_by_fkey', 'patient_outreach_campaigns_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (28, 'public.patient_outreach_recipients', 'patient_outreach_recipients_booked_reservation_clinic_fkey', 'patient_outreach_recipients_booked_reservation_clinic_idx', array['booked_reservation_id', 'clinic_id']::name[], 'booked_reservation_id is not null and clinic_id is not null', 'booked_reservation_idisnotnullandclinic_idisnotnull'),
  (29, 'public.reservation_history', 'reservation_history_created_by_fkey', 'reservation_history_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (30, 'public.reservation_notifications', 'reservation_notifications_email_outbox_id_fkey', 'reservation_notifications_email_outbox_id_idx', array['email_outbox_id']::name[], 'email_outbox_id is not null', 'email_outbox_idisnotnull'),
  (31, 'public.reservations', 'reservations_created_by_fkey', 'reservations_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (32, 'public.reservations', 'reservations_deleted_by_fkey', 'reservations_deleted_by_idx', array['deleted_by']::name[], 'deleted_by is not null', 'deleted_byisnotnull'),
  (33, 'public.resources', 'resources_created_by_fkey', 'resources_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (34, 'public.resources', 'resources_deleted_by_fkey', 'resources_deleted_by_idx', array['deleted_by']::name[], 'deleted_by is not null', 'deleted_byisnotnull'),
  (35, 'public.shift_requests', 'shift_requests_reviewed_by_fkey', 'shift_requests_reviewed_by_idx', array['reviewed_by']::name[], 'reviewed_by is not null', 'reviewed_byisnotnull'),
  (36, 'public.shift_requests', 'shift_requests_staff_id_fkey', 'shift_requests_staff_id_idx', array['staff_id']::name[], null, null),
  (37, 'public.shift_requests', 'shift_requests_submitted_by_fkey', 'shift_requests_submitted_by_idx', array['submitted_by']::name[], null, null),
  (38, 'public.staff_shifts', 'staff_shifts_created_by_fkey', 'staff_shifts_created_by_idx', array['created_by']::name[], 'created_by is not null', 'created_byisnotnull'),
  (39, 'public.staff_shifts', 'staff_shifts_home_clinic_id_fkey', 'staff_shifts_home_clinic_id_idx', array['home_clinic_id']::name[], 'home_clinic_id is not null', 'home_clinic_idisnotnull'),
  (40, 'public.staff_shifts', 'staff_shifts_source_shift_request_id_fkey', 'staff_shifts_source_shift_request_id_idx', array['source_shift_request_id']::name[], 'source_shift_request_id is not null', 'source_shift_request_idisnotnull'),
  (41, 'public.staff_shifts', 'staff_shifts_staff_profile_id_fkey', 'staff_shifts_staff_profile_id_idx', array['staff_profile_id']::name[], 'staff_profile_id is not null', 'staff_profile_idisnotnull');

create temporary table pr11_fk_existing_path (
  constraint_name name primary key,
  child_table regclass not null,
  fk_columns name[] not null,
  parent_table regclass not null,
  parent_columns name[] not null,
  index_name name not null unique,
  index_columns name[] not null,
  predicate_fingerprint text,
  coverage_mode text not null check (
    coverage_mode in ('leading_parent_id', 'reversed_complete_key')
  )
) on commit drop;

insert into pr11_fk_existing_path values
  ('patient_outreach_recipients_campaign_clinic_fkey', 'public.patient_outreach_recipients', array['campaign_id', 'clinic_id']::name[], 'public.patient_outreach_campaigns', array['id', 'clinic_id']::name[], 'patient_outreach_recipients_campaign_idx', array['campaign_id', 'created_at']::name[], null, 'leading_parent_id'),
  ('patient_outreach_recipients_customer_clinic_fkey', 'public.patient_outreach_recipients', array['customer_id', 'clinic_id']::name[], 'public.customers', array['id', 'clinic_id']::name[], 'patient_outreach_recipients_customer_idx', array['clinic_id', 'customer_id', 'created_at']::name[], null, 'reversed_complete_key'),
  ('reservations_campaign_clinic_fkey', 'public.reservations', array['campaign_id', 'clinic_id']::name[], 'public.patient_outreach_campaigns', array['id', 'clinic_id']::name[], 'reservations_campaign_id_idx', array['campaign_id']::name[], 'campaign_idisnotnull', 'leading_parent_id');

-- The definition hash binds child/parent relations, ordered child/parent columns,
-- MATCH type, ON UPDATE/DELETE actions, and SET NULL column lists. This prevents
-- a same-name/same-child-column FK from silently changing the access-path proof.
create temporary table pr11_fk_constraint_contract (
  constraint_name name primary key,
  definition_hash text not null check (definition_hash ~ '^[0-9a-f]{32}$')
) on commit drop;

insert into pr11_fk_constraint_contract values
  ('blocks_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('blocks_deleted_by_fkey', 'cb6ab866576fd02b47fd17419d284236'),
  ('care_episodes_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('care_episodes_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('clinic_line_credentials_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('customer_insurance_coverages_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('customer_insurance_coverages_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('customer_insurance_coverages_verified_by_fkey', 'eef48c2bf40bcd6bba9f6c8239eafdf4'),
  ('customers_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('customers_deleted_by_fkey', 'cb6ab866576fd02b47fd17419d284236'),
  ('daily_report_item_tags_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('daily_report_item_tags_tag_code_fkey', 'c74915cbaa680e8f1b13f3c5c59fbad3'),
  ('daily_report_item_tags_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('daily_report_items_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('daily_report_items_revenue_context_code_fkey', '520f2f209c343a61513762a279ecbdac'),
  ('daily_report_items_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('daily_report_items_visit_stage_code_fkey', '84c3e6b9dfde3e6bfc8eaedb742b450e'),
  ('daily_reports_staff_id_fkey', '611f2f8aa51a07afef0d6d61d61b760c'),
  ('manager_clinic_assignments_assigned_by_fkey', '1aecd8088f2dddcf290f8675a70acdc7'),
  ('manager_clinic_assignments_revoked_by_fkey', 'a8bf0ea0baa5a36a4108c87ee15b7423'),
  ('menu_billing_profiles_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('menu_billing_profiles_revenue_context_code_fkey', '520f2f209c343a61513762a279ecbdac'),
  ('menu_billing_profiles_source_template_profile_id_fkey', 'e9736c03826c62f5a6dbdcbd5ebe946e'),
  ('menu_billing_profiles_updated_by_fkey', '771f455c8eb44b7c0b503febb5dbdc32'),
  ('menus_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('menus_deleted_by_fkey', 'cb6ab866576fd02b47fd17419d284236'),
  ('patient_outreach_campaigns_created_by_fkey', 'b57cc1d54572db98cdd1e8e61b5f9da9'),
  ('patient_outreach_recipients_booked_reservation_clinic_fkey', '53a4683e13bce7bd300487d4f82d7d6a'),
  ('patient_outreach_recipients_campaign_clinic_fkey', '87b6070720b45ab53489bd5e3d023d3a'),
  ('patient_outreach_recipients_customer_clinic_fkey', 'fc2f641a22d1c08ba2e2377226acea6d'),
  ('reservation_history_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('reservation_notifications_email_outbox_id_fkey', 'eabc508b25cded2f7483275ce66a9ebe'),
  ('reservations_campaign_clinic_fkey', 'b3ebe6d665c303d83cb885bb0af47f5a'),
  ('reservations_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('reservations_deleted_by_fkey', 'cb6ab866576fd02b47fd17419d284236'),
  ('resources_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('resources_deleted_by_fkey', 'cb6ab866576fd02b47fd17419d284236'),
  ('shift_requests_reviewed_by_fkey', '7e20ed90d769f4164974d84991969c4f'),
  ('shift_requests_staff_id_fkey', '089b8fce139249e6f25e12fb77d13847'),
  ('shift_requests_submitted_by_fkey', '956c9a3ac614bf1e86282b5087b8dcc7'),
  ('staff_shifts_created_by_fkey', 'f2ec412d6c280402cdf6c98b7739d275'),
  ('staff_shifts_home_clinic_id_fkey', 'fd34e25fda40b770d4b129d5fc2bda81'),
  ('staff_shifts_source_shift_request_id_fkey', 'a94cd785b228ee594b873091d60cc53f'),
  ('staff_shifts_staff_profile_id_fkey', 'da26320a5018d3fa556a4ab3c420caaa');

do $pr11_index_preflight$
declare
  drift text;
  oversized text;
begin
  if (select count(*) from pr11_fk_index_target) <> 41
    or (select count(*) from pr11_fk_index_target where predicate_sql is null) <> 5
    or (select count(*) from pr11_fk_index_target where predicate_sql is not null) <> 36
    or (select count(*) from pr11_fk_existing_path) <> 3
  then
    raise exception 'PR-11 index preflight failed: reviewed target cardinality drift';
  end if;

  if (select count(*) from pr11_fk_constraint_contract) <> 44
    or exists (
      with reviewed_names as (
        select constraint_name from pr11_fk_index_target
        union
        select constraint_name from pr11_fk_existing_path
      ), drift_rows as (
        (select constraint_name from pr11_fk_constraint_contract
         except select constraint_name from reviewed_names)
        union all
        (select constraint_name from reviewed_names
         except select constraint_name from pr11_fk_constraint_contract)
      )
      select 1 from drift_rows
    )
  then
    raise exception
      'PR-11 index preflight failed: exact FK identity registry drift';
  end if;

  with reviewed as (
    select constraint_name, child_table
    from pr11_fk_index_target
    union all
    select constraint_name, child_table
    from pr11_fk_existing_path
  )
  select string_agg(
    expected.constraint_name::text,
    ', ' order by expected.constraint_name::text
  )
  into drift
  from pr11_fk_constraint_contract expected
  left join reviewed
    on reviewed.constraint_name = expected.constraint_name
  left join pg_constraint actual
    on actual.conrelid = reviewed.child_table
   and actual.conname = expected.constraint_name
   and actual.contype = 'f'
  where reviewed.constraint_name is null
     or actual.oid is null
     or md5(pg_get_constraintdef(actual.oid, true))
        is distinct from expected.definition_hash;

  if drift is not null then
    raise exception
      'PR-11 index preflight failed: exact FK definition drift: %',
      drift;
  end if;

  with actual as (
    select
      constraint_data.conname,
      constraint_data.conrelid as child_table,
      constraint_data.convalidated,
      constraint_data.confmatchtype,
      array_agg(attribute_data.attname::name order by keys.ordinality)
        as index_columns,
      bool_or(not attribute_data.attnotnull) as has_nullable_column
    from pg_constraint constraint_data
    join unnest(constraint_data.conkey)
      with ordinality keys(attnum, ordinality) on true
    join pg_attribute attribute_data
      on attribute_data.attrelid = constraint_data.conrelid
     and attribute_data.attnum = keys.attnum
    where constraint_data.contype = 'f'
      and constraint_data.conname in (
        select constraint_name from pr11_fk_index_target
      )
    group by
      constraint_data.conname,
      constraint_data.conrelid,
      constraint_data.convalidated,
      constraint_data.confmatchtype
  ), drift_rows as (
    select target.constraint_name::text
    from pr11_fk_index_target target
    left join actual
      on actual.conname = target.constraint_name
     and actual.child_table = target.child_table
    where actual.conname is null
       or not actual.convalidated
       or actual.confmatchtype <> 's'
       or actual.index_columns <> target.index_columns
       or (
         target.predicate_sql is null
         and actual.has_nullable_column is distinct from false
       )
       or (
         target.predicate_sql is not null
         and actual.has_nullable_column is distinct from true
       )
  )
  select string_agg(constraint_name, ', ' order by constraint_name)
  into drift
  from drift_rows;

  if drift is not null then
    raise exception
      'PR-11 index preflight failed: FK definition/nullability drift: %',
      drift;
  end if;

  select string_agg(index_name::text, ', ' order by index_name::text)
  into drift
  from pr11_fk_index_target
  where to_regclass(format('public.%I', index_name)) is not null;

  if drift is not null then
    raise exception
      'PR-11 index preflight failed: target index name conflict: %',
      drift;
  end if;

  with covered as (
    select distinct target.constraint_name::text
    from pr11_fk_index_target target
    join pg_constraint constraint_data
      on constraint_data.conrelid = target.child_table
     and constraint_data.conname = target.constraint_name
    join pg_index index_data
      on index_data.indrelid = target.child_table
     and index_data.indisvalid
     and index_data.indisready
     and index_data.indislive
     and index_data.indexprs is null
     and index_data.indnkeyatts >= cardinality(constraint_data.conkey)
    where (
      select array_agg(keys.attnum order by keys.ordinality)
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      where keys.ordinality <= cardinality(constraint_data.conkey)
    ) = constraint_data.conkey
  )
  select string_agg(constraint_name, ', ' order by constraint_name)
  into drift
  from covered;

  if drift is not null then
    raise exception
      'PR-11 index preflight failed: target FK already has a reviewed-order index under another name: %',
      drift;
  end if;

  select string_agg(
    relation_data.oid::regclass::text
      || '=' || pg_size_pretty(pg_total_relation_size(relation_data.oid)),
    ', ' order by relation_data.oid::regclass::text
  )
  into oversized
  from pg_class relation_data
  where relation_data.oid in (
    select child_table from pr11_fk_index_target
  )
    and pg_total_relation_size(relation_data.oid) > 64 * 1024 * 1024;

  if oversized is not null then
    raise exception
      'PR-11 index preflight failed: regular index build limit exceeded (%); use a separately reviewed concurrent rollout',
      oversized;
  end if;

  select string_agg(pid::text, ', ' order by pid)
  into drift
  from pg_stat_activity
  where pid <> pg_backend_pid()
    and backend_type = 'client backend'
    and xact_start < clock_timestamp() - interval '5 minutes'
    and state <> 'idle';

  if drift is not null then
    raise exception
      'PR-11 index preflight failed: long-running transactions are active (pids=%)',
      drift;
  end if;
end
$pr11_index_preflight$;

create temporary table pr11_index_relation_snapshot on commit drop as
select
  relation_data.oid,
  relation_data.relrowsecurity,
  relation_data.relforcerowsecurity,
  relation_data.relacl
from pg_class relation_data
where relation_data.oid in (
  select child_table from pr11_fk_index_target
  union
  select child_table from pr11_fk_existing_path
);

create temporary table pr11_index_policy_snapshot on commit drop as
select
  policy_data.polrelid,
  policy_data.polname,
  md5(pg_get_expr(policy_data.polqual, policy_data.polrelid)) as qual_hash,
  md5(pg_get_expr(policy_data.polwithcheck, policy_data.polrelid))
    as with_check_hash,
  policy_data.polcmd,
  policy_data.polpermissive,
  policy_data.polroles
from pg_policy policy_data
where policy_data.polrelid in (
  select child_table from pr11_fk_index_target
  union
  select child_table from pr11_fk_existing_path
);

create temporary table pr11_index_constraint_snapshot on commit drop as
select
  constraint_data.conrelid,
  constraint_data.conname,
  constraint_data.convalidated,
  md5(pg_get_constraintdef(constraint_data.oid, true)) as definition_hash
from pg_constraint constraint_data
where constraint_data.conrelid in (
  select child_table from pr11_fk_index_target
  union
  select child_table from pr11_fk_existing_path
);

do $pr11_create_indexes$
declare
  target record;
  column_sql text;
begin
  for target in
    select * from pr11_fk_index_target order by ordinal
  loop
    select string_agg(format('%I', column_name), ', ' order by ordinality)
    into column_sql
    from unnest(target.index_columns)
      with ordinality columns(column_name, ordinality);

    execute format(
      'create index %I on %s using btree (%s)%s',
      target.index_name,
      target.child_table,
      column_sql,
      case
        when target.predicate_sql is null then ''
        else format(' where %s', target.predicate_sql)
      end
    );

    execute format(
      'comment on index public.%I is %L',
      target.index_name,
      format(
        'PR-11: supports %s with reviewed %s B-tree coverage.',
        target.constraint_name,
        case when target.predicate_sql is null then 'full' else 'partial' end
      )
    );
  end loop;
end
$pr11_create_indexes$;

do $pr11_index_postflight$
declare
  drift text;
begin
  with actual as (
    select
      index_class.relname::name as index_name,
      index_data.indrelid as child_table,
      array_agg(attribute_data.attname::name order by keys.ordinality)
        filter (where keys.ordinality <= index_data.indnkeyatts)
        as index_columns,
      case
        when index_data.indpred is null then null
        else regexp_replace(
          lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
          '[()[:space:]\"]',
          '',
          'g'
        )
      end as predicate_fingerprint,
      access_method.amname,
      index_data.indisunique,
      index_data.indisvalid,
      index_data.indisready,
      index_data.indislive,
      index_data.indexprs is null as has_no_expressions,
      obj_description(index_data.indexrelid, 'pg_class') as intent_comment
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_am access_method on access_method.oid = index_class.relam
    join unnest(index_data.indkey::smallint[])
      with ordinality keys(attnum, ordinality) on true
    join pg_attribute attribute_data
      on attribute_data.attrelid = index_data.indrelid
     and attribute_data.attnum = keys.attnum
    where index_class.relname in (
      select index_name from pr11_fk_index_target
    )
    group by
      index_class.relname,
      index_data.indrelid,
      index_data.indnkeyatts,
      index_data.indpred,
      access_method.amname,
      index_data.indisunique,
      index_data.indisvalid,
      index_data.indisready,
      index_data.indislive,
      index_data.indexprs,
      index_data.indexrelid
  ), drift_rows as (
    select target.index_name::text
    from pr11_fk_index_target target
    left join actual
      on actual.index_name = target.index_name
     and actual.child_table = target.child_table
    where actual.index_name is null
       or actual.index_columns <> target.index_columns
       or actual.predicate_fingerprint
          is distinct from target.predicate_fingerprint
       or actual.amname <> 'btree'
       or actual.indisunique
       or not actual.indisvalid
       or not actual.indisready
       or not actual.indislive
       or not actual.has_no_expressions
       or actual.intent_comment is distinct from format(
         'PR-11: supports %s with reviewed %s B-tree coverage.',
         target.constraint_name,
         case when target.predicate_sql is null then 'full' else 'partial' end
       )
  )
  select string_agg(index_name, ', ' order by index_name)
  into drift
  from drift_rows;

  if drift is not null then
    raise exception
      'PR-11 index postflight failed: created index contract drift: %',
      drift;
  end if;

  if exists (
    with current_state as (
      select
        relation_data.oid,
        relation_data.relrowsecurity,
        relation_data.relforcerowsecurity,
        relation_data.relacl
      from pg_class relation_data
      join pr11_index_relation_snapshot snapshot
        on snapshot.oid = relation_data.oid
    ), drift_rows as (
      (select * from pr11_index_relation_snapshot except select * from current_state)
      union all
      (select * from current_state except select * from pr11_index_relation_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception
      'PR-11 index postflight failed: target RLS flag or relation ACL drift';
  end if;

  if exists (
    with current_state as (
      select
        policy_data.polrelid,
        policy_data.polname,
        md5(pg_get_expr(policy_data.polqual, policy_data.polrelid))
          as qual_hash,
        md5(pg_get_expr(policy_data.polwithcheck, policy_data.polrelid))
          as with_check_hash,
        policy_data.polcmd,
        policy_data.polpermissive,
        policy_data.polroles
      from pg_policy policy_data
      where policy_data.polrelid in (
        select child_table from pr11_fk_index_target
        union
        select child_table from pr11_fk_existing_path
      )
    ), drift_rows as (
      (select * from pr11_index_policy_snapshot except select * from current_state)
      union all
      (select * from current_state except select * from pr11_index_policy_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception 'PR-11 index postflight failed: policy drift';
  end if;

  if exists (
    with current_state as (
      select
        constraint_data.conrelid,
        constraint_data.conname,
        constraint_data.convalidated,
        md5(pg_get_constraintdef(constraint_data.oid, true))
          as definition_hash
      from pg_constraint constraint_data
      where constraint_data.conrelid in (
        select child_table from pr11_fk_index_target
        union
        select child_table from pr11_fk_existing_path
      )
    ), drift_rows as (
      (select * from pr11_index_constraint_snapshot except select * from current_state)
      union all
      (select * from current_state except select * from pr11_index_constraint_snapshot)
    )
    select 1 from drift_rows
  ) then
    raise exception 'PR-11 index postflight failed: constraint drift';
  end if;
end
$pr11_index_postflight$;

do $pr11_existing_path_guard$
declare
  drift text;
begin
  with actual as (
    select
      expected.constraint_name as expected_constraint_name,
      constraint_data.conname as actual_constraint_name,
      constraint_data.conrelid as child_table,
      constraint_data.convalidated,
      constraint_data.confmatchtype,
      constraint_data.confrelid,
      fk_columns.columns as fk_columns,
      parent_columns.columns as parent_columns,
      index_class.relname::name as actual_index_name,
      index_columns.columns as index_columns,
      case
        when index_data.indpred is null then null
        else regexp_replace(
          lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
          '[()[:space:]\"]',
          '',
          'g'
        )
      end as predicate_fingerprint,
      access_method.amname,
      index_data.indisvalid,
      index_data.indisready,
      index_data.indislive,
      index_data.indexprs is null as has_no_expressions,
      exists (
        select 1
        from pg_index parent_index
        join pg_attribute parent_attribute
          on parent_attribute.attrelid = constraint_data.confrelid
         and parent_attribute.attnum = parent_index.indkey[0]
        where parent_index.indrelid = constraint_data.confrelid
          and parent_index.indisunique
          and parent_index.indisvalid
          and parent_index.indisready
          and parent_index.indpred is null
          and parent_index.indexprs is null
          and parent_index.indnkeyatts = 1
          and parent_attribute.attname = 'id'
      ) as parent_id_is_globally_unique
    from pr11_fk_existing_path expected
    left join pg_constraint constraint_data
      on constraint_data.conrelid = expected.child_table
     and constraint_data.conname = expected.constraint_name
     and constraint_data.contype = 'f'
    left join pg_class index_class
      on index_class.oid = to_regclass(format('public.%I', expected.index_name))
    left join pg_index index_data
      on index_data.indexrelid = index_class.oid
     and index_data.indrelid = expected.child_table
    left join pg_am access_method on access_method.oid = index_class.relam
    left join lateral (
      select array_agg(attribute_data.attname::name order by keys.ordinality)
        as columns
      from unnest(constraint_data.conkey)
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = constraint_data.conrelid
       and attribute_data.attnum = keys.attnum
    ) fk_columns on true
    left join lateral (
      select array_agg(attribute_data.attname::name order by keys.ordinality)
        as columns
      from unnest(constraint_data.confkey)
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = constraint_data.confrelid
       and attribute_data.attnum = keys.attnum
    ) parent_columns on true
    left join lateral (
      select array_agg(attribute_data.attname::name order by keys.ordinality)
        filter (where keys.ordinality <= index_data.indnkeyatts) as columns
      from unnest(index_data.indkey::smallint[])
        with ordinality keys(attnum, ordinality)
      join pg_attribute attribute_data
        on attribute_data.attrelid = index_data.indrelid
       and attribute_data.attnum = keys.attnum
    ) index_columns on true
  ), drift_rows as (
    select expected.constraint_name::text
    from pr11_fk_existing_path expected
    left join actual
      on actual.expected_constraint_name = expected.constraint_name
    where actual.actual_constraint_name is null
       or actual.child_table is distinct from expected.child_table
       or actual.convalidated is distinct from true
       or actual.confmatchtype is distinct from 's'
       or actual.fk_columns is distinct from expected.fk_columns
       or actual.confrelid is distinct from expected.parent_table
       or actual.parent_columns is distinct from expected.parent_columns
       or actual.actual_index_name is distinct from expected.index_name
       or actual.index_columns is distinct from expected.index_columns
       or actual.predicate_fingerprint
          is distinct from expected.predicate_fingerprint
       or actual.amname is distinct from 'btree'
       or actual.indisvalid is distinct from true
       or actual.indisready is distinct from true
       or actual.indislive is distinct from true
       or actual.has_no_expressions is distinct from true
       or (
         expected.coverage_mode = 'leading_parent_id'
         and (
            actual.index_columns[1] is distinct from actual.fk_columns[1]
            or actual.parent_columns[1] is distinct from 'id'::name
            or actual.parent_id_is_globally_unique is distinct from true
          )
       )
       or (
         expected.coverage_mode = 'reversed_complete_key'
         and not (
           actual.index_columns[1:2] @> actual.fk_columns
           and actual.index_columns[1:2] <@ actual.fk_columns
         )
       )
  )
  select string_agg(constraint_name, ', ' order by constraint_name)
  into drift
  from drift_rows;

  if drift is not null then
    raise exception
      'PR-11 index postflight failed: reviewed existing FK path drift: %',
      drift;
  end if;
end
$pr11_existing_path_guard$;

commit;

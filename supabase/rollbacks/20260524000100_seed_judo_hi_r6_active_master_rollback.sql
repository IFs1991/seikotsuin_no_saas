-- Rollback Judo health insurance R6 active master seed.
-- This preserves revenue estimate rows but clears Phase 3B provenance that
-- points at the seeded master before deleting the seed.

update public.revenue_estimate_lines
set insurance_fee_item_id = null,
    schedule_code = null,
    fee_item_code = null,
    source_snapshot_hash = null
where schedule_code = 'JUDO_HI_R6_202410_ACTIVE'
   or source_snapshot_hash = 'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3'
   or insurance_fee_item_id in (
     select id
     from public.insurance_fee_items
     where schedule_code = 'JUDO_HI_R6_202410_ACTIVE'
   );

update public.revenue_estimates
set used_schedule_code = null,
    source_snapshot_hash = null
where used_schedule_code = 'JUDO_HI_R6_202410_ACTIVE'
   or source_snapshot_hash = 'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3';

alter table public.insurance_fee_items
disable trigger insurance_fee_items_mutation_guard;

delete from public.insurance_fee_items
where schedule_code = 'JUDO_HI_R6_202410_ACTIVE';

alter table public.insurance_fee_items
enable trigger insurance_fee_items_mutation_guard;

delete from public.insurance_fee_schedules
where schedule_code = 'JUDO_HI_R6_202410_ACTIVE';

delete from public.insurance_fee_source_snapshots
where source_id = 'MHLW_JUDO_HI_R6_FINAL_20240529'
  and content_hash = 'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3';

delete from public.insurance_fee_sources
where source_id = 'MHLW_JUDO_HI_R6_FINAL_20240529';

delete from public.insurance_fee_warning_definitions
where warning_code in (
  'JUDO_HI_CONDITION_REVIEW_REQUIRED',
  'JUDO_HI_BODY_PART_RULE_REVIEW',
  'JUDO_HI_INJURY_DATE_REVIEW',
  'JUDO_HI_LONG_TERM_REVIEW',
  'JUDO_HI_MONTHLY_LIMIT_REVIEW',
  'JUDO_HI_HOME_VISIT_REVIEW',
  'JUDO_HI_PHYSICIAN_CONSENT_REVIEW'
);

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260524000100_seed_judo_hi_r6_active_master.sql'
  ),
  'utf8'
);

const rollbackSql = readFileSync(
  join(
    process.cwd(),
    'supabase/rollbacks/20260524000100_seed_judo_hi_r6_active_master_rollback.sql'
  ),
  'utf8'
);

const planMd = readFileSync(
  join(
    process.cwd(),
    'docs/stabilization/plan-insurance-fee-master-phase3c-judo-hi-r6-active-seed-v0.1.md'
  ),
  'utf8'
);

describe('insurance fee master Phase 3C Judo HI R6 active seed migration', () => {
  test('records the official R6 source and immutable snapshot evidence', () => {
    expect(migrationSql).toContain('MHLW_JUDO_HI_R6_FINAL_20240529');
    expect(migrationSql).toContain('柔道整復師の施術料金の算定方法');
    expect(migrationSql).toContain(
      'https://kouseikyoku.mhlw.go.jp/kyushu/shinsei/shido_kansa/judo/000339906.pdf'
    );
    expect(migrationSql).toContain('official');
    expect(migrationSql).toContain('judo_health_insurance');
    expect(migrationSql).toContain(
      'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3'
    );
    expect(migrationSql).toContain('application/pdf');
    expect(migrationSql).toContain('165498');
    expect(migrationSql).toContain('is distinct from');
    expect(planMd).toContain('令和6年5月29日 保発0529第4号');
  });

  test('creates one active R6 schedule, seeds items while unlocked, then locks it', () => {
    const scheduleInsertOffset = migrationSql.indexOf(
      'insert into public.insurance_fee_schedules'
    );
    const itemInsertOffset = migrationSql.indexOf(
      'insert into public.insurance_fee_items'
    );
    const scheduleLockOffset = migrationSql.indexOf(
      'update public.insurance_fee_schedules'
    );

    expect(migrationSql).toContain('JUDO_HI_R6_202410_ACTIVE');
    expect(migrationSql).toContain("'2024-10-01'");
    expect(migrationSql).toContain("'active'");
    expect(migrationSql).toContain(
      "'現在以降の経営分析用概算に使う統合版。請求確定額ではない。'"
    );
    expect(migrationSql).toContain(
      "on schedule.schedule_code = 'JUDO_HI_R6_202410_ACTIVE'"
    );
    expect(migrationSql).toContain('and schedule.is_locked = false');
    expect(migrationSql).toContain('set is_locked = true');
    expect(scheduleInsertOffset).toBeGreaterThanOrEqual(0);
    expect(itemInsertOffset).toBeGreaterThan(scheduleInsertOffset);
    expect(scheduleLockOffset).toBeGreaterThan(itemInsertOffset);
  });

  test('seeds current official amounts without activating future draft rates', () => {
    expect(migrationSql).toMatch(/'JUDO_HI_INITIAL_EXAM'[\s\S]*?1550/);
    expect(migrationSql).toMatch(/'JUDO_HI_RE_EXAM'[\s\S]*?410/);
    expect(migrationSql).toMatch(/'JUDO_HI_HOME_VISIT'[\s\S]*?2300/);
    expect(migrationSql).toMatch(
      /'JUDO_HI_FRACTURE_REDUCTION_MAJOR_LONG_BONE'[\s\S]*?11800/
    );
    expect(migrationSql).toMatch(/'JUDO_HI_FIRST_CONTUSION'[\s\S]*?760/);
    expect(migrationSql).toMatch(/'JUDO_HI_POST_CONTUSION'[\s\S]*?505/);
    expect(migrationSql).toMatch(/'JUDO_HI_WARM_COMPRESS'[\s\S]*?75/);
    expect(migrationSql).toMatch(/'JUDO_HI_COLD_COMPRESS'[\s\S]*?85/);
    expect(migrationSql).toMatch(/'JUDO_HI_ELECTROTHERAPY'[\s\S]*?33/);
    expect(migrationSql).toMatch(
      /'JUDO_HI_STATEMENT_SYSTEM_ADDON'[\s\S]*?10/
    );
    expect(migrationSql).not.toContain('JUDO_HI_R8_202607');
    expect(migrationSql).not.toContain("'2026-07-01'");
    expect(migrationSql).not.toContain("'2026-06-01'");
    expect(migrationSql).not.toContain('1600');
  });

  test('keeps complex Judo health insurance items as reference or review shaped', () => {
    expect(migrationSql).toMatch(
      /'JUDO_HI_INITIAL_EXAM'[\s\S]*?\{"visit_stage_code":true\}'::jsonb,[\s\S]*?'\[\]'::jsonb,[\s\S]*?true/
    );
    expect(migrationSql).toMatch(
      /'JUDO_HI_RE_EXAM'[\s\S]*?JUDO_HI_CONDITION_REVIEW_REQUIRED[\s\S]*?false/
    );
    expect(migrationSql).toMatch(
      /'JUDO_HI_POST_CONTUSION'[\s\S]*?JUDO_HI_LONG_TERM_REVIEW[\s\S]*?false/
    );
    expect(migrationSql).toMatch(
      /'JUDO_HI_HOME_VISIT_SPECIAL_ADDON'[\s\S]*?null,[\s\S]*?'percent'/
    );
    expect(migrationSql).not.toContain("'traffic_accident'");
  });

  test('rollback removes only the Phase 3C seed and preserves estimate rows', () => {
    expect(rollbackSql).toContain('update public.revenue_estimate_lines');
    expect(rollbackSql).toContain('update public.revenue_estimates');
    expect(rollbackSql).toContain('set insurance_fee_item_id = null');
    expect(rollbackSql).toContain('or insurance_fee_item_id in');
    expect(rollbackSql).toContain('set used_schedule_code = null');
    expect(rollbackSql).toContain(
      'disable trigger insurance_fee_items_mutation_guard'
    );
    expect(rollbackSql).toContain(
      'enable trigger insurance_fee_items_mutation_guard'
    );
    expect(rollbackSql).toMatch(
      /delete from public\.insurance_fee_items\s+where schedule_code = 'JUDO_HI_R6_202410_ACTIVE'/
    );
    expect(rollbackSql).not.toContain('drop table');
    expect(rollbackSql).not.toContain('delete from public.revenue_estimates');
  });
});

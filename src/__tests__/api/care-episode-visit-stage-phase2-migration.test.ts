import fs from 'fs';
import path from 'path';

describe('Care episode visit stage Phase 2 migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260514000200_care_episode_visit_stage_phase2.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260514000200_care_episode_visit_stage_phase2_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-care-episode-visit-stage-phase2-v0.5.md'
  );

  test('migration, rollback, and stabilization spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration creates care episode and visit stage storage', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('create table if not exists public.care_episodes');
    expect(sql).toContain(
      'create table if not exists public.visit_stage_definitions'
    );
    expect(sql).toContain('add column if not exists care_episode_id uuid');
    expect(sql).toContain(
      'add column if not exists visit_ordinal_in_episode integer'
    );
    expect(sql).toContain('add column if not exists visit_stage_code text');
    expect(sql).toContain('daily_report_items_care_episode_id_fkey');
    expect(sql).toContain('daily_report_items_visit_stage_code_fkey');
    expect(sql).toContain('daily_report_items_visit_ordinal_check');
  });

  test('migration seeds canonical visit stages', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain("'first_visit'");
    expect(sql).toContain("'second_visit'");
    expect(sql).toContain("'third_visit'");
    expect(sql).toContain("'fifth_visit'");
    expect(sql).toContain("'repeat'");
  });

  test('migration validates clinic and customer consistency with app_private RLS', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('validate_daily_report_items_analysis_refs');
    expect(sql).toContain(
      'daily_report_items.care_episode_id clinic mismatch'
    );
    expect(sql).toContain(
      'daily_report_items.care_episode_id customer mismatch'
    );
    expect(sql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(sql).not.toContain('public.can_access_clinic(clinic_id)');
  });

  test('rollback removes Phase 2 objects in dependency order', () => {
    const rollback = fs.readFileSync(rollbackPath, 'utf-8');

    expect(rollback).toContain('drop trigger if exists daily_report_items_analysis_ref_check');
    expect(rollback).toContain(
      'drop function if exists public.validate_daily_report_items_analysis_refs()'
    );
    expect(rollback).toContain('drop table if exists public.care_episodes');
    expect(rollback).toContain(
      'drop table if exists public.visit_stage_definitions'
    );
  });
});

import fs from 'fs';
import path from 'path';

describe('customers normalized phone migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260706000100_customers_normalized_phone.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260706000100_customers_normalized_phone_rollback.sql'
    ),
    'utf8'
  );

  it('creates normalize_customer_phone before the generated column', () => {
    const functionIndex = migrationSql.indexOf(
      'create or replace function public.normalize_customer_phone'
    );
    const columnIndex = migrationSql.indexOf(
      'add column if not exists normalized_phone text'
    );

    expect(functionIndex).toBeGreaterThanOrEqual(0);
    expect(columnIndex).toBeGreaterThan(functionIndex);
    expect(migrationSql).toContain('language sql');
    expect(migrationSql).toContain('immutable');
  });

  it('adds normalized_phone as a stored generated column and search index', () => {
    expect(migrationSql).toContain(
      'generated always as (public.normalize_customer_phone(phone)) stored'
    );
    expect(migrationSql).toContain(
      'create index if not exists customers_clinic_normalized_phone_idx'
    );
    expect(migrationSql).toContain(
      'on public.customers (clinic_id, normalized_phone)'
    );
    expect(migrationSql).toContain(
      'where normalized_phone is not null and is_deleted = false'
    );
  });

  it('keeps +81-only input aligned with the TypeScript normalizer', () => {
    expect(migrationSql).toContain(
      "then nullif('0' || substring(regexp_replace(btrim(coalesce(input, '')), '[\\s-]', '', 'g') from 4), '0')"
    );
  });

  it('rolls back index, generated column, then function in dependency order', () => {
    const indexIndex = rollbackSql.indexOf(
      'drop index if exists public.customers_clinic_normalized_phone_idx'
    );
    const columnIndex = rollbackSql.indexOf(
      'drop column if exists normalized_phone'
    );
    const functionIndex = rollbackSql.indexOf(
      'drop function if exists public.normalize_customer_phone(text)'
    );

    expect(indexIndex).toBeGreaterThanOrEqual(0);
    expect(columnIndex).toBeGreaterThan(indexIndex);
    expect(functionIndex).toBeGreaterThan(columnIndex);
  });
});

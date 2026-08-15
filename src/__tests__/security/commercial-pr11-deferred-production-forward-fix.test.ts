/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260815104957_pr11_deferred_production_forward_fix.sql'
);
const rollbackPath = path.join(
  repoRoot,
  'supabase/rollbacks/20260815104957_pr11_deferred_production_forward_fix_rollback.sql'
);
const specPath = path.join(
  repoRoot,
  'docs/stabilization/spec-pr11-deferred-production-forward-fix-v1.0.md'
);
const verifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-pr11-deferred-production-path.mjs'
);
const packagePath = path.join(repoRoot, 'package.json');
const workflowPath = path.join(repoRoot, '.github/workflows/ci.yml');

describe('PR-11 deferred production forward-fix contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const rollback = fs.readFileSync(rollbackPath, 'utf8');
  const spec = fs.readFileSync(specPath, 'utf8');
  const verifier = fs.readFileSync(verifierPath, 'utf8');
  const packageJson = fs.readFileSync(packagePath, 'utf8');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  it('ships the migration, specification, and validation-only rollback together', () => {
    expect(migration).toContain(
      '-- @spec docs/stabilization/spec-pr11-deferred-production-forward-fix-v1.0.md'
    );
    expect(migration).toContain(
      '-- @rollback supabase/rollbacks/20260815104957_pr11_deferred_production_forward_fix_rollback.sql'
    );
    expect(spec).toContain('supabase migration repair');
    expect(rollback).toContain('Validation-only rollback guard');
    expect(rollback).not.toMatch(
      /\bdrop\s+(index|function|policy|table|constraint)\b/i
    );
  });

  it('accepts only the exact approved history and rejects partial state', () => {
    const approvedVersions = fs
      .readdirSync(path.join(repoRoot, 'supabase/migrations'))
      .map(fileName => fileName.match(/^(\d+)_/)?.[1])
      .filter(
        (version): version is string =>
          version !== undefined && version <= '20260814010908'
      )
      .sort();
    expect(approvedVersions).toHaveLength(66);
    for (const version of approvedVersions) {
      expect(migration).toContain(`('${version}')`);
    }
    expect(migration).toContain('with approved_history(version) as');
    expect(migration).toContain('select version from actual_history');
    expect(migration).not.toContain(
      "where migration_data.version <= '20260814010908'"
    );
    expect(migration).toContain('exact approved migration history is required');
    expect(migration).toContain('artifact_count not in (0, 3)');
    expect(migration).toContain('partial forward-fix state');
  });

  it('is bounded, idempotent, and reasserts the exact security contract', () => {
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '120s'");
    expect(migration).toContain('64 * 1024 * 1024');
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain(
      'create or replace function public.validate_blocks_clinic_refs()'
    );
    expect(migration).toContain('security invoker');
    expect(migration).toContain(
      'create or replace function app_private.get_current_accessible_clinic_ids()'
    );
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = pg_catalog');
    expect(migration).toContain(
      'from public, anon, authenticated, service_role'
    );
    expect(migration).toContain('to authenticated');
    expect(migration.match(/create index if not exists/g)).toHaveLength(2);
    expect(migration).toContain('633cd3f3b42e72d9ffdc0127f68b1a89');
    expect(migration).toContain('bae22e5fdf92404e1202dd2f891a359a');
    expect(migration).toContain('blocks_clinic_ref_check');
    expect(migration).toContain('source authority helper drift');
    expect(migration).toContain('target relation ACL or RLS drift');
    expect(migration).toContain(
      "attribute_data.attname in ('resource_id', 'clinic_id')"
    );
    expect(migration).toContain('attribute_data.attnotnull');
    expect(migration).toContain('blocks FK, NOT NULL, or data drift');
    expect(migration).toContain('equivalent clinic_id/id index already exists');
    expect(migration).toContain('index_class.relname not in (');
    expect(rollback).toContain('blocks_clinic_ref_check');
    expect(rollback).toContain("namespace_data.nspname = 'public'");
    expect(rollback).toContain("access_method.amname = 'btree'");
    expect(rollback).toContain("array['clinic_id', 'id']::text[]");
    expect(rollback).toContain('source authority helper drift');
    expect(rollback).toContain('target relation ACL or RLS drift');
  });

  it('does not mutate application data or remove catalog objects', () => {
    expect(migration).not.toMatch(
      /\b(update|delete\s+from|insert\s+into)\s+public\./i
    );
    expect(migration).not.toMatch(
      /\bdrop\s+(index|function|policy|table|constraint)\b/i
    );
  });

  it('reproduces the production history-only recovery in an explicitly approved local reset', () => {
    expect(verifier).toContain("const BASELINE_VERSION = '20260716160402'");
    expect(verifier).toContain("const REPAIRED_VERSION = '20260718011731'");
    expect(verifier).toContain("const RECOVERY_VERSION = '20260815104957'");
    expect(verifier).toContain("new Set(['127.0.0.1', 'localhost', '[::1]'])");
    expect(verifier).toContain(
      "const LOCAL_RESET_APPROVAL = 'PR11_DEFERRED_LOCAL_RESET_APPROVED'"
    );
    expect(verifier).toContain("['migration', 'repair', REPAIRED_VERSION");
    expect(verifier).toContain("deferredState.trim() === '1|0'");
    expect(verifier).toContain(
      "to_regclass('public.customer_insurance_coverages_clinic_id_id_idx')"
    );
    expect(verifier).toContain(
      "to_regclass('public.menu_billing_profiles_clinic_id_id_idx')"
    );
    expect(verifier).toContain("['test', 'db', '--local']");
    expect(verifier).toContain("['db', 'reset', '--local', '--no-seed']");
    expect(verifier).toContain('readFileSync(ROLLBACK_PATH');
    expect(spec).toContain('commercial:verify:pr11:deferred:local');
    expect(packageJson).toContain('"commercial:verify:pr11:deferred:local"');
    expect(workflow).toContain(
      'run: npm run commercial:verify:pr11:deferred:local'
    );
    expect(workflow).toContain("PR11_DEFERRED_LOCAL_RESET_APPROVED: '1'");
  });
});

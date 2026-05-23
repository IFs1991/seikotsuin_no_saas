import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/supabase';
import {
  toInsuranceFeeItemRecord,
  toInsuranceFeeScheduleRecord,
  toInsuranceFeeSourceSnapshotRecord,
  toInsuranceFeeWarningDefinitionRecord,
} from '../../src/lib/insurance-fees/types';
import type { InsuranceFeeGoldenCaseScheduleExpectation } from '../../src/lib/insurance-fees/validate-master';
import { validateInsuranceFeeMaster } from '../../src/lib/insurance-fees/validate-master';

type CliOptions = {
  envFiles: string[];
  json: boolean;
  help: boolean;
};

type QueryError = {
  message: string;
};

function parseCliOptions(argv: readonly string[]): CliOptions {
  const envFiles = ['.env', '.env.local'];
  let json = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg.startsWith('--env-file=')) {
      envFiles.push(arg.slice('--env-file='.length));
    }
  }

  return { envFiles, json, help };
}

function printHelp(): void {
  console.log(`Usage: npm run insurance:validate-master -- [--json] [--env-file=.env.local]

Validates Phase 3A insurance fee master readiness:
- active schedule non-overlap
- active schedule source snapshot provenance
- traffic_accident manual-only item shape
- warning code references
- golden cases do not point at non-active schedules`);
}

function loadEnvFile(envFileName: string): void {
  const envPath = resolve(process.cwd(), envFileName);
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGoldenCaseExpectations(): InsuranceFeeGoldenCaseScheduleExpectation[] {
  const fixturesDir = resolve(process.cwd(), 'fixtures', 'insurance-fee-cases');
  if (!existsSync(fixturesDir)) {
    return [];
  }

  const goldenCases: InsuranceFeeGoldenCaseScheduleExpectation[] = [];
  for (const fileName of readdirSync(fixturesDir)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const filePath = resolve(fixturesDir, fileName);
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!isRecord(parsed)) {
      continue;
    }

    const expected = parsed.expected;
    if (!isRecord(expected)) {
      continue;
    }

    const expectedScheduleCode = expected.scheduleCode;
    if (typeof expectedScheduleCode !== 'string') {
      continue;
    }

    goldenCases.push({
      caseName:
        typeof parsed.caseName === 'string' ? parsed.caseName : fileName,
      expectedScheduleCode,
    });
  }

  return goldenCases;
}

function assertNoQueryError(
  tableName: string,
  error: QueryError | null
): void {
  if (error) {
    throw new Error(`${tableName} query failed: ${error.message}`);
  }
}

export async function main(argv: readonly string[] = []): Promise<void> {
  const options = parseCliOptions(argv);
  if (options.help) {
    printHelp();
    return;
  }

  for (const envFile of options.envFiles) {
    loadEnvFile(envFile);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [
    schedulesResult,
    itemsResult,
    snapshotsResult,
    warningsResult,
  ] = await Promise.all([
    supabase
      .from('insurance_fee_schedules')
      .select(
        'schedule_code,schedule_name,profession_type,payer_context_code,effective_from,effective_to,schedule_status,source_id,source_snapshot_hash'
      ),
    supabase
      .from('insurance_fee_items')
      .select(
        'id,schedule_code,item_code,item_name,official_label,category,amount_yen,unit,billing_scope,calculation_basis,warning_codes_json,manual_amount_required,auto_calculation_allowed,source_id,source_snapshot_hash,confidence,sort_order'
      ),
    supabase
      .from('insurance_fee_source_snapshots')
      .select('source_id,content_hash'),
    supabase
      .from('insurance_fee_warning_definitions')
      .select(
        'warning_code,severity,message,applies_to_profession_type,applies_to_payer_context_code,auto_block_calculation,manual_review_required,is_active,sort_order'
      ),
  ]);

  assertNoQueryError('insurance_fee_schedules', schedulesResult.error);
  assertNoQueryError('insurance_fee_items', itemsResult.error);
  assertNoQueryError(
    'insurance_fee_source_snapshots',
    snapshotsResult.error
  );
  assertNoQueryError(
    'insurance_fee_warning_definitions',
    warningsResult.error
  );

  const result = validateInsuranceFeeMaster({
    schedules: (schedulesResult.data ?? []).map(toInsuranceFeeScheduleRecord),
    items: (itemsResult.data ?? []).map(toInsuranceFeeItemRecord),
    sourceSnapshots: (snapshotsResult.data ?? []).map(
      toInsuranceFeeSourceSnapshotRecord
    ),
    warningDefinitions: (warningsResult.data ?? []).map(
      toInsuranceFeeWarningDefinitionRecord
    ),
    goldenCases: readGoldenCaseExpectations(),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.issues.length === 0) {
    console.log('[insurance:validate-master] OK - no issues');
  } else {
    console.error(
      `[insurance:validate-master] FAILED - ${result.issues.length} issue(s)`
    );
    for (const issue of result.issues) {
      const parts = [
        issue.scheduleCode ? `schedule=${issue.scheduleCode}` : null,
        issue.itemCode ? `item=${issue.itemCode}` : null,
        issue.warningCode ? `warning=${issue.warningCode}` : null,
        issue.caseName ? `case=${issue.caseName}` : null,
      ].filter((part): part is string => part !== null);
      console.error(
        `- ${issue.code}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}: ${
          issue.message
        }`
      );
    }
  }

  if (result.issues.length > 0) {
    process.exitCode = 1;
  }
}

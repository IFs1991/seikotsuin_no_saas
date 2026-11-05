import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const GENERATED_TYPES_PATH = path.join(
  REPOSITORY_ROOT,
  'src',
  'types',
  'supabase.ts'
);

const FIXTURE_TABLE_MAP = {
  clinics: 'clinics',
  profiles: 'profiles',
  userPermissions: 'user_permissions',
  managerAssignments: 'manager_clinic_assignments',
  onboardingStates: 'onboarding_states',
  clinicSettings: 'clinic_settings',
  clinicFeatureFlags: 'clinic_feature_flags',
  menus: 'menus',
  resources: 'resources',
  legacyStaff: 'staff',
  staffProfiles: 'staff_profiles',
  staffClinicMemberships: 'staff_clinic_memberships',
  menuBillingProfiles: 'menu_billing_profiles',
  customers: 'customers',
  insuranceCoverages: 'customer_insurance_coverages',
  reservations: 'reservations',
  dailyReports: 'daily_reports',
  dailyReportItems: 'daily_report_items',
  dailyReportItemTags: 'daily_report_item_tags',
  aiComments: 'ai_comments',
  shiftRequestPeriods: 'shift_request_periods',
  shiftRequests: 'shift_requests',
  staffShifts: 'staff_shifts',
  staffPreferences: 'staff_preferences',
  blocks: 'blocks',
  subscription: 'subscriptions',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractInsertContract(source, table) {
  const tablePattern = new RegExp(
    `^\\s{6}${escapeRegExp(table)}: \\{$`,
    'mu'
  );
  const tableMatch = tablePattern.exec(source);
  if (!tableMatch) {
    throw new Error(`Generated Supabase type is missing table ${table}`);
  }

  const insertStart = source.indexOf('        Insert: {', tableMatch.index);
  const updateStart = source.indexOf('        Update: {', insertStart);
  if (insertStart === -1 || updateStart === -1) {
    throw new Error(`Generated Supabase type has no Insert contract for ${table}`);
  }

  const blockBodyStart = source.indexOf('\n', insertStart);
  const block = source.slice(blockBodyStart + 1, updateStart);
  const fields = new Set();
  const required = new Set();
  for (const line of block.split(/\r?\n/u)) {
    const match = /^\s+([A-Za-z_][A-Za-z0-9_]*)(\?)?:/u.exec(line);
    if (!match) continue;
    fields.add(match[1]);
    if (!match[2]) required.add(match[1]);
  }

  if (fields.size === 0) {
    throw new Error(`Generated Supabase Insert contract is empty for ${table}`);
  }
  return { fields, required };
}

function normalizeFixtureRows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function validateGeneratedTypeContract(dataset) {
  if (!fs.existsSync(GENERATED_TYPES_PATH)) {
    return {
      status: 'skipped',
      reason: `${path.relative(process.cwd(), GENERATED_TYPES_PATH)} not found`,
    };
  }

  const source = fs.readFileSync(GENERATED_TYPES_PATH, 'utf8');
  const violations = [];
  let rowCount = 0;

  for (const [datasetKey, table] of Object.entries(FIXTURE_TABLE_MAP)) {
    const rows = normalizeFixtureRows(dataset[datasetKey]);
    const contract = extractInsertContract(source, table);
    rowCount += rows.length;

    rows.forEach((row, index) => {
      const unknown = Object.keys(row).filter(key => !contract.fields.has(key));
      const missing = [...contract.required].filter(
        key => !Object.prototype.hasOwnProperty.call(row, key)
      );
      if (unknown.length > 0) {
        violations.push(
          `${datasetKey}[${index}] -> ${table}: unknown fields ${unknown.join(', ')}`
        );
      }
      if (missing.length > 0) {
        violations.push(
          `${datasetKey}[${index}] -> ${table}: missing required fields ${missing.join(', ')}`
        );
      }
    });
  }

  if (violations.length > 0) {
    throw new Error(
      `KKD demo fixtures drifted from src/types/supabase.ts:\n- ${violations.join('\n- ')}`
    );
  }

  return {
    status: 'pass',
    generatedTypes: path.relative(REPOSITORY_ROOT, GENERATED_TYPES_PATH),
    tables: Object.keys(FIXTURE_TABLE_MAP).length,
    rows: rowCount,
  };
}

export { validateGeneratedTypeContract };

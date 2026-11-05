import process from 'node:process';
import {
  DEMO_CLINIC_IDS,
  DEMO_CONFIRMATION,
  DEMO_HOSTED_CONFIRMATION,
  DEMO_RESET_CONFIRMATION,
} from './kkd-demo-fixtures.mjs';

const REQUIRED_REVENUE_CONTEXTS = ['insurance', 'private', 'product', 'ticket'];
const REQUIRED_TAG_DEFINITIONS = [
  'TRAFFIC_ACCIDENT_REVIEW',
  'ESTIMATE_EXCLUDED',
  'MANUAL_CLASSIFICATION',
];
const REQUIRED_TABLES = [
  'clinics',
  'profiles',
  'user_permissions',
  'manager_clinic_assignments',
  'onboarding_states',
  'clinic_settings',
  'clinic_feature_flags',
  'menus',
  'resources',
  'staff',
  'staff_profiles',
  'staff_clinic_memberships',
  'menu_billing_profiles',
  'customers',
  'customer_insurance_coverages',
  'reservations',
  'reservation_history',
  'reservation_notifications',
  'daily_reports',
  'daily_report_items',
  'daily_report_item_tags',
  'ai_comments',
  'shift_request_periods',
  'shift_requests',
  'shift_request_audit_logs',
  'staff_shifts',
  'staff_preferences',
  'blocks',
  'subscriptions',
];

function isLocalTarget(rawUrl) {
  const url = new URL(rawUrl);
  return ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(url.hostname);
}

function assertMutationSafety(command, supabaseUrl) {
  if (command === 'seed' && process.env.KKD_DEMO_CONFIRM !== DEMO_CONFIRMATION) {
    throw new Error(
      `Set KKD_DEMO_CONFIRM=${DEMO_CONFIRMATION} before mutating the database.`
    );
  }
  if (
    command === 'reset' &&
    process.env.KKD_DEMO_RESET_CONFIRM !== DEMO_RESET_CONFIRMATION
  ) {
    throw new Error(
      `Set KKD_DEMO_RESET_CONFIRM=${DEMO_RESET_CONFIRMATION} before resetting the demo namespace.`
    );
  }
  if (
    !isLocalTarget(supabaseUrl) &&
    process.env.KKD_DEMO_ALLOW_HOSTED !== DEMO_HOSTED_CONFIRMATION
  ) {
    throw new Error(
      `Hosted target detected. Set KKD_DEMO_ALLOW_HOSTED=${DEMO_HOSTED_CONFIRMATION} explicitly.`
    );
  }
}

function requireConnectionEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }
  return { url, serviceRoleKey };
}

function requireDemoPassword() {
  const password = process.env.KKD_DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'KKD_DEMO_PASSWORD is required and must be at least 12 characters.'
    );
  }
  return password;
}

async function createAdminClient(url, serviceRoleKey) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function failWithSupabaseError(context, error) {
  const code = error?.code ? ` code=${error.code}` : '';
  const details = error?.details ? ` details=${error.details}` : '';
  const hint = error?.hint ? ` hint=${error.hint}` : '';
  throw new Error(
    `${context}: ${error?.message ?? String(error)}${code}${details}${hint}`
  );
}

async function runStep(label, operation) {
  process.stdout.write(`→ ${label} ... `);
  try {
    const result = await operation();
    console.log('OK');
    return result;
  } catch (error) {
    console.log('FAILED');
    throw error;
  }
}

function chunk(rows, size = 100) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function upsertRows(client, table, rows, options = {}) {
  if (rows.length === 0) return;
  const chunkSize = options.chunkSize ?? 100;
  for (const rowChunk of chunk(rows, chunkSize)) {
    const { error } = await client.from(table).upsert(rowChunk, {
      onConflict: options.onConflict ?? 'id',
      ignoreDuplicates: false,
    });
    if (error) failWithSupabaseError(`upsert ${table}`, error);
  }
}

async function deleteByClinicIds(client, table, column = 'clinic_id') {
  const { error } = await client
    .from(table)
    .delete()
    .in(column, DEMO_CLINIC_IDS);
  if (error) failWithSupabaseError(`delete ${table}`, error);
}

async function deleteByIds(client, table, column, ids) {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) failWithSupabaseError(`delete ${table}`, error);
}

async function assertTableAvailable(client, table) {
  const { error } = await client
    .from(table)
    .select('*', { head: true, count: 'exact' })
    .limit(1);
  if (error) {
    failWithSupabaseError(
      `required table/view ${table} is unavailable; apply current migrations first`,
      error
    );
  }
}

async function assertReferenceRows(client, table, column, expectedValues) {
  const { data, error } = await client
    .from(table)
    .select(column)
    .in(column, expectedValues);
  if (error) failWithSupabaseError(`read ${table}`, error);
  const actual = new Set((data ?? []).map(row => row[column]));
  const missing = expectedValues.filter(value => !actual.has(value));
  if (missing.length > 0) {
    throw new Error(
      `${table} is missing required migration seed values: ${missing.join(', ')}`
    );
  }
}

async function assertMigrationReadiness(client) {
  for (const table of REQUIRED_TABLES) {
    await assertTableAvailable(client, table);
  }
  await assertReferenceRows(
    client,
    'revenue_contexts',
    'code',
    REQUIRED_REVENUE_CONTEXTS
  );
  await assertReferenceRows(
    client,
    'daily_report_item_tag_definitions',
    'code',
    REQUIRED_TAG_DEFINITIONS
  );
}

export {
  assertMutationSafety,
  requireConnectionEnv,
  requireDemoPassword,
  createAdminClient,
  failWithSupabaseError,
  runStep,
  upsertRows,
  deleteByClinicIds,
  deleteByIds,
  assertMigrationReadiness,
};

#!/usr/bin/env node
/**
 * E2E Preflight Module
 *
 * Provides functions to ensure Supabase is ready and required tables exist
 * before E2E fixtures/seed/cleanup operations.
 *
 * Environment Variables:
 * - E2E_DB_READY_TIMEOUT_MS: Max wait time for Supabase readiness (default: 30000ms)
 * - E2E_DB_READY_RETRY_MS: Retry interval (default: 1000ms)
 * - E2E_SKIP_DB_CHECK: Skip all preflight checks when set to "1"
 */

/**
 * Tables that MUST exist for E2E operations to succeed.
 * If any are missing, preflight will fail-fast.
 */
export const REQUIRED_TABLES = [
  'clinics',
  'profiles',
  'user_permissions',
  'staff',
  'staff_invites',
  'onboarding_states',
  'customers',
  'reservations',
  'blocks',
  'menus',
  'resources',
  'patients',
  'visits',
  'revenues',
  'user_sessions',
  'security_events',
  'audit_logs',
  'clinic_settings',
  'chat_sessions',
];

/**
 * Tables that are optional - operations skip silently if missing.
 */
export const OPTIONAL_TABLES = [
  'staff_shifts',
  'staff_preferences',
  'ai_comments',
  'reservation_history',
  'daily_reports',
  'chat_messages',
];

/**
 * Wait for Supabase to become ready by attempting a simple query.
 * Retries until success or timeout.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} timeoutMs - Maximum wait time (default: 30000ms)
 * @param {number} retryMs - Retry interval (default: 1000ms)
 * @returns {Promise<number>} Time taken to become ready in milliseconds
 * @throws {Error} If Supabase is not ready within timeout
 */
export async function waitForSupabaseReady(
  supabase,
  timeoutMs = parseInt(process.env.E2E_DB_READY_TIMEOUT_MS || '30000', 10),
  retryMs = parseInt(process.env.E2E_DB_READY_RETRY_MS || '1000', 10)
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { error } = await supabase.from('clinics').select('id').limit(1);
      if (!error) {
        const elapsed = Date.now() - startTime;
        console.log(`[Preflight] Supabase ready after ${elapsed}ms`);
        return elapsed;
      }
    } catch {
      // Connection not ready, continue retry
    }
    await new Promise(r => setTimeout(r, retryMs));
  }

  throw new Error(`Supabase not ready after ${timeoutMs}ms`);
}

/**
 * Check if a single table exists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
export async function tableExists(supabase, tableName) {
  const { error } = await supabase.from(tableName).select('*').limit(0);
  // PostgreSQL error code 42P01 = "relation does not exist"
  return !error || error.code !== '42P01';
}

/**
 * Assert that all required tables exist. Fails fast if any are missing.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} requiredTables - Tables that must exist
 * @throws {Error} If any required table is missing
 */
export async function assertTablesExist(
  supabase,
  requiredTables = REQUIRED_TABLES
) {
  const missingTables = [];

  for (const table of requiredTables) {
    const exists = await tableExists(supabase, table);
    if (!exists) {
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(
      `Required table(s) missing: ${missingTables.join(', ')}. Run migrations first.`
    );
  }

  console.log('[Preflight] All required tables exist');
}

/**
 * Run full preflight checks: readiness + required tables.
 * Respects E2E_SKIP_DB_CHECK environment variable.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true if checks ran, false if skipped
 */
export async function runPreflight(supabase) {
  if (process.env.E2E_SKIP_DB_CHECK === '1') {
    console.log('[Preflight] Skipped (E2E_SKIP_DB_CHECK=1)');
    return false;
  }

  await waitForSupabaseReady(supabase);
  await assertTablesExist(supabase);
  return true;
}

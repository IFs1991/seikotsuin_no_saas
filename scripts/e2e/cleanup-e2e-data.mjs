#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { CLINIC_A_ID, CLINIC_B_ID, FIXTURE_USERS } from './fixtures.mjs';
import { runPreflight, tableExists } from './preflight.mjs';

function loadEnvFile(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

['.env.test', '.env.local', '.env'].forEach(loadEnvFile);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables.');
  console.error(
    'Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const clinicIds = [CLINIC_A_ID, CLINIC_B_ID];
const userIds = FIXTURE_USERS.map(user => user.id);

async function deleteByClinic(table) {
  const { error } = await supabase
    .from(table)
    .delete()
    .in('clinic_id', clinicIds);
  if (error) {
    console.warn(`${table} cleanup warning: ${error.message}`);
  }
}

async function deleteByUser(table, column = 'user_id') {
  const { error } = await supabase.from(table).delete().in(column, userIds);
  if (error) {
    console.warn(`${table} cleanup warning: ${error.message}`);
  }
}

export async function cleanupE2EData() {
  // Run preflight checks (skipped if E2E_SKIP_DB_CHECK=1)
  await runPreflight(supabase);

  // Optional tables - skip silently if missing
  const optionalTables = [
    'staff_shifts',
    'staff_preferences',
    'reservation_history',
    'daily_reports',
    'ai_comments',
  ];

  for (const table of optionalTables) {
    if (await tableExists(supabase, table)) {
      await deleteByClinic(table);
    }
  }

  // Required tables
  await deleteByClinic('clinic_settings');
  await deleteByClinic('reservations');
  await deleteByClinic('blocks');
  await deleteByClinic('resources');
  await deleteByClinic('menus');
  await deleteByClinic('customers');
  await deleteByClinic('revenues');
  await deleteByClinic('visits');
  await deleteByClinic('patients');
  await deleteByClinic('security_events');
  await deleteByClinic('audit_logs');
  await deleteByClinic('user_sessions');
  await deleteByClinic('staff_invites');

  await deleteByUser('onboarding_states');
  await deleteByUser('user_permissions', 'staff_id');
  await deleteByUser('profiles');
  await deleteByUser('staff', 'id');

  const { error: clinicError } = await supabase
    .from('clinics')
    .delete()
    .in('id', clinicIds);
  if (clinicError) {
    console.warn(`clinics cleanup warning: ${clinicError.message}`);
  }

  console.log('E2E data cleanup completed.');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  cleanupE2EData().catch(error => {
    console.error('Failed to clean up E2E data.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

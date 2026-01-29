#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  FIXTURE_CLINICS,
  FIXTURE_USERS,
  STAFF_SHIFT_IDS,
  STAFF_PREFERENCE_IDS,
} from './fixtures.mjs';
import { waitForSupabaseReady } from './preflight.mjs';

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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach(value => {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  });
  return Array.from(duplicates);
}

async function validateDatabaseState() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Wait for Supabase to be ready before running queries
  await waitForSupabaseReady(supabase);

  const clinicIds = FIXTURE_CLINICS.map(clinic => clinic.id);
  const { data: clinics, error: clinicError } = await supabase
    .from('clinics')
    .select('id, name')
    .in('id', clinicIds);

  if (clinicError) {
    throw new Error(`Clinic lookup failed: ${clinicError.message}`);
  }

  clinics?.forEach(existing => {
    const expected = FIXTURE_CLINICS.find(clinic => clinic.id === existing.id);
    if (expected && expected.name !== existing.name) {
      throw new Error(
        `Clinic ID ${existing.id} exists with unexpected name: ${existing.name}`
      );
    }
  });

  const { data: authUsers, error: listError } =
    await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listError) {
    throw new Error(`Auth user listing failed: ${listError.message}`);
  }

  for (const fixtureUser of FIXTURE_USERS) {
    const matchedByEmail = authUsers.users.find(
      user => user.email === fixtureUser.email
    );
    if (matchedByEmail && matchedByEmail.id !== fixtureUser.id) {
      throw new Error(
        `Email ${fixtureUser.email} is already used by ${matchedByEmail.id}`
      );
    }

    const { data: userById, error: userByIdError } =
      await supabase.auth.admin.getUserById(fixtureUser.id);
    if (userByIdError && userByIdError.message) {
      console.warn(
        `Auth user ${fixtureUser.email} not found yet (will be seeded).`
      );
    }
    if (userById?.user && userById.user.email !== fixtureUser.email) {
      throw new Error(
        `Auth user ID ${fixtureUser.id} has unexpected email ${userById.user.email}`
      );
    }
  }

  const userIds = FIXTURE_USERS.map(user => user.id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, clinic_id, role')
    .in('user_id', userIds);

  profiles?.forEach(profile => {
    const expected = FIXTURE_USERS.find(user => user.id === profile.user_id);
    if (!expected) return;
    if (expected.clinic_id !== profile.clinic_id) {
      throw new Error(
        `Profile clinic mismatch for ${profile.user_id}: ${profile.clinic_id}`
      );
    }
    if (expected.role !== profile.role) {
      throw new Error(
        `Profile role mismatch for ${profile.user_id}: ${profile.role}`
      );
    }
  });

  const { data: permissions } = await supabase
    .from('user_permissions')
    .select('staff_id, clinic_id, role')
    .in('staff_id', userIds);

  permissions?.forEach(permission => {
    const expected = FIXTURE_USERS.find(
      user => user.id === permission.staff_id
    );
    if (!expected) return;
    if (expected.permissions_clinic_id !== permission.clinic_id) {
      throw new Error(
        `Permission clinic mismatch for ${permission.staff_id}: ${permission.clinic_id}`
      );
    }
    if (expected.role !== permission.role) {
      throw new Error(
        `Permission role mismatch for ${permission.staff_id}: ${permission.role}`
      );
    }
  });
}

export async function validateE2EFixtures() {
  const clinicIds = FIXTURE_CLINICS.map(clinic => clinic.id);
  const userIds = FIXTURE_USERS.map(user => user.id);
  const emails = FIXTURE_USERS.map(user => user.email);
  const extraIds = [...STAFF_SHIFT_IDS, ...STAFF_PREFERENCE_IDS];

  const invalidIds = [...clinicIds, ...userIds, ...extraIds].filter(
    id => !isUuid(id)
  );
  if (invalidIds.length > 0) {
    throw new Error(`Invalid UUIDs detected: ${invalidIds.join(', ')}`);
  }

  const duplicateIds = findDuplicates([...clinicIds, ...userIds, ...extraIds]);
  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate UUIDs detected: ${duplicateIds.join(', ')}`);
  }

  const duplicateEmails = findDuplicates(emails);
  if (duplicateEmails.length > 0) {
    throw new Error(`Duplicate emails detected: ${duplicateEmails.join(', ')}`);
  }

  if (process.env.E2E_SKIP_DB_CHECK === '1') {
    console.log('E2E fixture DB validation skipped.');
    return;
  }

  await validateDatabaseState();
  console.log('E2E fixture validation passed.');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  validateE2EFixtures().catch(error => {
    console.error('E2E fixture validation failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

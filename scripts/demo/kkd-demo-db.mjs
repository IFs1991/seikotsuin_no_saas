import process from 'node:process';
import {
  DEMO_CLINIC_IDS,
  DEMO_CONFIRMATION,
  DEMO_HOSTED_CONFIRMATION,
  DEMO_IDS,
  DEMO_RESET_CONFIRMATION,
  DEMO_USER_IDS,
  DEMO_VERSION,
} from './kkd-demo-fixtures.mjs';

const ALL_DEMO_CLINIC_IDS = [DEMO_IDS.clinics.root, ...DEMO_CLINIC_IDS];
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
    throw new Error('KKD_DEMO_PASSWORD is required and must be at least 12 characters.');
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
  throw new Error(`${context}: ${error?.message ?? String(error)}${code}${details}${hint}`);
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
  const { error } = await client.from(table).delete().in(column, DEMO_CLINIC_IDS);
  if (error) failWithSupabaseError(`delete ${table}`, error);
}

async function deleteByIds(client, table, column, ids) {
  if (ids.length === 0) return;
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) failWithSupabaseError(`delete ${table}`, error);
}

async function deleteOptionalByIds(client, table, column, ids) {
  if (ids.length === 0) return false;
  const { error } = await client.from(table).delete().in(column, ids);
  if (!error) return true;
  console.warn(`\n  optional ${table} cleanup skipped: ${error.message}`);
  return false;
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
  const { data, error } = await client.from(table).select(column).in(column, expectedValues);
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

async function cleanDemoBusinessData(client, dataset) {
  // FK-safe cleanup. Every destructive predicate is constrained to fixed demo
  // clinic/user IDs; no name-prefix or unconstrained delete is used.
  const clinicScopedOrder = [
    'shift_request_audit_logs',
    'daily_report_item_tags',
    'daily_report_items',
    'daily_reports',
    'reservation_notifications',
    'reservation_history',
    'shift_requests',
    'staff_shifts',
    'shift_request_periods',
    'staff_preferences',
    'blocks',
    'customer_insurance_coverages',
    'menu_billing_profiles',
    'reservations',
    'ai_comments',
    'staff_clinic_memberships',
    'clinic_settings',
    'clinic_feature_flags',
    'customers',
    'resources',
    'menus',
  ];

  for (const table of clinicScopedOrder) {
    await deleteByClinicIds(client, table);
  }

  await deleteByIds(
    client,
    'staff_profiles',
    'id',
    dataset.staffProfiles.map(row => row.id)
  );
  await deleteByIds(
    client,
    'manager_clinic_assignments',
    'manager_user_id',
    [DEMO_IDS.users.manager]
  );
  await deleteByIds(client, 'subscriptions', 'org_root_clinic_id', [DEMO_IDS.clinics.root]);
  await deleteOptionalByIds(
    client,
    'staff',
    'id',
    dataset.legacyStaff.map(row => row.id)
  );
}

async function ensureAuthUsers(client, users, password) {
  for (const user of users) {
    const appMetadata = {
      user_role: user.role,
      role: user.role,
      clinic_id: user.clinicId,
      clinic_scope_ids: user.clinicScopeIds,
      demo_seed: DEMO_VERSION,
    };
    const userMetadata = {
      full_name: user.fullName,
      demo_seed: DEMO_VERSION,
      synthetic: true,
    };

    const { data: existingData } = await client.auth.admin.getUserById(user.id);
    if (existingData?.user) {
      const { error } = await client.auth.admin.updateUserById(user.id, {
        email: user.email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: userMetadata,
      });
      if (error) failWithSupabaseError(`update auth user ${user.email}`, error);
      continue;
    }

    const { error } = await client.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error) failWithSupabaseError(`create auth user ${user.email}`, error);
  }
}

async function seedLegacyStaffBridge(client, rows) {
  const { error } = await client.from('staff').upsert(rows, {
    onConflict: 'id',
    ignoreDuplicates: false,
  });
  if (!error) return true;
  console.warn(
    `\n  legacy staff display bridge unavailable; daily_reports.staff_id will be null: ${error.message}`
  );
  return false;
}

async function seedDataset(client, dataset, password) {
  await runStep('migration/reference preflight', () => assertMigrationReadiness(client));
  await runStep('clean fixed KKD demo namespace', () =>
    cleanDemoBusinessData(client, dataset)
  );
  await runStep('upsert root clinic', () =>
    upsertRows(client, 'clinics', [dataset.clinics[0]])
  );
  await runStep('upsert child clinics', () =>
    upsertRows(client, 'clinics', dataset.clinics.slice(1))
  );
  await runStep('create/update demo auth accounts', () =>
    ensureAuthUsers(client, dataset.users, password)
  );
  await runStep('upsert profiles and authority rows', async () => {
    await upsertRows(client, 'profiles', dataset.profiles);
    await upsertRows(client, 'user_permissions', dataset.userPermissions, {
      onConflict: 'staff_id',
    });
    await upsertRows(client, 'onboarding_states', dataset.onboardingStates);
  });
  await runStep('upsert billing/feature/settings state', async () => {
    await upsertRows(client, 'subscriptions', [dataset.subscription], {
      onConflict: 'org_root_clinic_id',
    });
    await upsertRows(client, 'clinic_feature_flags', dataset.clinicFeatureFlags, {
      onConflict: 'clinic_id',
    });
    await upsertRows(client, 'clinic_settings', dataset.clinicSettings);
  });
  await runStep('upsert real manager assignment scope', () =>
    upsertRows(client, 'manager_clinic_assignments', dataset.managerAssignments)
  );
  await runStep('upsert menus and resources', async () => {
    await upsertRows(client, 'menus', dataset.menus);
    await upsertRows(client, 'resources', dataset.resources);
  });
  const legacyStaffReady = await runStep('upsert optional daily-report staff bridge', () =>
    seedLegacyStaffBridge(client, dataset.legacyStaff)
  );
  await runStep('upsert staff profiles and clinic memberships', async () => {
    await upsertRows(client, 'staff_profiles', dataset.staffProfiles);
    await upsertRows(
      client,
      'staff_clinic_memberships',
      dataset.staffClinicMemberships
    );
  });
  await runStep('upsert pricing and synthetic customers', async () => {
    await upsertRows(client, 'menu_billing_profiles', dataset.menuBillingProfiles);
    await upsertRows(client, 'customers', dataset.customers);
    await upsertRows(
      client,
      'customer_insurance_coverages',
      dataset.insuranceCoverages
    );
  });
  await runStep('upsert reservation history/future schedule', () =>
    upsertRows(client, 'reservations', dataset.reservations)
  );
  await runStep('upsert daily reports and revenue facts', async () => {
    const reports = legacyStaffReady
      ? dataset.dailyReports
      : dataset.dailyReports.map(report => ({ ...report, staff_id: null }));
    await upsertRows(client, 'daily_reports', reports);
    await upsertRows(client, 'daily_report_items', dataset.dailyReportItems);
    await upsertRows(client, 'daily_report_item_tags', dataset.dailyReportItemTags);
  });
  await runStep('upsert shift requests, shifts, preferences, and blocks', async () => {
    await upsertRows(client, 'shift_request_periods', dataset.shiftRequestPeriods);
    await upsertRows(client, 'shift_requests', dataset.shiftRequests);
    await upsertRows(client, 'staff_shifts', dataset.staffShifts);
    await upsertRows(client, 'staff_preferences', dataset.staffPreferences);
    await upsertRows(client, 'blocks', dataset.blocks);
  });
  await runStep('upsert AI narrative data', () =>
    upsertRows(client, 'ai_comments', dataset.aiComments)
  );
}

async function removeAuthUsers(client) {
  for (const userId of DEMO_USER_IDS) {
    const { error } = await client.auth.admin.deleteUser(userId, false);
    if (error && !/not found/iu.test(error.message ?? '')) {
      failWithSupabaseError(`delete auth user ${userId}`, error);
    }
  }
}

async function resetDemoNamespace(client, dataset) {
  await runStep('migration preflight', () => assertMigrationReadiness(client));
  await runStep('clean demo business data', () => cleanDemoBusinessData(client, dataset));
  await runStep('delete demo public identity rows', async () => {
    await deleteByIds(client, 'onboarding_states', 'user_id', DEMO_USER_IDS);
    await deleteByIds(client, 'profiles', 'user_id', DEMO_USER_IDS);
    await deleteByIds(client, 'user_permissions', 'staff_id', DEMO_USER_IDS);
  });
  await runStep('delete demo clinics', async () => {
    await deleteByIds(client, 'clinics', 'id', DEMO_CLINIC_IDS);
    await deleteByIds(client, 'clinics', 'id', [DEMO_IDS.clinics.root]);
  });
  await runStep('delete demo auth accounts', () => removeAuthUsers(client));
}

async function countRows(client, table, configureQuery) {
  let query = client.from(table).select('*', { head: true, count: 'exact' });
  query = configureQuery(query);
  const { count, error } = await query;
  if (error) failWithSupabaseError(`count ${table}`, error);
  return count ?? 0;
}

async function validateCount(client, table, expected, configureQuery) {
  const actual = await countRows(client, table, configureQuery);
  if (actual !== expected) {
    throw new Error(`${table} count mismatch: expected ${expected}, got ${actual}`);
  }
  return actual;
}

async function validateDatasetInDatabase(client, dataset) {
  await assertMigrationReadiness(client);

  const validations = [
    ['clinics', dataset.clinics.length, query => query.in('id', ALL_DEMO_CLINIC_IDS)],
    ['profiles', dataset.profiles.length, query => query.in('user_id', DEMO_USER_IDS)],
    [
      'user_permissions',
      dataset.userPermissions.length,
      query => query.in('staff_id', DEMO_USER_IDS),
    ],
    [
      'manager_clinic_assignments',
      dataset.managerAssignments.length,
      query => query.eq('manager_user_id', DEMO_IDS.users.manager),
    ],
    [
      'onboarding_states',
      dataset.onboardingStates.length,
      query => query.in('user_id', DEMO_USER_IDS),
    ],
    [
      'clinic_settings',
      dataset.clinicSettings.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'clinic_feature_flags',
      dataset.clinicFeatureFlags.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    ['menus', dataset.menus.length, query => query.in('clinic_id', DEMO_CLINIC_IDS)],
    [
      'resources',
      dataset.resources.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'staff_profiles',
      dataset.staffProfiles.length,
      query => query.in('id', dataset.staffProfiles.map(row => row.id)),
    ],
    [
      'staff_clinic_memberships',
      dataset.staffClinicMemberships.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'menu_billing_profiles',
      dataset.menuBillingProfiles.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'customers',
      dataset.customers.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'customer_insurance_coverages',
      dataset.insuranceCoverages.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'reservations',
      dataset.reservations.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'daily_reports',
      dataset.dailyReports.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'daily_report_items',
      dataset.dailyReportItems.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'daily_report_item_tags',
      dataset.dailyReportItemTags.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'ai_comments',
      dataset.aiComments.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'shift_request_periods',
      dataset.shiftRequestPeriods.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'shift_requests',
      dataset.shiftRequests.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'staff_shifts',
      dataset.staffShifts.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    [
      'staff_preferences',
      dataset.staffPreferences.length,
      query => query.in('clinic_id', DEMO_CLINIC_IDS),
    ],
    ['blocks', dataset.blocks.length, query => query.in('clinic_id', DEMO_CLINIC_IDS)],
    [
      'subscriptions',
      1,
      query => query.eq('org_root_clinic_id', DEMO_IDS.clinics.root),
    ],
  ];

  const counts = {};
  for (const [table, expected, configureQuery] of validations) {
    counts[table] = await validateCount(
      client,
      table,
      expected,
      configureQuery
    );
  }

  const viewChecks = {};
  for (const view of [
    'reservation_list_view',
    'patient_visit_summary',
    'staff_performance_summary',
    'daily_revenue_summary',
  ]) {
    viewChecks[view] = await countRows(client, view, query =>
      query.in('clinic_id', DEMO_CLINIC_IDS)
    );
    if (viewChecks[view] < 1) {
      throw new Error(`${view} returned no demo rows`);
    }
  }

  const start = dataset.metadata.todayKey;
  const from = new Date(`${start}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - Math.min(dataset.metadata.historyDays - 1, 30));
  const { data: managerRevenue, error: managerRevenueError } = await client.rpc(
    'manager_revenue_period_totals',
    {
      p_clinic_ids: DEMO_CLINIC_IDS,
      p_start: from.toISOString().slice(0, 10),
      p_end: dataset.metadata.todayKey,
    }
  );
  if (managerRevenueError) {
    failWithSupabaseError('manager_revenue_period_totals RPC', managerRevenueError);
  }
  if ((managerRevenue ?? []).length !== DEMO_CLINIC_IDS.length) {
    throw new Error(
      `manager_revenue_period_totals expected ${DEMO_CLINIC_IDS.length} clinics, got ${(managerRevenue ?? []).length}`
    );
  }

  const { data: subscription, error: subscriptionError } = await client
    .from('subscriptions')
    .select('billing_state, plan_code, included_store_quantity, metadata')
    .eq('org_root_clinic_id', DEMO_IDS.clinics.root)
    .single();
  if (subscriptionError) failWithSupabaseError('read demo subscription', subscriptionError);
  if (subscription.billing_state !== 'trialing' || subscription.plan_code !== 'group') {
    throw new Error('Demo billing gate is not in group/trialing state');
  }

  return {
    counts,
    viewChecks,
    managerRevenue,
    subscription,
  };
}

export {
  assertMutationSafety,
  requireConnectionEnv,
  requireDemoPassword,
  createAdminClient,
  runStep,
  seedDataset,
  resetDemoNamespace,
  validateDatasetInDatabase,
};

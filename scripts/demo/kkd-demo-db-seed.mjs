import {
  DEMO_CLINIC_IDS,
  DEMO_IDS,
  DEMO_USER_IDS,
  DEMO_VERSION,
} from './kkd-demo-fixtures.mjs';
import {
  assertMigrationReadiness,
  deleteByClinicIds,
  deleteByIds,
  failWithSupabaseError,
  runStep,
  upsertRows,
} from './kkd-demo-db-core.mjs';

async function cleanDemoBusinessData(client, dataset) {
  // Every destructive predicate is constrained to fixed demo IDs.
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
  await deleteByIds(
    client,
    'subscriptions',
    'org_root_clinic_id',
    [DEMO_IDS.clinics.root]
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

async function seedDataset(client, dataset, password) {
  await runStep('migration/reference preflight', () =>
    assertMigrationReadiness(client)
  );
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
  await runStep('upsert staff authority bridge', () =>
    upsertRows(client, 'staff', dataset.legacyStaff)
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
    await upsertRows(client, 'daily_reports', dataset.dailyReports);
    await upsertRows(client, 'daily_report_items', dataset.dailyReportItems);
    await upsertRows(
      client,
      'daily_report_item_tags',
      dataset.dailyReportItemTags
    );
  });
  await runStep(
    'upsert shift requests, shifts, preferences, and blocks',
    async () => {
      await upsertRows(
        client,
        'shift_request_periods',
        dataset.shiftRequestPeriods
      );
      await upsertRows(client, 'shift_requests', dataset.shiftRequests);
      await upsertRows(client, 'staff_shifts', dataset.staffShifts);
      await upsertRows(client, 'staff_preferences', dataset.staffPreferences);
      await upsertRows(client, 'blocks', dataset.blocks);
    }
  );
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
  await runStep('clean demo business data', () =>
    cleanDemoBusinessData(client, dataset)
  );
  await runStep('delete demo public identity rows', async () => {
    await deleteByIds(client, 'onboarding_states', 'user_id', DEMO_USER_IDS);
    await deleteByIds(client, 'profiles', 'user_id', DEMO_USER_IDS);
    await deleteByIds(client, 'user_permissions', 'staff_id', DEMO_USER_IDS);
  });
  await runStep('delete demo staff authority rows', () =>
    deleteByIds(
      client,
      'staff',
      'id',
      dataset.legacyStaff.map(row => row.id)
    )
  );
  await runStep('delete demo clinics', async () => {
    await deleteByIds(client, 'clinics', 'id', DEMO_CLINIC_IDS);
    await deleteByIds(client, 'clinics', 'id', [DEMO_IDS.clinics.root]);
  });
  await runStep('delete demo auth accounts', () => removeAuthUsers(client));
}

export { seedDataset, resetDemoNamespace };

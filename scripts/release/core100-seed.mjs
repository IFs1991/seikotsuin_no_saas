import { appendFile, readFile } from 'node:fs/promises';
import {
  batches,
  createManifest,
  invariant,
  tableRows,
  userFixtures,
} from './core100-profile.mjs';
import {
  assertExecutionAllowed,
  createSeedClient,
  databaseFailure,
  fixturePassword,
  readManifest,
  saveJson,
} from './core100-safety.mjs';

const TABLE_ORDER = [
  'roots',
  'clinics',
  'staff',
  'profiles',
  'user_permissions',
  'manager_clinic_assignments',
  'subscriptions',
  'menus',
  'resources',
  'customers',
  'reservations',
  'daily_reports',
  'daily_report_items',
];

export async function assertDedicatedDatabase(client, manifest) {
  const ids = [...manifest.rootIds, ...manifest.clinicIds];
  const { data, error } = await client
    .from('clinics')
    .select('id')
    .not('id', 'in', `(${ids.join(',')})`)
    .limit(1);
  if (error) throw databaseFailure(error, 'TARGET_INSPECTION');
  invariant(
    Array.isArray(data) && data.length === 0,
    'BLOCKED_DATABASE_CONTAINS_OTHER_CLINICS'
  );
}

async function ensureAuthUser(client, user, profile, password) {
  const existing = await client.auth.admin.getUserById(user.id);
  if (existing.data?.user) {
    invariant(
      existing.data.user.email === user.email &&
        existing.data.user.app_metadata?.core100_run_id === profile.runId,
      'AUTH_FIXTURE_OWNERSHIP_MISMATCH'
    );
    return;
  }
  invariant(
    existing.error?.status === 404 || existing.error?.code === 'user_not_found',
    'AUTH_LOOKUP_FAILED'
  );
  const { data, error } = await client.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
    app_metadata: {
      core100_run_id: profile.runId,
      user_role: user.role,
      clinic_id: user.clinicId,
    },
  });
  if (error) throw databaseFailure(error, 'AUTH_CREATE');
  invariant(data?.user?.id === user.id, 'AUTH_FIXTURE_ID_MISMATCH');
}

export async function seedDatabase({
  profile,
  target,
  flags,
  paths,
  client: suppliedClient,
  onProgress = () => {},
}) {
  assertExecutionAllowed(target, flags);
  const password = fixturePassword();
  let manifest;
  try {
    manifest = await readManifest(paths.manifest, profile, target);
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT')
      throw error;
    manifest = createManifest(profile, target);
    await saveJson(paths.manifest, manifest, { exclusive: true });
  }
  invariant(
    manifest.seedStatus !== 'COMPLETE',
    'SEED_ALREADY_COMPLETE_USE_VERIFY_DATA_OR_NEW_RUN'
  );
  const client = suppliedClient ?? (await createSeedClient(target));
  await assertDedicatedDatabase(client, manifest);
  const completed = new Set();
  try {
    for (const line of (await readFile(paths.journal, 'utf8'))
      .split('\n')
      .filter(Boolean)) {
      const record = JSON.parse(line);
      invariant(
        record.profileHash === manifest.profileHash,
        'SEED_JOURNAL_PROFILE_MISMATCH'
      );
      completed.add(record.key);
    }
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT')
      throw error;
  }
  const record = async (key, rowCount) => {
    await appendFile(
      paths.journal,
      `${JSON.stringify({ key, rowCount, profileHash: manifest.profileHash })}\n`,
      { mode: 0o600 }
    );
    completed.add(key);
  };
  manifest.seedStatus = 'IN_PROGRESS';
  await saveJson(paths.manifest, manifest);
  // Roots exist before Auth hooks run; operational data follows all auth users.
  for (const logicalTable of TABLE_ORDER) {
    if (logicalTable === 'staff') {
      for (const user of userFixtures(profile)) {
        const key = `auth:${user.index}`;
        if (!completed.has(key)) {
          await ensureAuthUser(client, user, profile, password);
          await record(key, 1);
        }
      }
      onProgress({ stage: 'auth', rows: 500 });
    }
    let batchIndex = 0;
    let total = 0;
    for (const rows of batches(tableRows(profile, logicalTable))) {
      const key = `${logicalTable}:${batchIndex++}`;
      total += rows.length;
      if (completed.has(key)) continue;
      const table = logicalTable === 'roots' ? 'clinics' : logicalTable;
      // The exclusive target and deterministic run IDs prevent touching another run.
      // Profiles can already exist from Auth hooks; other fixtures insert only.
      const { error } = await client.from(table).upsert(rows, {
        onConflict:
          table === 'profiles'
            ? 'user_id'
            : table === 'user_permissions'
              ? 'staff_id'
              : table === 'subscriptions'
                ? 'org_root_clinic_id'
                : 'id',
        ignoreDuplicates: ![
          'profiles',
          'user_permissions',
          'subscriptions',
        ].includes(table),
      });
      if (error) throw databaseFailure(error, logicalTable.toUpperCase());
      await record(key, rows.length);
      if (batchIndex % 100 === 0)
        onProgress({ stage: logicalTable, rows: total });
    }
    onProgress({ stage: logicalTable, rows: total });
  }
  manifest.seedStatus = 'COMPLETE';
  manifest.seedCompletedAt = new Date().toISOString();
  await saveJson(paths.manifest, manifest);
  return {
    seedStatus: 'COMPLETE',
    counts: manifest.expected,
    verificationStatus: 'NOT_RUN',
    manifest: paths.manifest,
  };
}

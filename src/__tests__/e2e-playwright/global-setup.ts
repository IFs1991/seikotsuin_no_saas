import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loginAsAdmin, loginAsStaff } from './helpers/auth';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);
const staffStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/staff.json'
);

export default async function globalSetup(config: FullConfig) {
  const { waitForSupabaseReady, assertTablesExist, REQUIRED_TABLES } =
    await import('../../../scripts/e2e/preflight.mjs');
  const { validateE2EFixtures } =
    await import('../../../scripts/e2e/validate-e2e-fixtures.mjs');
  const { seedE2EData, supabase } =
    await import('../../../scripts/e2e/seed-e2e-data.mjs');

  // Run preflight checks (skipped if E2E_SKIP_DB_CHECK=1)
  if (process.env.E2E_SKIP_DB_CHECK !== '1') {
    await waitForSupabaseReady(supabase);
    await assertTablesExist(supabase, REQUIRED_TABLES);
  } else {
    console.log('[Preflight] Skipped (E2E_SKIP_DB_CHECK=1)');
  }

  await validateE2EFixtures();
  await seedE2EData();

  const phase = (process.env.E2E_PHASE || 'phase1').toLowerCase();
  const shouldPrepareAdminState =
    phase === 'phase1' ||
    phase === '1' ||
    phase === 'phase2' ||
    phase === '2' ||
    phase === 'all';

  if (!shouldPrepareAdminState) {
    return;
  }

  const baseURL =
    config.projects[0]?.use?.baseURL ??
    config.use?.baseURL ??
    'http://localhost:3000';
  const browserChannel =
    process.env.PLAYWRIGHT_BROWSER_CHANNEL || process.env.PLAYWRIGHT_CHANNEL;

  fs.mkdirSync(path.dirname(adminStorageStatePath), { recursive: true });

  const browser = await chromium.launch(
    browserChannel ? { channel: browserChannel } : undefined
  );
  const adminContext = await browser.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  await loginAsAdmin(adminPage);
  await adminContext.storageState({ path: adminStorageStatePath });
  await adminContext.close();

  const staffContext = await browser.newContext({ baseURL });
  const staffPage = await staffContext.newPage();
  await loginAsStaff(staffPage);
  await staffContext.storageState({ path: staffStorageStatePath });
  await staffContext.close();
  await browser.close();
}

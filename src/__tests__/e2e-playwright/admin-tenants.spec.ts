import { test, expect } from '@playwright/test';
import path from 'node:path';
import { CLINIC_A_ID } from './fixtures';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);
const staffStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/staff.json'
);

test.describe('E2E-1: admin clinic management', () => {
  test.use({ storageState: adminStorageStatePath });

  test('admin can fetch clinic list through API guard', async ({ page }) => {
    const response = await page.request.get('/api/admin/tenants');

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(
      body.data.items.some(
        (clinic: { id: string }) => clinic.id === CLINIC_A_ID
      )
    ).toBe(true);
  });
});

test.describe('E2E-1: clinic access denial', () => {
  test.use({ storageState: staffStorageStatePath });

  test('staff cannot create or update clinics through admin APIs', async ({
    page,
  }) => {
    const createResponse = await page.request.post('/api/admin/tenants', {
      data: {
        name: `Unauthorized Clinic ${Date.now()}`,
        is_active: true,
      },
    });
    expect(createResponse.status()).toBe(403);

    const updateResponse = await page.request.patch(
      `/api/admin/tenants/${CLINIC_A_ID}`,
      {
        data: { name: 'Unauthorized Update' },
      }
    );
    expect(updateResponse.status()).toBe(403);
  });
});

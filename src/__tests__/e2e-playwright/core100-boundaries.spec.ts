import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CLINIC_A_ID,
  CLINIC_B_ID,
  CLINIC_B_EMAIL,
  CLINIC_B_PASSWORD,
  USER_ADMIN_ID,
  USER_CLINIC_B_ID,
} from './fixtures';
import {
  customerSchema,
  loginThroughForm,
  readSuccess,
  requireLocalCore100Environment,
  reservationSchema,
} from './core100-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('core100: authenticated company B witnesses remain outside company A admin scope', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = requireLocalCore100Environment(baseURL);
  const headers = { Origin: origin };
  await loginThroughForm(page, {
    email: CLINIC_B_EMAIL,
    password: CLINIC_B_PASSWORD,
    id: USER_CLINIC_B_ID,
    clinicId: CLINIC_B_ID,
    role: 'staff',
  });
  const name = `Core100 B ${randomUUID()}`;
  const patientB = await readSuccess(
    await page.request.post('/api/customers', {
      headers,
      data: { clinic_id: CLINIC_B_ID, name, phone: '09000000000' },
    }),
    customerSchema,
    201
  );
  expect(
    await readSuccess(
      await page.request.get(
        `/api/customers?clinic_id=${CLINIC_B_ID}&id=${patientB.id}`
      ),
      customerSchema
    )
  ).toEqual(patientB);

  const adminContext = await browser.newContext({
    baseURL: origin,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await loginThroughForm(await adminContext.newPage(), {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      id: USER_ADMIN_ID,
      clinicId: CLINIC_A_ID,
      role: 'admin',
    });
    const denied = await adminContext.request.get(
      `/api/customers?clinic_id=${CLINIC_B_ID}&id=${patientB.id}`
    );
    expect(denied.status()).toBe(403);
    expect(await denied.text()).not.toContain(name);
    expect(
      (
        await adminContext.request.get(
          `/api/customers?clinic_id=${CLINIC_A_ID}&id=${patientB.id}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await adminContext.request.patch('/api/customers', {
          headers,
          data: {
            clinic_id: CLINIC_B_ID,
            id: patientB.id,
            name: 'forbidden overwrite',
          },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await adminContext.request.patch('/api/customers', {
          headers,
          data: {
            clinic_id: CLINIC_A_ID,
            id: patientB.id,
            name: 'forbidden overwrite',
          },
        })
      ).status()
    ).toBe(404);
    const ownList = await readSuccess(
      await adminContext.request.get(
        `/api/customers?clinic_id=${CLINIC_A_ID}&q=${encodeURIComponent(name)}`
      ),
      z.object({ items: z.array(customerSchema) })
    );
    expect(ownList.items).toHaveLength(0);
    expect(
      (
        await adminContext.request.get(
          `/api/admin/dashboard?clinic_id=${CLINIC_B_ID}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.get(`/api/admin/dashboard?clinic_id=${CLINIC_B_ID}`)
      ).status()
    ).toBe(403);

    // This seeded A reservation must exist before any negative assertion. The
    // B fixture has no menus/resources, so test the witnessed A-to-B boundary.
    const reservationAId = '00000000-0000-0000-0000-00000000f001';
    const reservationA = await readSuccess(
      await adminContext.request.get(
        `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${reservationAId}`
      ),
      reservationSchema
    );
    expect(reservationA.id).toBe(reservationAId);
    expect(
      (
        await page.request.get(
          `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${reservationAId}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.get(
          `/api/reservations?clinic_id=${CLINIC_B_ID}&id=${reservationAId}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await page.request.patch('/api/reservations', {
          headers,
          data: {
            clinic_id: CLINIC_A_ID,
            id: reservationAId,
            status: 'cancelled',
          },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.patch('/api/reservations', {
          headers,
          data: {
            clinic_id: CLINIC_B_ID,
            id: reservationAId,
            status: 'cancelled',
          },
        })
      ).status()
    ).toBe(404);
    expect(
      await readSuccess(
        await adminContext.request.get(
          `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${reservationAId}`
        ),
        reservationSchema
      )
    ).toEqual(reservationA);
    expect(
      await readSuccess(
        await page.request.get(
          `/api/customers?clinic_id=${CLINIC_B_ID}&id=${patientB.id}`
        ),
        customerSchema
      )
    ).toEqual(patientB);
  } finally {
    await adminContext.close();
  }
});

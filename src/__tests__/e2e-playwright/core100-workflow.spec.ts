import { randomInt, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CLINIC_A_ID,
  RESOURCE_IDS,
  STAFF_EMAIL,
  STAFF_PASSWORD,
  USER_ADMIN_ID,
  USER_STAFF_ID,
} from './fixtures';
import {
  customerSchema,
  idSchema,
  loginThroughForm,
  readSuccess,
  requireLocalCore100Environment,
  reservationSchema,
} from './core100-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('core100: login, patient, reservation lifecycle and competing bookings', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = requireLocalCore100Environment(baseURL);
  const headers = { Origin: origin };
  await loginThroughForm(page, {
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    id: USER_STAFF_ID,
    clinicId: CLINIC_A_ID,
    role: 'staff',
  });
  const patientName = `Core100 ${randomUUID()}`;
  const patient = await readSuccess(
    await page.request.post('/api/customers', {
      headers,
      data: { clinic_id: CLINIC_A_ID, name: patientName, phone: '09000000000' },
    }),
    customerSchema,
    201
  );
  expect(patient.name).toBe(patientName);
  expect(
    await readSuccess(
      await page.request.get(
        `/api/customers?clinic_id=${CLINIC_A_ID}&id=${patient.id}`
      ),
      customerSchema
    )
  ).toEqual(patient);

  const menuId = '00000000-0000-0000-0000-00000000d001';
  const staffId = RESOURCE_IDS[0];
  if (!staffId) throw new Error('Missing required clinic A resource fixture.');
  const menus = await readSuccess(
    await page.request.get(`/api/menus?clinic_id=${CLINIC_A_ID}`),
    z.array(idSchema.extend({ isActive: z.boolean() }))
  );
  expect(menus).toContainEqual({ id: menuId, isActive: true });
  const resources = await readSuccess(
    await page.request.get(
      `/api/resources?clinic_id=${CLINIC_A_ID}&type=staff`
    ),
    z.array(
      idSchema.extend({
        isActive: z.boolean(),
        isBookable: z.boolean(),
        maxConcurrent: z.number(),
      })
    )
  );
  expect(resources).toContainEqual({
    id: staffId,
    isActive: true,
    isBookable: true,
    maxConcurrent: 1,
  });

  // Future isolated slots avoid the seed's current-day reservations. Only these
  // newly created reservations are cancelled in finally; no DB reset is used.
  const slot = Date.UTC(2040, 0, 1) + randomInt(36_500) * 86_400_000;
  const createdIds: string[] = [];
  const booking = {
    clinic_id: CLINIC_A_ID,
    customerId: patient.id,
    menuId,
    staffId,
    startTime: new Date(slot).toISOString(),
    endTime: new Date(slot + 3_600_000).toISOString(),
    channel: 'phone',
    notes: 'core100-created',
  };
  try {
    const created = await readSuccess(
      await page.request.post('/api/reservations', { headers, data: booking }),
      reservationSchema,
      201
    );
    createdIds.push(created.id);
    const movedStart = new Date(slot + 7_200_000).toISOString();
    const movedEnd = new Date(slot + 10_800_000).toISOString();
    await readSuccess(
      await page.request.patch('/api/reservations', {
        headers,
        data: {
          clinic_id: CLINIC_A_ID,
          id: created.id,
          startTime: movedStart,
          endTime: movedEnd,
          notes: 'core100-updated',
          status: 'confirmed',
        },
      }),
      reservationSchema
    );
    const moved = await readSuccess(
      await page.request.get(
        `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${created.id}`
      ),
      reservationSchema
    );
    expect(Date.parse(moved.startTime)).toBe(Date.parse(movedStart));
    expect(Date.parse(moved.endTime)).toBe(Date.parse(movedEnd));
    expect(moved).toMatchObject({
      id: created.id,
      customerId: patient.id,
      staffId,
      notes: 'core100-updated',
      status: 'confirmed',
    });
    await readSuccess(
      await page.request.patch('/api/reservations', {
        headers,
        data: { clinic_id: CLINIC_A_ID, id: created.id, status: 'cancelled' },
      }),
      reservationSchema
    );
    const cancelled = await readSuccess(
      await page.request.get(
        `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${created.id}`
      ),
      reservationSchema
    );
    expect(cancelled.status).toBe('cancelled');

    const results = await Promise.all([
      page.request.post('/api/reservations', { headers, data: booking }),
      page.request.post('/api/reservations', { headers, data: booking }),
    ]);
    // Capture every successful row for cleanup even if the conflict assertion fails.
    for (const response of results) {
      if (response.status() === 201) {
        const row = await readSuccess(response, reservationSchema, 201);
        createdIds.push(row.id);
      }
    }
    expect(results.map(response => response.status()).sort()).toEqual([
      201, 409,
    ]);
    const rows = await readSuccess(
      await page.request.get(
        `/api/reservations?clinic_id=${CLINIC_A_ID}&customer_id=${patient.id}`
      ),
      z.array(reservationSchema)
    );
    expect(rows.filter(row => row.status !== 'cancelled')).toHaveLength(1);
    expect(rows.map(row => row.id).sort()).toEqual([...createdIds].sort());
  } finally {
    for (const id of createdIds) {
      await readSuccess(
        await page.request.patch('/api/reservations', {
          headers,
          data: { clinic_id: CLINIC_A_ID, id, status: 'cancelled' },
        }),
        reservationSchema
      );
    }
  }
});

test('core100: daily report persists once and scoped admin totals include it', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = requireLocalCore100Environment(baseURL);
  const headers = { Origin: origin };
  await loginThroughForm(page, {
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    id: USER_STAFF_ID,
    clinicId: CLINIC_A_ID,
    role: 'staff',
  });
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
    const dashboardSchema = z.object({
      clinicsData: z.array(
        idSchema.extend({
          totalRevenue: z.number(),
          totalPatientCount: z.number(),
        })
      ),
      overallKpis: z.object({
        totalGroupRevenue: z.number(),
        totalGroupPatientCount: z.number(),
      }),
    });
    const beforeResponse = await adminContext.request.get(
      `/api/admin/dashboard?clinic_id=${CLINIC_A_ID}`
    );
    const reportDate = new Date(
      Date.UTC(2040, 0, 1) + randomInt(36_500) * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const listUrl = `/api/daily-reports?clinic_id=${CLINIC_A_ID}&start_date=${reportDate}&end_date=${reportDate}`;
    const beforeReports = await readSuccess(
      await page.request.get(listUrl),
      z.object({ reports: z.array(idSchema) })
    );
    expect(
      beforeReports.reports,
      'A fresh report date is required; never overwrite a fixture report.'
    ).toHaveLength(0);
    const payload = {
      clinic_id: CLINIC_A_ID,
      report_date: reportDate,
      total_patients: 17,
      new_patients: 3,
      total_revenue: 34_000,
      insurance_revenue: 10_000,
      private_revenue: 24_000,
      report_text: `core100 ${randomUUID()}`,
    };
    const first = await readSuccess(
      await page.request.post('/api/daily-reports', { headers, data: payload }),
      idSchema
    );
    const repeated = await readSuccess(
      await page.request.post('/api/daily-reports', { headers, data: payload }),
      idSchema
    );
    expect(repeated.id).toBe(first.id);
    const report = await readSuccess(
      await page.request.get(
        `/api/daily-reports?clinic_id=${CLINIC_A_ID}&id=${first.id}`
      ),
      idSchema.extend({
        reportDate: z.string(),
        totalPatients: z.number(),
        newPatients: z.number(),
        totalRevenue: z.number(),
        insuranceRevenue: z.number(),
        privateRevenue: z.number(),
        reportText: z.string(),
      })
    );
    expect(report).toEqual({
      id: first.id,
      reportDate,
      totalPatients: 17,
      newPatients: 3,
      totalRevenue: 34_000,
      insuranceRevenue: 10_000,
      privateRevenue: 24_000,
      reportText: payload.report_text,
    });
    const reports = await readSuccess(
      await page.request.get(listUrl),
      z.object({ reports: z.array(idSchema) })
    );
    expect(reports.reports).toEqual([{ id: first.id }]);

    // Aggregate-disabled PostgREST must fail here, not be accepted as zero totals.
    const before = await readSuccess(beforeResponse, dashboardSchema);
    const after = await readSuccess(
      await adminContext.request.get(
        `/api/admin/dashboard?clinic_id=${CLINIC_A_ID}`
      ),
      dashboardSchema
    );
    expect(before.clinicsData.map(clinic => clinic.id)).toEqual([CLINIC_A_ID]);
    expect(after.clinicsData.map(clinic => clinic.id)).toEqual([CLINIC_A_ID]);
    expect(after.overallKpis.totalGroupRevenue).toBe(
      before.overallKpis.totalGroupRevenue + payload.total_revenue
    );
    expect(after.overallKpis.totalGroupPatientCount).toBe(
      before.overallKpis.totalGroupPatientCount + payload.total_patients
    );
  } finally {
    await adminContext.close();
  }
});

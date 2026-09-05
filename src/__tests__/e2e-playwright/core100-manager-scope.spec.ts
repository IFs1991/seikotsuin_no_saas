import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CLINIC_A_ID,
  CLINIC_B_EMAIL,
  CLINIC_B_ID,
  CLINIC_B_PASSWORD,
  USER_ADMIN_ID,
  USER_CLINIC_B_ID,
} from './fixtures';
import {
  CORE100_ASSIGNED_CLINIC_ID,
  CORE100_BOOKING_FIXTURES,
  CORE100_MANAGER,
  CORE100_UNASSIGNED_CLINIC_ID,
  CORE100_UNASSIGNED_STAFF,
} from './core100-fixtures';
import {
  idSchema,
  loginThroughForm,
  readSuccess,
  requireLocalCore100Environment,
  reservationSchema,
} from './core100-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('core100: real manager gets exact assigned-clinic counts and cannot access an unassigned sibling', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = requireLocalCore100Environment(baseURL);
  const headers = { Origin: origin };
  if (process.env.CORE100_E2E_ENABLED !== 'true')
    throw new Error(
      'Enable dedicated core100 fixtures before this test; missing witnesses must fail.'
    );
  const [assigned, unassigned] = CORE100_BOOKING_FIXTURES;
  await loginThroughForm(page, CORE100_MANAGER);
  const witnessContext = await browser.newContext({
    baseURL: origin,
    storageState: { cookies: [], origins: [] },
  });
  try {
    await loginThroughForm(
      await witnessContext.newPage(),
      CORE100_UNASSIGNED_STAFF
    );
    const unassignedReservation = await readSuccess(
      await witnessContext.request.get(
        `/api/reservations?clinic_id=${unassigned.clinicId}&id=${unassigned.reservationId}`
      ),
      reservationSchema
    );
    expect(unassignedReservation.id).toBe(unassigned.reservationId);
    const reportSchema = idSchema.extend({
      reportDate: z.string(),
      totalRevenue: z.number(),
      totalPatients: z.number(),
    });
    const unassignedReport = await readSuccess(
      await witnessContext.request.get(
        `/api/daily-reports?clinic_id=${unassigned.clinicId}&id=${unassigned.reportId}`
      ),
      reportSchema
    );
    expect(unassignedReport).toMatchObject({
      id: unassigned.reportId,
      totalRevenue: 99_000,
      totalPatients: 99,
    });
    const assignedReservation = await readSuccess(
      await page.request.get(
        `/api/reservations?clinic_id=${assigned.clinicId}&id=${assigned.reservationId}`
      ),
      reservationSchema
    );
    expect(assignedReservation.id).toBe(assigned.reservationId);
    const assignedReport = await readSuccess(
      await page.request.get(
        `/api/daily-reports?clinic_id=${assigned.clinicId}&id=${assigned.reportId}`
      ),
      reportSchema
    );
    const dashboard = await readSuccess(
      await page.request.get('/api/manager/dashboard'),
      z.object({
        date: z.object({
          today: z.string(),
          timezone: z.literal('Asia/Tokyo'),
        }),
        clinics: z.array(idSchema),
        summary: z.object({
          assignedClinicCount: z.number(),
          todayRevenue: z.number(),
          todayVisitCount: z.number(),
          todayReservationCount: z.number(),
          submittedDailyReportCount: z.number(),
          missingDailyReportCount: z.number(),
          needsReviewCount: z.number(),
        }),
        clinicCards: z.array(
          z.object({
            clinicId: z.string().uuid(),
            todayRevenue: z.number(),
            previousDayRevenue: z.number(),
            todayVisitCount: z.number(),
            todayReservationCount: z.number(),
            previousWeekdayReservationCount: z.number(),
            todayCancellationCount: z.number(),
            dailyReportStatus: z.string(),
            cancellationRate: z.number().nullable(),
          })
        ),
      })
    );
    expect(
      dashboard.date.today,
      'Seeding and assertion must occur on the same JST date.'
    ).toBe(assignedReport.reportDate);
    expect(dashboard.clinics).toEqual([{ id: CORE100_ASSIGNED_CLINIC_ID }]);
    expect(dashboard.summary).toEqual({
      assignedClinicCount: 1,
      todayRevenue: 10_000,
      todayVisitCount: 5,
      todayReservationCount: 2,
      submittedDailyReportCount: 1,
      missingDailyReportCount: 0,
      needsReviewCount: 0,
    });
    expect(dashboard.clinicCards).toEqual([
      {
        clinicId: CORE100_ASSIGNED_CLINIC_ID,
        todayRevenue: 10_000,
        previousDayRevenue: 8000,
        todayVisitCount: 5,
        todayReservationCount: 2,
        previousWeekdayReservationCount: 1,
        todayCancellationCount: 1,
        dailyReportStatus: 'submitted',
        cancellationRate: 1 / 3,
      },
    ]);

    expect(
      (
        await page.request.get(
          `/api/reservations?clinic_id=${CORE100_UNASSIGNED_CLINIC_ID}&id=${unassigned.reservationId}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.get(
          `/api/reservations?clinic_id=${CORE100_ASSIGNED_CLINIC_ID}&id=${unassigned.reservationId}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await page.request.get(
          `/api/daily-reports?clinic_id=${CORE100_UNASSIGNED_CLINIC_ID}&id=${unassigned.reportId}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.get(
          `/api/daily-reports?clinic_id=${CORE100_ASSIGNED_CLINIC_ID}&id=${unassigned.reportId}`
        )
      ).status()
    ).toBe(404);
    // Assigned clinic access does not grant manager patient or mutation privileges.
    expect(
      (
        await page.request.get(
          `/api/customers?clinic_id=${assigned.clinicId}&id=${assigned.customerId}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.patch('/api/reservations', {
          headers,
          data: {
            clinic_id: assigned.clinicId,
            id: assigned.reservationId,
            status: 'cancelled',
          },
        })
      ).status()
    ).toBe(403);
    expect(
      await readSuccess(
        await page.request.get(
          `/api/reservations?clinic_id=${assigned.clinicId}&id=${assigned.reservationId}`
        ),
        reservationSchema
      )
    ).toEqual(assignedReservation);
    expect(
      await readSuccess(
        await witnessContext.request.get(
          `/api/reservations?clinic_id=${unassigned.clinicId}&id=${unassigned.reservationId}`
        ),
        reservationSchema
      )
    ).toEqual(unassignedReservation);
  } finally {
    await witnessContext.close();
  }
});

test('core100: company A admin cannot read or change a witnessed company B reservation', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = requireLocalCore100Environment(baseURL);
  const headers = { Origin: origin };
  if (process.env.CORE100_E2E_ENABLED !== 'true')
    throw new Error(
      'Enable dedicated core100 fixtures before this test; missing witnesses must fail.'
    );
  const bookingB = CORE100_BOOKING_FIXTURES[2];
  await loginThroughForm(page, {
    email: CLINIC_B_EMAIL,
    password: CLINIC_B_PASSWORD,
    id: USER_CLINIC_B_ID,
    clinicId: CLINIC_B_ID,
    role: 'staff',
  });
  const before = await readSuccess(
    await page.request.get(
      `/api/reservations?clinic_id=${CLINIC_B_ID}&id=${bookingB.reservationId}`
    ),
    reservationSchema
  );
  expect(before.id).toBe(bookingB.reservationId);
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
    expect(
      (
        await adminContext.request.get(
          `/api/reservations?clinic_id=${CLINIC_B_ID}&id=${bookingB.reservationId}`
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await adminContext.request.get(
          `/api/reservations?clinic_id=${CLINIC_A_ID}&id=${bookingB.reservationId}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await adminContext.request.patch('/api/reservations', {
          headers,
          data: {
            clinic_id: CLINIC_B_ID,
            id: bookingB.reservationId,
            status: 'cancelled',
          },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await adminContext.request.patch('/api/reservations', {
          headers,
          data: {
            clinic_id: CLINIC_A_ID,
            id: bookingB.reservationId,
            status: 'cancelled',
          },
        })
      ).status()
    ).toBe(404);
    expect(
      await readSuccess(
        await page.request.get(
          `/api/reservations?clinic_id=${CLINIC_B_ID}&id=${bookingB.reservationId}`
        ),
        reservationSchema
      )
    ).toEqual(before);
  } finally {
    await adminContext.close();
  }
});

import { buildManagerDashboardResponse } from '@/lib/manager-dashboard';
import { isReservationNoOverlapError } from '@/lib/reservations/conflict';
import { summarizeReservationStatuses } from '@/lib/reservations/status';

const clinicId = '11111111-1111-4111-8111-111111111111';

describe('shared reservation business rules', () => {
  it('keeps mobile home reservation status counts aligned with the PC manager dashboard', () => {
    const statusFixture = [
      { status: 'confirmed' },
      { status: 'unconfirmed' },
      { status: 'tentative' },
      { status: 'trial' },
      { status: 'cancelled' },
      { status: 'no_show' },
      { status: 'noshow' },
      { status: null },
    ];
    const mobileSummary = summarizeReservationStatuses(statusFixture);
    const managerDashboard = buildManagerDashboardResponse({
      generatedAt: '2026-06-12T03:00:00.000Z',
      date: {
        today: '2026-06-12',
        previousDay: '2026-06-11',
        previousWeekday: '2026-06-05',
        timezone: 'Asia/Tokyo',
      },
      clinics: [{ id: clinicId, name: '池袋院' }],
      dailyReports: [],
      reviewSignals: [],
      reservations: statusFixture.map((row, index) => ({
        id: `reservation-${index}`,
        clinic_id: clinicId,
        start_time: '2026-06-12T01:00:00.000Z',
        status: row.status,
      })),
    });
    const card = managerDashboard.clinicCards[0];
    if (!card) {
      throw new Error('expected a manager dashboard clinic card');
    }

    expect(mobileSummary).toEqual({
      total: 5,
      unconfirmed: 3,
      cancelled: 3,
    });
    expect(card.todayReservationCount).toBe(mobileSummary.total);
    expect(card.todayCancellationCount).toBe(mobileSummary.cancelled);
  });

  it('maps reservation exclusion constraint SQLSTATE to slot conflict semantics', () => {
    expect(
      isReservationNoOverlapError({
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "reservations_no_overlap"',
      })
    ).toBe(true);
    expect(isReservationNoOverlapError({ code: '23505' })).toBe(false);
    expect(isReservationNoOverlapError(new Error('23P01'))).toBe(false);
  });
});

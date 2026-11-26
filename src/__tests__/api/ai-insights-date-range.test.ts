import { NextRequest } from 'next/server';
import { GET } from '@/app/api/ai-insights/route';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(async () => ({ supabase: {} })),
}));
jest.mock('@/lib/services/analytics-read-service');

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const route = '/api/ai-insights';
const revenue = jest.mocked(AnalyticsReadService.prototype.fetchDailyRevenue);
const staff = jest.mocked(AnalyticsReadService.prototype.fetchStaffPerformance);
const patients = jest.mocked(
  AnalyticsReadService.prototype.fetchPatientVisitSummary
);

function requestFor(period?: string) {
  const url = new URL(route, 'http://localhost');
  url.searchParams.set('clinic_id', clinicId);
  if (period !== undefined) url.searchParams.set('period_days', period);
  return new NextRequest(url);
}

describe('AI insights reporting dates', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({
      doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'],
    });
    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = 'true';
    delete process.env.GEMINI_API_KEY;
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected external request'));
    revenue.mockResolvedValue([]);
    staff.mockResolvedValue([]);
    patients.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalFlag === undefined)
      delete process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;
    else process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = originalFlag;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it.each([
    ['2026-10-19T23:59:59+09:00', '1', '2026-10-19', '2026-10-19'],
    ['2026-10-20T00:00:00+09:00', '1', '2026-10-20', '2026-10-20'],
    ['2026-10-20T08:59:59+09:00', undefined, '2026-09-21', '2026-10-20'],
    ['2026-10-20T09:00:00+09:00', '30', '2026-09-21', '2026-10-20'],
    ['2027-01-01T00:00:00+09:00', '30', '2026-12-03', '2027-01-01'],
    ['2024-03-01T00:00:00+09:00', '2', '2024-02-29', '2024-03-01'],
    ['2024-02-29T08:59:59+09:00', '30', '2024-01-31', '2024-02-29'],
    ['2026-03-09T09:30:00+09:00', '2', '2026-03-08', '2026-03-09'],
    ['2026-11-15T12:00:00+09:00', '2.5', '2026-11-13', '2026-11-15'],
    ['2026-11-01T12:00:00+09:00', '2.5', '2026-10-31', '2026-11-01'],
    ['2026-10-20T12:00:00+09:00', '0.5', '2026-10-20', '2026-10-20'],
  ] as const)(
    'passes the inclusive range at %s for period %s to analytics',
    async (now, period, startDate, endDate) => {
      jest.setSystemTime(new Date(now));
      const request = requestFor(period);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ensureClinicAccess).toHaveBeenCalledWith(
        request,
        route,
        clinicId,
        { requireClinicMatch: true }
      );
      expect(revenue).toHaveBeenCalledWith(clinicId, { startDate, endDate });
      expect(patients).toHaveBeenCalledWith(
        clinicId,
        expect.objectContaining({ dateFilter: { startDate } })
      );
      expect(await response.json()).toMatchObject({
        success: true,
        data: { summary: expect.stringContaining(`直近${period ?? '30'}日`) },
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { enabled: false, status: 404 },
    { enabled: true, status: 500 },
  ])(
    'stops before analytics and Gemini when access fails (flag=$enabled)',
    async ({ enabled, status }) => {
      process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = String(enabled);
      process.env.GEMINI_API_KEY = 'test-only';
      if (enabled) {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest
          .mocked(ensureClinicAccess)
          .mockRejectedValueOnce(
            new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden', 403)
          );
      }
      const response = await GET(requestFor('1'));
      expect(response.status).toBe(status);
      expect(ensureClinicAccess).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(AnalyticsReadService).not.toHaveBeenCalled();
      expect(revenue).not.toHaveBeenCalled();
      expect(staff).not.toHaveBeenCalled();
      expect(patients).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  );
});

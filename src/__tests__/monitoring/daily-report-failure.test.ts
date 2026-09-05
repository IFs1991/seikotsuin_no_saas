import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { reportApiFailure } from '@/lib/monitoring/api-failure';
import { GET, POST, DELETE } from '@/app/api/daily-reports/route';

jest.mock('@/lib/supabase/guards', () => ({ ensureClinicAccess: jest.fn() }));
jest.mock('@/lib/monitoring/api-failure', () => ({
  reportApiFailure: jest.fn(),
}));

it.each(['GET', 'POST', 'DELETE'] as const)(
  'reports a handled %s configuration failure without its contents',
  async method => {
    jest.clearAllMocks();
    jest
      .mocked(ensureClinicAccess)
      .mockRejectedValue(
        new AppError(
          ERROR_CODES.BILLING_CONFIGURATION_ERROR,
          'private diagnostic',
          503
        )
      );
    const request = new NextRequest(
      'http://localhost/api/daily-reports?clinic_id=11111111-1111-4111-8111-111111111111&id=22222222-2222-4222-8222-222222222222',
      {
        method,
        ...(method === 'POST'
          ? {
              body: JSON.stringify({
                clinic_id: '11111111-1111-4111-8111-111111111111',
                report_date: '2026-09-05',
                total_patients: 1,
                new_patients: 0,
                total_revenue: 100,
                insurance_revenue: 0,
                private_revenue: 100,
              }),
            }
          : {}),
      }
    );
    const response = await { GET, POST, DELETE }[method](request);
    expect(response.status).toBe(503);
    expect(reportApiFailure).toHaveBeenCalledWith(503);
  }
);

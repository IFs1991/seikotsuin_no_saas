import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const ensureClinicAccessMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

import { GET } from '@/app/api/dashboard/route';

// UUIDフォーマットのテスト用clinic_id
const TEST_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Dashboard API security', () => {
  beforeEach(() => {
    ensureClinicAccessMock.mockReset();
  });

  it('returns 401 when authorization fails', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401)
    );

    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${TEST_CLINIC_ID}`
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});

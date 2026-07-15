import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { NextRequest } from 'next/server';
import { processApiRequest, verifyAdminAuth } from '@/lib/api-helpers';

const ensureClinicAccessMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

describe('verifyAdminAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clinic_admin を許可し、正規化済み role を返す', async () => {
    ensureClinicAccessMock.mockResolvedValue({
      user: { id: 'user-1', email: 'clinic-admin@example.com' },
      permissions: { role: 'clinic_admin', clinic_id: 'clinic-1' },
    });

    const request = new Request('http://localhost/api/admin/dashboard') as any;
    const result = await verifyAdminAuth(request);

    expect(result.success).toBe(true);
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'clinic-admin@example.com',
      role: 'clinic_admin',
    });
  });

  it('非推奨の clinic_manager を clinic_admin に正規化して返す', async () => {
    ensureClinicAccessMock.mockResolvedValue({
      user: { id: 'user-2', email: 'legacy@example.com' },
      permissions: { role: 'clinic_manager', clinic_id: 'clinic-1' },
    });

    const request = new Request('http://localhost/api/admin/dashboard') as any;
    const result = await verifyAdminAuth(request);

    expect(result.success).toBe(true);
    expect(result.user?.role).toBe('clinic_admin');
  });

  it('権限不足は失敗で返す', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, 'forbidden', 403)
    );

    const request = new Request('http://localhost/api/admin/dashboard') as any;
    const result = await verifyAdminAuth(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('forbidden');
  });
});

describe('processApiRequest account status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the stable ACCOUNT_INACTIVE code with HTTP 403', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.ACCOUNT_INACTIVE, undefined, 403)
    );

    const result = await processApiRequest(
      new NextRequest('http://localhost/api/protected')
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected processApiRequest to reject inactive account');
    }

    expect(result.error.status).toBe(403);
    await expect(result.error.json()).resolves.toMatchObject({
      success: false,
      code: ERROR_CODES.ACCOUNT_INACTIVE,
    });
  });

  it('normalizes authority lookup failures without exposing database details', async () => {
    const sensitiveMessage =
      'permission query failed: service role credential must stay private';
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.DATABASE_CONNECTION_ERROR, sensitiveMessage, 503)
    );

    const result = await processApiRequest(
      new NextRequest('http://localhost/api/protected')
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error(
        'Expected processApiRequest to reject unavailable authority'
      );
    }

    expect(result.error.status).toBe(503);
    const body: unknown = await result.error.json();
    expect(body).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(body)).not.toContain(sensitiveMessage);
    expect(JSON.stringify(body)).not.toContain(
      ERROR_CODES.DATABASE_CONNECTION_ERROR
    );
  });
});

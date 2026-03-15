import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { verifyAdminAuth } from '@/lib/api-helpers';

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

import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerAssignedClinicsResponse } from '@/types/manager-assigned-clinics';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsWithinScopeMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

type ApiSuccessPayload = {
  success: true;
  data: ManagerAssignedClinicsResponse;
};

type ApiErrorPayload = {
  success: false;
  error: string;
};

function isSuccessPayload(value: unknown): value is ApiSuccessPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === false &&
    'error' in value
  );
}

function mockAuth(role = 'manager') {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'manager-user',
      email: 'manager@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: clinicB,
      clinic_scope_ids: [clinicB],
    },
    supabase: { from: jest.fn() },
  });
}

async function getAssignedClinics() {
  const { GET } = await import('@/app/api/manager/assigned-clinics/route');
  return await GET(
    new NextRequest('http://localhost/api/manager/assigned-clinics')
  );
}

describe('GET /api/manager/assigned-clinics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    createAdminClientMock.mockReturnValue({ from: jest.fn(), rpc: jest.fn() });
    resolveManagerAssignedClinicsWithinScopeMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
  });

  it('returns 401 for unauthenticated requests', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      ),
    });

    const response = await getAssignedClinics();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-manager users', async () => {
    mockAuth('clinic_admin');

    const response = await getAssignedClinics();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(isErrorPayload(json)).toBe(true);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns assigned clinics from active manager assignments only', async () => {
    const response = await getAssignedClinics();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(resolveManagerAssignedClinicsWithinScopeMock).toHaveBeenCalledWith(
      expect.any(Object),
      'manager-user',
      [clinicB]
    );
    expect(json.data.clinics).toEqual([{ id: clinicA, name: '池袋院' }]);
    expect(json.data.clinics).not.toContainEqual({
      id: clinicB,
      name: expect.any(String),
    });
    expect(typeof json.data.generatedAt).toBe('string');
  });

  it('returns empty clinics when manager has no assignments and does not fallback to permission or JWT clinic scope', async () => {
    resolveManagerAssignedClinicsWithinScopeMock.mockResolvedValue([]);

    const response = await getAssignedClinics();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(isSuccessPayload(json)).toBe(true);
    if (!isSuccessPayload(json)) {
      throw new Error('expected success payload');
    }
    expect(json.data.clinics).toEqual([]);
  });

  it('returns an information-free 503 when assignment authority lookup is unavailable', async () => {
    resolveManagerAssignedClinicsWithinScopeMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
        'manager assignment table details',
        503
      )
    );

    const response = await getAssignedClinics();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(json)).not.toContain('assignment');
  });

  it('preserves the existing 500 handling for unrelated downstream failures', async () => {
    resolveManagerAssignedClinicsWithinScopeMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.DATABASE_CONNECTION_ERROR,
        'unrelated downstream failure',
        503
      )
    );

    const response = await getAssignedClinics();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: 'サーバーエラーが発生しました',
    });
  });
});

import {
  createAdminClient,
  createClient,
  getUserAccessContext,
} from '@/lib/supabase';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
  createClient: jest.fn(),
  getUserAccessContext: jest.fn(),
}));

const createAdminClientMock = createAdminClient as jest.Mock;
const createClientMock = createClient as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;

describe('GET /api/auth/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { name: '健康堂整骨院' },
              error: null,
            }),
          }),
        }),
      }),
    });
  });

  it('returns canonical role and admin flag from shared access context', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'legacy@example.com' },
          },
          error: null,
        }),
      },
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_manager',
        clinic_id: 'clinic-1',
      },
      role: 'clinic_manager',
      normalizedRole: 'clinic_admin',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: true,
    });

    const { GET } = await import('@/app/api/auth/profile/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getUserAccessContextMock).toHaveBeenCalledWith(
      'user-1',
      expect.any(Object),
      {
        user: { id: 'user-1', email: 'legacy@example.com' },
      }
    );
    expect(body).toEqual({
      success: true,
      data: {
        id: 'user-1',
        email: 'legacy@example.com',
        role: 'clinic_admin',
        clinicId: 'clinic-1',
        clinicName: '健康堂整骨院',
        isActive: true,
        isAdmin: true,
      },
    });
  });

  it('returns 401 when the user is unauthenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const { GET } = await import('@/app/api/auth/profile/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: '認証が必要です',
    });
  });

  it('returns 403 before reading clinic details for an inactive account', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'legacy@example.com' } },
          error: null,
        }),
      },
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: 'clinic-1',
      isActive: false,
      isAdmin: true,
    });

    const { GET } = await import('@/app/api/auth/profile/route');
    const response = await GET();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the DB permission row is missing', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'legacy@example.com' } },
          error: null,
        }),
      },
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/api/auth/profile/route');
    const response = await GET();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('preserves an authority lookup AppError as a safe 503 response', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'legacy@example.com' } },
          error: null,
        }),
      },
    });
    getUserAccessContextMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.DATABASE_CONNECTION_ERROR,
        'internal database detail',
        503
      )
    );

    const { GET } = await import('@/app/api/auth/profile/route');
    const response = await GET();
    const bodyText = await response.text();

    expect(response.status).toBe(503);
    expect(bodyText).not.toContain('internal database detail');
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});

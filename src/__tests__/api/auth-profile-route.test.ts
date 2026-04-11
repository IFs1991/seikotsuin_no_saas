import { createClient, getUserAccessContext } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getUserAccessContext: jest.fn(),
}));

const createClientMock = createClient as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;

describe('GET /api/auth/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(body.data).toEqual({
      id: 'user-1',
      email: 'legacy@example.com',
      role: 'clinic_admin',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: true,
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

    expect(response.status).toBe(401);
  });
});

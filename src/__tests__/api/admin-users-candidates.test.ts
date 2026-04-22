import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;

type QueryRow = Record<string, unknown>;

function createListQuery<T extends QueryRow>(rows: T[]) {
  const result = { data: rows, error: null };
  const query = {
    select: jest.fn(),
    ilike: jest.fn(),
    or: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    in: jest.fn(),
    limit: jest.fn(),
    then: jest.fn(
      (
        resolve: (value: typeof result) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject)
    ),
  };

  query.select.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  return query;
}

describe('GET /api/admin/users/candidates', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('Japanese name search returns display-safe user candidates', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase: {},
    });

    const staffSearchQuery = createListQuery([
      {
        id: 'user-1',
        email: 'staff-yamada@example.com',
        name: '山田 太郎',
        clinic_id: 'clinic-1',
        role: 'therapist',
        clinics: { name: '新宿院' },
      },
    ]);
    const profileSearchQuery = createListQuery([{ user_id: 'user-1' }]);
    const profileDetailsQuery = createListQuery([
      {
        user_id: 'user-1',
        email: 'yamada@example.com',
        full_name: '山田 太郎',
        is_active: true,
      },
    ]);
    const permissionsQuery = createListQuery([
      {
        id: 'permission-1',
        staff_id: 'user-1',
        role: 'manager',
        clinic_id: 'clinic-1',
        clinics: { name: '新宿院' },
      },
    ]);

    const tableQueries = {
      staff: [staffSearchQuery],
      profiles: [profileSearchQuery, profileDetailsQuery],
      user_permissions: [permissionsQuery],
    };
    const adminClient = {
      from: jest.fn((table: keyof typeof tableQueries) => {
        const query = tableQueries[table]?.shift();
        if (!query) {
          throw new Error(`Unexpected table query: ${table}`);
        }
        return query;
      }),
    };

    createAdminClientMock.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/users/candidates?search=%E5%B1%B1%E7%94%B0'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(staffSearchQuery.or).toHaveBeenCalledWith(
      'name.ilike.%山田%,email.ilike.%山田%'
    );
    expect(profileSearchQuery.or).toHaveBeenCalledWith(
      'full_name.ilike.%山田%,email.ilike.%山田%'
    );
    expect(profileDetailsQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        email: 'yamada@example.com',
        full_name: '山田 太郎',
        clinic_name: '新宿院',
        current_role: 'manager',
        permission_clinic_name: '新宿院',
      }),
    ]);
  });

  it('rejects non-admin permission even when authenticated', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-1',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: { role: 'clinic_admin', clinic_id: 'clinic-1' },
      supabase: {},
    });

    const { GET } = await import('@/app/api/admin/users/candidates/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/users/candidates?search=sato')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});

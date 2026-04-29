import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const userId = '123e4567-e89b-12d3-a456-426614174001';

describe('POST /api/menus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a clinic menu through scoped admin client after route-level scope guard', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const savedMenu = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      clinic_id: clinicId,
      name: '自費整体',
      description: '標準メニュー',
      category: 'treatment',
      price: 6000,
      duration_minutes: 60,
      is_insurance_applicable: false,
      options: [],
      is_active: true,
    };
    const single = jest.fn().mockResolvedValue({ data: savedMenu, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const adminClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'menus') return { insert };
        return {};
      }),
    };
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'clinic_admin',
      clinic_id: clinicId,
      clinic_scope_ids: [clinicId],
    };

    processClinicScopedBodyMock.mockResolvedValueOnce({
      success: true,
      dto: {
        clinic_id: clinicId,
        name: '自費整体',
        description: '標準メニュー',
        category: 'treatment',
        price: 6000,
        durationMinutes: 60,
        isInsuranceApplicable: false,
        isActive: true,
        options: [],
      },
      auth: { id: userId, email: 'clinic-admin@example.com', role: 'clinic_admin' },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: adminClient,
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/menus/route');
    const response = await POST({} as any);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { allowedRoles: Array.from(CLINIC_ADMIN_ROLES) }
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(adminClient.from).toHaveBeenCalledWith('menus');
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        created_by: userId,
        name: '自費整体',
        duration_minutes: 60,
      })
    );
    expect(json.data).toMatchObject({
      id: savedMenu.id,
      clinicId,
      durationMinutes: 60,
      isInsuranceApplicable: false,
    });
  });
});

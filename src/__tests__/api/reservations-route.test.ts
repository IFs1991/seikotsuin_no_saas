import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    canAccessClinicScope: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const canAccessClinicScopeMock = canAccessClinicScope as jest.Mock;

const validClinicId = '123e4567-e89b-12d3-a456-426614174000';
const validId = '123e4567-e89b-12d3-a456-426614174001';

describe('PATCH /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes allowedRoles to processApiRequest for role guard', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: validId, status: 'cancelled' },
      error: null,
    });

    const select = jest.fn().mockReturnValue({ single });
    const eq2 = jest.fn().mockReturnValue({ select });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const update = jest.fn().mockReturnValue({ eq: eq1 });
    const from = jest.fn().mockReturnValue({ update });

    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      body: {
        clinic_id: validClinicId,
        id: validId,
        status: 'cancelled',
      },
      auth: { id: 'user-1', email: 'test@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: validClinicId,
        clinic_scope_ids: [validClinicId],
      },
      supabase: { from },
    });
    canAccessClinicScopeMock.mockReturnValue(true);

    const { PATCH } = await import('@/app/api/reservations/route');

    const response = await PATCH({} as any);

    expect(response.status).toBe(200);
    // processApiRequest is called once with allowedRoles (via processClinicScopedBody)
    expect(processApiRequestMock).toHaveBeenCalledTimes(1);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requireBody: true,
        allowedRoles: Array.from(STAFF_ROLES),
      })
    );
    // Clinic scope is verified via canAccessClinicScope
    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: validClinicId }),
      validClinicId
    );
  });
});

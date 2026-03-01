import { processApiRequest } from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;

describe('PATCH /api/reservations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes allowedRoles to processApiRequest for role guard', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { id: 'res-1', status: 'cancelled' },
      error: null,
    });

    const select = jest.fn().mockReturnValue({ single });
    const eq2 = jest.fn().mockReturnValue({ select });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const update = jest.fn().mockReturnValue({ eq: eq1 });
    const from = jest.fn().mockReturnValue({ update });

    processApiRequestMock
      .mockResolvedValueOnce({
        success: true,
        body: {
          clinic_id: '123e4567-e89b-12d3-a456-426614174000',
          id: '123e4567-e89b-12d3-a456-426614174001',
          status: 'cancelled',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        supabase: { from },
        auth: { id: 'user-1' },
        permissions: {
          role: 'staff',
          clinic_id: '123e4567-e89b-12d3-a456-426614174000',
        },
      });

    const { PATCH } = await import('@/app/api/reservations/route');

    const response = await PATCH({} as any);

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        clinicId: '123e4567-e89b-12d3-a456-426614174000',
        requireClinicMatch: true,
        allowedRoles: Array.from(STAFF_ROLES),
      })
    );
  });
});

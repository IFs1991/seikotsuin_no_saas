import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient, createScopedAdminContext } from '@/lib/supabase';

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
    createAdminClient: jest.fn(),
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const createAdminClientMock = jest.mocked(createAdminClient);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const reservationId = '123e4567-e89b-12d3-a456-426614174001';
const customerId = '123e4567-e89b-12d3-a456-426614174002';
const menuId = '123e4567-e89b-12d3-a456-426614174003';
const staffId = '123e4567-e89b-12d3-a456-426614174004';

function buildRequest(search = '') {
  return new NextRequest(
    `http://localhost/api/mobile-uiux/reservations${search}`
  );
}

describe('GET /api/mobile-uiux/reservations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_WRITE_ENABLED: 'false',
      MOBILE_UIUX_RESERVATION_WRITE_ENABLED: 'false',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: { from: jest.fn() },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('queries reservation_list_view with clinic scope and a JST day range', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: reservationId,
            customer_id: customerId,
            customer_name: '山田 太郎',
            menu_id: menuId,
            menu_name: '整体',
            staff_id: staffId,
            staff_name: '田中先生',
            start_time: '2026-04-26T15:30:00.000Z',
            end_time: '2026-04-26T16:00:00.000Z',
            status: 'confirmed',
            channel: 'phone',
            notes: null,
            selected_options: [],
            is_staff_requested: true,
            staff_nomination_fee: 1500,
          },
        ],
        error: null,
      }),
    };
    const scopedClient = {
      from: jest.fn().mockReturnValue(query),
    };
    const assertClinicInScope = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: scopedClient,
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildRequest(
      `?clinic_id=${clinicId}&date=2026-04-27&staff_id=${staffId}`
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'staff',
        clinic_id: clinicId,
      })
    );
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(scopedClient.from).toHaveBeenCalledWith('reservation_list_view');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(query.eq).toHaveBeenCalledWith('staff_id', staffId);
    expect(query.gte).toHaveBeenCalledWith(
      'start_time',
      '2026-04-26T15:00:00.000Z'
    );
    expect(query.lt).toHaveBeenCalledWith(
      'start_time',
      '2026-04-27T15:00:00.000Z'
    );
    expect(payload.data).toMatchObject({
      clinicId,
      date: '2026-04-27',
      timezone: 'Asia/Tokyo',
      reservations: [
        {
          id: reservationId,
          customerId,
          customerName: '山田 太郎',
          menuId,
          menuName: '整体',
          staffId,
          staffName: '田中先生',
          startTime: '2026-04-26T15:30:00.000Z',
          endTime: '2026-04-26T16:00:00.000Z',
          status: 'confirmed',
          channel: 'phone',
          selectedOptions: [],
          isStaffRequested: true,
          staffNominationFee: 1500,
        },
      ],
    });
  });

  it('uses the PC manager assignment-aware guard and stops on assigned clinic violation', async () => {
    const guardResponse = Response.json(
      { success: false, error: '対象クリニックへのアクセス権がありません' },
      { status: 403 }
    );
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: guardResponse,
    });

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const request = buildRequest(`?clinic_id=${clinicId}`);
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('uses the admin read client for manager after assignment-aware access passes', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const adminClient = {
      from: jest.fn().mockReturnValue(query),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: 'fallback-clinic',
        clinic_scope_ids: ['jwt-clinic'],
      },
      supabase: { from: jest.fn() },
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { GET } = await import('@/app/api/mobile-uiux/reservations/route');
    const response = await GET(buildRequest(`?clinic_id=${clinicId}`));

    expect(response.status).toBe(200);
    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
  });

  it('returns 403 for mobile reservation writes while write flags are off', async () => {
    const { POST, PATCH } = await import(
      '@/app/api/mobile-uiux/reservations/route'
    );

    const postResponse = await POST(
      new NextRequest('http://localhost/api/mobile-uiux/reservations', {
        method: 'POST',
      })
    );
    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/mobile-uiux/reservations', {
        method: 'PATCH',
      })
    );

    expect(postResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
  });
});

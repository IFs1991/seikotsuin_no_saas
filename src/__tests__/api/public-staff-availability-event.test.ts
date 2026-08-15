import { NextRequest } from 'next/server';
import { GET } from '@/app/api/public/staff-availability-events/[eventId]/route';
import { createPublicClinicContext } from '@/lib/supabase/scoped-admin';
import { verifyPublicLineMyPageAuth } from '@/lib/line/public-my-page-auth';
import { getPublicStaffAvailabilityEvent } from '@/lib/services/staff-availability-service';
import {
  StaffAvailabilityNotFoundError,
  StaffAvailabilityUnavailableError,
} from '@/lib/services/staff-availability-service';

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return { ...actual, createPublicClinicContext: jest.fn() };
});

jest.mock('@/lib/line/public-my-page-auth', () => ({
  verifyPublicLineMyPageAuth: jest.fn(),
}));

jest.mock('@/lib/crm-line/db', () => ({
  createCrmAdminClient: jest.fn(() => ({ source: 'crm-test-client' })),
}));

jest.mock('@/lib/services/staff-availability-service', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/services/staff-availability-service')
  >('@/lib/services/staff-availability-service');
  return { ...actual, getPublicStaffAvailabilityEvent: jest.fn() };
});

const CLINIC_ID = '00000000-0000-4000-8000-000000000101';
const EVENT_ID = '00000000-0000-4000-8000-000000000201';
const STAFF_ID = '00000000-0000-4000-8000-000000000301';

const clinicContextMock = jest.mocked(createPublicClinicContext);
const authMock = jest.mocked(verifyPublicLineMyPageAuth);
const eventMock = jest.mocked(getPublicStaffAvailabilityEvent);

function request(clinicId = CLINIC_ID): NextRequest {
  return new NextRequest(
    `http://localhost/api/public/staff-availability-events/${EVENT_ID}?clinic_id=${clinicId}`,
    { headers: { Authorization: 'Bearer line-id-token' } }
  );
}

describe('GET /api/public/staff-availability-events/[eventId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clinicContextMock.mockResolvedValue({
      client: { from: jest.fn() },
      clinicId: CLINIC_ID,
      clinic: {
        id: CLINIC_ID,
        name: 'テスト整骨院',
        is_active: true,
      },
    });
    authMock.mockResolvedValue({
      ok: true,
      lineUserId: 'Uline-user-001',
      displayName: 'LINE 太郎',
      credentialGenerationId: '22222222-2222-4222-8222-222222222222',
    });
    eventMock.mockResolvedValue({
      eventId: EVENT_ID,
      staffId: STAFF_ID,
      staffName: '田中先生',
      availableDatetime: '2026-08-13T01:00:00.000Z',
    });
  });

  it('LINE token audienceが不正なら401を返してeventを参照しない', async () => {
    authMock.mockResolvedValue({ ok: false, reason: 'aud_mismatch' });

    const response = await GET(request(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(response.status).toBe(401);
    expect(eventMock).not.toHaveBeenCalled();
  });

  it('本人向け通知がなければ404を返す', async () => {
    eventMock.mockRejectedValue(new StaffAvailabilityNotFoundError());

    const response = await GET(request(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('予約済み・失効状態は409を返す', async () => {
    eventMock.mockRejectedValue(new StaffAvailabilityUnavailableError());

    const response = await GET(request(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });

    expect(response.status).toBe(409);
  });

  it('本人向けの有効な通知だけ固定スタッフ・日時を返す', async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ eventId: EVENT_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(eventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clinicId: CLINIC_ID,
        credentialGenerationId: '22222222-2222-4222-8222-222222222222',
        eventId: EVENT_ID,
        lineUserId: 'Uline-user-001',
      })
    );
    expect(body).toEqual({
      success: true,
      data: {
        eventId: EVENT_ID,
        staffId: STAFF_ID,
        staffName: '田中先生',
        availableDatetime: '2026-08-13T01:00:00.000Z',
      },
    });
  });
});

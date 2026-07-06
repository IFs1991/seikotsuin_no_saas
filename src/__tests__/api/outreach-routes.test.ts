import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createAdminClient } from '@/lib/supabase';
import {
  createOutreachDraft,
  fetchDormantCandidates,
  OUTREACH_ALLOWED_ROLES,
} from '@/lib/outreach';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    logError: jest.fn(),
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

jest.mock('@/lib/outreach', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/outreach')>('@/lib/outreach');
  return {
    ...actual,
    fetchDormantCandidates: jest.fn(),
    createOutreachDraft: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const ensureClinicAccessMock = jest.mocked(ensureClinicAccess);
const createAdminClientMock = jest.mocked(createAdminClient);
const fetchDormantCandidatesMock = jest.mocked(fetchDormantCandidates);
const createOutreachDraftMock = jest.mocked(createOutreachDraft);

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

function buildGetRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function buildPostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/outreach/campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
  });
}

describe('outreach API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureClinicAccessMock.mockResolvedValue({
      supabase: { from: jest.fn() },
      user: {
        id: 'user-1',
        email: 'manager@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-07-06T00:00:00.000Z',
      },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: [],
      },
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn() });
  });

  it('GET dormant-candidates enforces clinic scope before fetching candidates', async () => {
    fetchDormantCandidatesMock.mockResolvedValue({
      clinic_id: CLINIC_ID,
      days_from: 30,
      days_to: 60,
      date_from: '2026-05-07',
      date_to: '2026-06-06',
      max_recipients: 300,
      candidates: [],
    });

    const { GET } = await import('@/app/api/outreach/dormant-candidates/route');
    const response = await GET(
      buildGetRequest(
        `/api/outreach/dormant-candidates?clinic_id=${CLINIC_ID}&days_from=30&days_to=60`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({}),
      '/api/outreach/dormant-candidates',
      CLINIC_ID,
      {
        allowedRoles: OUTREACH_ALLOWED_ROLES,
        requireClinicMatch: true,
      }
    );
    expect(fetchDormantCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({}),
      {
        clinic_id: CLINIC_ID,
        days_from: 30,
        days_to: 60,
      }
    );
  });

  it('GET dormant-candidates returns 403 when clinic scope fails', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.FORBIDDEN,
        '対象クリニックへのアクセス権がありません',
        403
      )
    );

    const { GET } = await import('@/app/api/outreach/dormant-candidates/route');
    const response = await GET(
      buildGetRequest(
        `/api/outreach/dormant-candidates?clinic_id=${CLINIC_ID}&days_from=30&days_to=60`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(fetchDormantCandidatesMock).not.toHaveBeenCalled();
  });

  it('POST campaigns lets manager create drafts after clinic-scope validation', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'manager-user',
        email: 'manager@example.com',
        role: 'manager',
      },
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      supabase: { from: jest.fn() },
      body: {
        clinic_id: CLINIC_ID,
        name: '休眠フォロー',
        days_from: 30,
        days_to: 60,
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        customer_ids: [CUSTOMER_ID],
      },
    });
    createOutreachDraftMock.mockResolvedValue({
      campaign_id: '33333333-3333-4333-8333-333333333333',
      status: 'draft',
      selected_count: 1,
      created_at: '2026-07-06T00:00:00.000Z',
    });

    const { POST } = await import('@/app/api/outreach/campaigns/route');
    const response = await POST(
      buildPostRequest({
        clinic_id: CLINIC_ID,
        name: '休眠フォロー',
        days_from: 30,
        days_to: 60,
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        customer_ids: [CUSTOMER_ID],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.selected_count).toBe(1);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({}),
      {
        requireBody: true,
        allowedRoles: OUTREACH_ALLOWED_ROLES,
        requireClinicMatch: false,
      }
    );
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({}),
      '/api/outreach/campaigns',
      CLINIC_ID,
      {
        allowedRoles: OUTREACH_ALLOWED_ROLES,
        requireClinicMatch: true,
      }
    );
    expect(createOutreachDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({}),
      expect.objectContaining({
        clinic_id: CLINIC_ID,
        customer_ids: [CUSTOMER_ID],
      }),
      'manager-user'
    );
  });
});

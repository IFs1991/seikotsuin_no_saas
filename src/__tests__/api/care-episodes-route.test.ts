import { NextRequest } from 'next/server';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';

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
const customerId = '123e4567-e89b-12d3-a456-426614174001';
const episodeId = '123e4567-e89b-12d3-a456-426614174002';

const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function buildEpisodeRow() {
  return {
    id: episodeId,
    clinic_id: clinicId,
    customer_id: customerId,
    episode_name: '腰痛 episode',
    primary_problem_text: '腰痛',
    started_on: '2026-05-01',
    ended_on: null,
    status: 'active',
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-05-15T00:00:00.000Z',
    updated_at: '2026-05-15T00:00:00.000Z',
  };
}

describe('/api/care-episodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST creates a clinic-scoped care episode for an existing customer', async () => {
    const customerQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: customerId },
        error: null,
      }),
    };
    const insertSelect = {
      single: jest.fn().mockResolvedValue({
        data: buildEpisodeRow(),
        error: null,
      }),
    };
    const careEpisodesTable = {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(insertSelect),
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'customers') {
          return { select: jest.fn().mockReturnValue(customerQuery) };
        }
        if (table === 'care_episodes') return careEpisodesTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        customerId,
        episodeName: '腰痛 episode',
        primaryProblemText: '腰痛',
        startedOn: '2026-05-01',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/care-episodes/route');
    const response = await POST(
      new NextRequest('http://localhost/api/care-episodes', {
        method: 'POST',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(careEpisodesTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        customer_id: customerId,
        episode_name: '腰痛 episode',
        primary_problem_text: '腰痛',
        started_on: '2026-05-01',
        status: 'active',
        created_by: 'user-1',
        updated_by: 'user-1',
      })
    );
    expect(json.data).toMatchObject({
      id: episodeId,
      clinicId,
      customerId,
      episodeName: '腰痛 episode',
      status: 'active',
    });
  });

  test('POST returns 404 when the customer is outside the clinic scope', async () => {
    const customerQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'customers') {
          return { select: jest.fn().mockReturnValue(customerQuery) };
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        customerId,
        startedOn: '2026-05-01',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/care-episodes/route');
    const response = await POST(
      new NextRequest('http://localhost/api/care-episodes', {
        method: 'POST',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('顧客が見つかりません');
  });
});

describe('/api/care-episodes/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PATCH updates a care episode inside the clinic scope', async () => {
    const updateSelect = {
      single: jest.fn().mockResolvedValue({
        data: {
          ...buildEpisodeRow(),
          status: 'paused',
          ended_on: '2026-05-20',
        },
        error: null,
      }),
    };
    const updateQuery = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue(updateSelect),
    };
    const careEpisodesTable = {
      update: jest.fn().mockReturnValue(updateQuery),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'care_episodes') return careEpisodesTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        status: 'paused',
        endedOn: '2026-05-20',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { PATCH } = await import('@/app/api/care-episodes/[id]/route');
    const response = await PATCH(
      new NextRequest(`http://localhost/api/care-episodes/${episodeId}`, {
        method: 'PATCH',
      }),
      { params: Promise.resolve({ id: episodeId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(careEpisodesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paused',
        ended_on: '2026-05-20',
        updated_by: 'user-1',
      })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', episodeId);
    expect(json.data).toMatchObject({
      id: episodeId,
      status: 'paused',
      endedOn: '2026-05-20',
    });
  });
});

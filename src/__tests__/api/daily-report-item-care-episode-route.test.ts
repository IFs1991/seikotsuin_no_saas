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
const itemId = '123e4567-e89b-12d3-a456-426614174010';
const customerId = '123e4567-e89b-12d3-a456-426614174001';
const episodeId = '123e4567-e89b-12d3-a456-426614174002';

const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function createItemQuery(customerIdValue: string | null = customerId) {
  return {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: itemId,
        clinic_id: clinicId,
        customer_id: customerIdValue,
      },
      error: null,
    }),
  };
}

function createEpisodeQuery(customerIdValue: string = customerId) {
  return {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: episodeId,
        clinic_id: clinicId,
        customer_id: customerIdValue,
      },
      error: null,
    }),
  };
}

describe('/api/daily-reports/items/[id]/care-episode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST attaches a care episode and clears visit stage until recalculation', async () => {
    const itemQuery = createItemQuery();
    const episodeQuery = createEpisodeQuery();
    const updateSelect = {
      single: jest.fn().mockResolvedValue({
        data: {
          id: itemId,
          clinic_id: clinicId,
          customer_id: customerId,
          care_episode_id: episodeId,
          visit_ordinal_in_episode: null,
          visit_stage_code: null,
        },
        error: null,
      }),
    };
    const updateQuery = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue(updateSelect),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn().mockReturnValue(updateQuery),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'care_episodes') {
          return { select: jest.fn().mockReturnValue(episodeQuery) };
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        careEpisodeId: episodeId,
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import(
      '@/app/api/daily-reports/items/[id]/care-episode/route'
    );
    const response = await POST(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/care-episode`,
        { method: 'POST' }
      ),
      { params: Promise.resolve({ id: itemId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        care_episode_id: episodeId,
        visit_ordinal_in_episode: null,
        visit_stage_code: null,
        updated_by: 'user-1',
      })
    );
    expect(json.data).toMatchObject({
      dailyReportItemId: itemId,
      careEpisodeId: episodeId,
      visitOrdinalInEpisode: null,
      visitStageCode: null,
    });
  });

  test('POST rejects care episode customer mismatch before updating the item', async () => {
    const itemQuery = createItemQuery();
    const episodeQuery = createEpisodeQuery(
      '123e4567-e89b-12d3-a456-426614174099'
    );
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
      update: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'care_episodes') {
          return { select: jest.fn().mockReturnValue(episodeQuery) };
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        careEpisodeId: episodeId,
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import(
      '@/app/api/daily-reports/items/[id]/care-episode/route'
    );
    const response = await POST(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/care-episode`,
        { method: 'POST' }
      ),
      { params: Promise.resolve({ id: itemId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('care episodeの顧客が日報明細と一致しません');
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
  });
});

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
const episodeId = '123e4567-e89b-12d3-a456-426614174002';

const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function createResolvedQuery<TData>(data: TData) {
  const result = Promise.resolve({ data, error: null });

  return {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
}

describe('/api/care-episodes/recalculate-visit-stages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST recalculates visit ordinals and canonical stage codes', async () => {
    const episodesQuery = createResolvedQuery([
      {
        id: episodeId,
        clinic_id: clinicId,
        customer_id: '123e4567-e89b-12d3-a456-426614174001',
      },
    ]);
    const itemsQuery = createResolvedQuery([
      {
        id: 'item-1',
        care_episode_id: episodeId,
        report_date: '2026-05-01',
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'item-2',
        care_episode_id: episodeId,
        report_date: '2026-05-02',
        created_at: '2026-05-02T00:00:00.000Z',
      },
      {
        id: 'item-3',
        care_episode_id: episodeId,
        report_date: '2026-05-03',
        created_at: '2026-05-03T00:00:00.000Z',
      },
      {
        id: 'item-4',
        care_episode_id: episodeId,
        report_date: '2026-05-04',
        created_at: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'item-5',
        care_episode_id: episodeId,
        report_date: '2026-05-05',
        created_at: '2026-05-05T00:00:00.000Z',
      },
    ]);
    const updateResult = Promise.resolve({ error: null });
    const updateQuery = {
      eq: jest.fn().mockReturnThis(),
      then: updateResult.then.bind(updateResult),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemsQuery),
      update: jest.fn().mockReturnValue(updateQuery),
    };
    const careEpisodesTable = {
      select: jest.fn().mockReturnValue(episodesQuery),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'care_episodes') return careEpisodesTable;
        if (table === 'daily_report_items') return dailyReportItemsTable;
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
      '@/app/api/care-episodes/recalculate-visit-stages/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost/api/care-episodes/recalculate-visit-stages',
        { method: 'POST' }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        visit_ordinal_in_episode: 1,
        visit_stage_code: 'first_visit',
        updated_by: 'user-1',
      })
    );
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        visit_ordinal_in_episode: 2,
        visit_stage_code: 'second_visit',
      })
    );
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        visit_ordinal_in_episode: 5,
        visit_stage_code: 'fifth_visit',
      })
    );
    expect(json.data).toEqual({
      episodeCount: 1,
      updatedItemCount: 5,
    });
  });
});

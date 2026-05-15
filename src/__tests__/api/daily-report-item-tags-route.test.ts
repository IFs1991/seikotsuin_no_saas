import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

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

const processApiRequestMock = processApiRequest as jest.Mock;
const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const itemId = '123e4567-e89b-12d3-a456-426614174010';
const tagId = '123e4567-e89b-12d3-a456-426614174020';

const staffPermissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

const managerPermissions = {
  role: 'manager',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

describe('/api/daily-reports/items/[id]/tags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST upserts a tag after checking the item and active definition', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: itemId },
        error: null,
      }),
    };
    const definitionQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { code: 'TRAFFIC_ACCIDENT_REVIEW' },
        error: null,
      }),
    };
    const upsertSelect = {
      single: jest.fn().mockResolvedValue({
        data: {
          id: tagId,
          clinic_id: clinicId,
          daily_report_item_id: itemId,
          tag_code: 'TRAFFIC_ACCIDENT_REVIEW',
          note: null,
          created_by: 'user-1',
          updated_by: 'user-1',
          created_at: '2026-05-14T00:00:00.000Z',
          updated_at: '2026-05-14T00:00:00.000Z',
        },
        error: null,
      }),
    };
    const tagsTable = {
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(upsertSelect),
      }),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') {
          return { select: jest.fn().mockReturnValue(itemQuery) };
        }
        if (table === 'daily_report_item_tag_definitions') {
          return { select: jest.fn().mockReturnValue(definitionQuery) };
        }
        if (table === 'daily_report_item_tags') return tagsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        tagCode: 'TRAFFIC_ACCIDENT_REVIEW',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: staffPermissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } =
      await import('@/app/api/daily-reports/items/[id]/tags/route');
    const response = await POST(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/tags`,
        { method: 'POST' }
      ),
      { params: Promise.resolve({ id: itemId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(tagsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        daily_report_item_id: itemId,
        tag_code: 'TRAFFIC_ACCIDENT_REVIEW',
        created_by: 'user-1',
        updated_by: 'user-1',
      }),
      { onConflict: 'daily_report_item_id,tag_code' }
    );
    expect(json.data).toMatchObject({
      id: tagId,
      dailyReportItemId: itemId,
      tagCode: 'TRAFFIC_ACCIDENT_REVIEW',
    });
  });

  test('DELETE removes a tag for manager-scoped users', async () => {
    const itemQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: itemId },
        error: null,
      }),
    };
    const deleteQuery = {
      eq: jest.fn().mockReturnThis(),
      then: Promise.resolve({ error: null }).then.bind(
        Promise.resolve({ error: null })
      ),
    };
    const tagsTable = {
      delete: jest.fn().mockReturnValue(deleteQuery),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') {
          return { select: jest.fn().mockReturnValue(itemQuery) };
        }
        if (table === 'daily_report_item_tags') return tagsTable;
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: managerPermissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { DELETE } =
      await import('@/app/api/daily-reports/items/[id]/tags/[tagCode]/route');
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/tags/TRAFFIC_ACCIDENT_REVIEW?clinic_id=${clinicId}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          id: itemId,
          tagCode: 'TRAFFIC_ACCIDENT_REVIEW',
        }),
      }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        clinicId,
        requireClinicMatch: true,
        allowedRoles: expect.arrayContaining(['manager']),
      })
    );
    expect(tagsTable.delete).toHaveBeenCalled();
    expect(json.data).toEqual({ deleted: true });
  });
});

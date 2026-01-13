import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
    logDataExport: jest.fn(),
  },
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const logAdminActionMock = AuditLogger.logAdminAction as jest.Mock;
const logDataExportMock = AuditLogger.logDataExport as jest.Mock;

describe('admin master data operations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('exports system settings and stores snapshot', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const queryBuilder = {
      order: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      then: (resolve: any) =>
        Promise.resolve(
          resolve({
            data: [
              {
                id: 'setting-1',
                clinic_id: null,
                key: 'system_theme',
                value: '"dark"',
                data_type: 'string',
                description: 'theme',
                is_editable: true,
                is_public: false,
                display_order: 1,
                updated_at: null,
                updated_by: null,
              },
            ],
            error: null,
          })
        ),
    };
    const selectMock = jest.fn().mockReturnValue(queryBuilder);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'system_settings') {
          return { select: selectMock };
        }
        if (table === 'temporary_data') {
          return { upsert: upsertMock };
        }
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase,
    });

    const { GET } = await import(
      '@/app/api/admin/master-data/export/route'
    );

    const response = await GET({
      url: 'https://example.com/api/admin/master-data/export?clinic_id=global',
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({
      name: 'system_theme',
      value: 'dark',
    });
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          key: expect.stringContaining('system_settings_snapshot'),
          data: expect.objectContaining({ items: expect.any(Array) }),
        }),
      ],
      { onConflict: 'key' }
    );
    expect(logDataExportMock).toHaveBeenCalled();
  });

  it('imports system settings and logs audit action', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'system_settings') {
          return { upsert: upsertMock };
        }
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-2', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase,
      body: {
        items: [
          {
            name: 'system_timezone',
            value: 'Asia/Tokyo',
            data_type: 'string',
            clinic_id: null,
          },
        ],
      },
    });

    const { POST } = await import(
      '@/app/api/admin/master-data/import/route'
    );

    const response = await POST({
      url: 'https://example.com/api/admin/master-data/import',
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          key: 'system_timezone',
          value: '"Asia/Tokyo"',
        }),
      ],
      { onConflict: 'clinic_id,key' }
    );
    expect(logAdminActionMock).toHaveBeenCalled();
  });

  it('rolls back system settings from snapshot', async () => {
    const selectSnapshotMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            data: {
              items: [
                {
                  name: 'system_timezone',
                  value: 'Asia/Tokyo',
                  data_type: 'string',
                  clinic_id: null,
                },
              ],
            },
          },
          error: null,
        }),
      }),
    });
    const deleteMock = jest.fn().mockReturnValue({
      is: jest.fn().mockResolvedValue({ error: null }),
    });
    const insertMock = jest.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'temporary_data') {
          return { select: selectSnapshotMock };
        }
        if (table === 'system_settings') {
          return {
            delete: deleteMock,
            insert: insertMock,
          };
        }
        return {};
      }),
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-3', email: 'admin@example.com', role: 'admin' },
      permissions: { role: 'admin', clinic_id: null },
      supabase,
      body: {},
    });

    const { POST } = await import(
      '@/app/api/admin/master-data/rollback/route'
    );

    const response = await POST({
      url: 'https://example.com/api/admin/master-data/rollback',
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        key: 'system_timezone',
        value: '"Asia/Tokyo"',
      }),
    ]);
  });
});

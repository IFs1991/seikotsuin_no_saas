import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => ({
  resolveScopedClinicIds: jest.fn(
    (permissions: {
      clinic_id: string | null;
      clinic_scope_ids?: string[] | null;
    }) =>
      Array.isArray(permissions.clinic_scope_ids)
        ? permissions.clinic_scope_ids
        : permissions.clinic_id
          ? [permissions.clinic_id]
          : null
  ),
}));

jest.mock('@/lib/billing/business-write', () => ({
  ensureScopedBusinessWriteAccess: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const ensureScopedBusinessWriteAccessMock = jest.mocked(
  ensureScopedBusinessWriteAccess
);
const clinicPrimary = '11111111-1111-4111-8111-111111111111';
const clinicSubset = '22222222-2222-4222-8222-222222222222';

function buildPermissions() {
  return {
    role: 'clinic_admin',
    clinic_id: clinicPrimary,
    clinic_scope_ids: [clinicSubset],
  };
}

describe('Blocks API canonical authority scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureScopedBusinessWriteAccessMock.mockResolvedValue({ mode: 'bypass' });
  });

  it('GET accepts the requested clinic in a valid JWT subset', async () => {
    const clinicEq = jest.fn().mockReturnThis();
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: clinicEq,
      order,
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: buildPermissions(),
      supabase: { from: jest.fn(() => query) },
    });

    const { GET } = await import('@/app/api/blocks/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/blocks?clinic_id=${clinicSubset}`)
    );

    expect(response.status).toBe(200);
    expect(clinicEq).toHaveBeenCalledWith('resources.clinic_id', clinicSubset);
    expect(clinicEq).not.toHaveBeenCalledWith(
      'resources.clinic_id',
      clinicPrimary
    );
  });

  it('POST writes to the valid JWT subset instead of the DB primary', async () => {
    const resourceSingle = jest.fn().mockResolvedValue({
      data: { id: 'resource-1', clinic_id: clinicSubset },
      error: null,
    });
    const resourceQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: resourceSingle,
    };
    const insert = jest.fn().mockReturnThis();
    const blocksQuery = {
      insert,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'block-1', clinic_id: clinicSubset },
        error: null,
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: buildPermissions(),
      body: {
        resourceId: 'resource-1',
        startTime: '2026-07-15T09:00:00.000Z',
        endTime: '2026-07-15T10:00:00.000Z',
      },
      supabase: {
        from: jest.fn((table: string) =>
          table === 'resources' ? resourceQuery : blocksQuery
        ),
      },
    });

    const { POST } = await import('@/app/api/blocks/route');
    const response = await POST(
      new NextRequest('http://localhost/api/blocks', { method: 'POST' })
    );

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: clinicSubset })
    );
    expect(insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: clinicPrimary })
    );
  });

  it('DELETE checks the valid JWT subset instead of the DB primary', async () => {
    const selectSingle = jest.fn().mockResolvedValue({
      data: { id: 'block-1', clinic_id: clinicSubset },
      error: null,
    });
    const deleteQuery = {
      error: null,
      eq: jest.fn(),
    };
    deleteQuery.eq.mockReturnValue(deleteQuery);
    const query = {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: selectSingle })),
      })),
      delete: jest.fn(() => deleteQuery),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: buildPermissions(),
      supabase: { from: jest.fn(() => query) },
    });

    const { DELETE } = await import('@/app/api/blocks/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/blocks?id=block-1', {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(200);
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'block-1');
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(
      2,
      'clinic_id',
      clinicSubset
    );
  });

  it('POST returns the billing AppError before reading or writing resources', async () => {
    const from = jest.fn();
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: buildPermissions(),
      body: {
        resourceId: 'resource-1',
        startTime: '2026-07-15T09:00:00.000Z',
        endTime: '2026-07-15T10:00:00.000Z',
      },
      supabase: { from },
    });
    ensureScopedBusinessWriteAccessMock.mockRejectedValueOnce(
      new AppError(
        ERROR_CODES.SUBSCRIPTION_INACTIVE,
        '有効な契約が必要です',
        402
      )
    );

    const { POST } = await import('@/app/api/blocks/route');
    const response = await POST(
      new NextRequest('http://localhost/api/blocks', { method: 'POST' })
    );

    expect(response.status).toBe(402);
    expect(from).not.toHaveBeenCalled();
  });

  it('DELETE returns the billing AppError before reading or deleting blocks', async () => {
    const from = jest.fn();
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: buildPermissions(),
      supabase: { from },
    });
    ensureScopedBusinessWriteAccessMock.mockRejectedValueOnce(
      new AppError(
        ERROR_CODES.BILLING_CONFIGURATION_ERROR,
        '課金設定を確認できません',
        503
      )
    );

    const { DELETE } = await import('@/app/api/blocks/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/blocks?id=block-1', {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });
});

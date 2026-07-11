import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createScopedAdminContext } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return { ...actual, processApiRequest: jest.fn() };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return { ...actual, createScopedAdminContext: jest.fn() };
});

jest.mock('@/lib/audit-logger', () => {
  const actual = jest.requireActual('@/lib/audit-logger');
  return {
    ...actual,
    AuditLogger: { logDataExport: jest.fn() },
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);
const logDataExportMock = jest.mocked(AuditLogger.logDataExport);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const permissions = {
  role: 'clinic_admin',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function createExportQuery(rows: readonly Record<string, unknown>[]) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    returns: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.returns.mockResolvedValue({ data: rows, error: null });
  return query;
}

function allowClinicExport() {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'admin-user',
      email: 'clinic-admin@example.com',
      role: 'clinic_admin',
    },
    permissions,
    supabase: { from: jest.fn() },
  });
}

describe('GET /api/exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logDataExportMock.mockResolvedValue(undefined);
  });

  it('exports an allowlisted clinic customer CSV with safe fields and an audit event', async () => {
    const query = createExportQuery([
      {
        id: 'customer-1',
        name: '=SUM(1,1)',
        phone: '090-0000-0000',
        email: 'patient@example.com',
        created_at: '2026-07-10T00:00:00.000Z',
        updated_at: '2026-07-10T00:00:00.000Z',
        notes: 'must-not-leak',
      },
    ]);
    const from = jest.fn().mockReturnValue(query);
    const assertClinicInScope = jest.fn();
    allowClinicExport();
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/exports/route');
    const request = new NextRequest(
      `http://localhost/api/exports?clinic_id=${clinicId}&resource=customers&limit=25`,
      { headers: { 'x-forwarded-for': '203.0.113.10' } }
    );
    const response = await GET(request);
    const bodyBytes = new Uint8Array(await response.clone().arrayBuffer());
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/csv; charset=utf-8'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="clinic-customers-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(Array.from(bodyBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain('"\'=SUM(1,1)"');
    expect(csv).not.toContain('must-not-leak');

    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: ['admin', 'clinic_admin'],
    });
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(from).toHaveBeenCalledWith('customers');
    expect(query.select).toHaveBeenCalledWith(
      'id, name, phone, email, created_at, updated_at'
    );
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(query.eq).toHaveBeenCalledWith('is_deleted', false);
    expect(query.limit).toHaveBeenCalledWith(25);
    expect(logDataExportMock).toHaveBeenCalledWith(
      'admin-user',
      'clinic-admin@example.com',
      'clinic_customers_csv',
      1,
      clinicId,
      '203.0.113.10'
    );
  });

  it.each([
    ['reservations', 'reservations'],
    ['daily_reports', 'daily_reports'],
  ])('uses the fixed %s export branch only', async (resource, table) => {
    const query = createExportQuery([]);
    const from = jest.fn().mockReturnValue(query);
    allowClinicExport();
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/exports/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/exports?clinic_id=${clinicId}&resource=${resource}`
      )
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith(table);
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
  });

  it('returns the tenant-scope denial before creating a service-role client', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: 'このクリニックへのアクセス権がありません' },
        { status: 403 }
      ),
    });

    const { GET } = await import('@/app/api/exports/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/exports?clinic_id=${clinicId}&resource=customers`
      )
    );

    expect(response.status).toBe(403);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(logDataExportMock).not.toHaveBeenCalled();
  });

  it('returns the staff role denial before querying export data', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: 'この操作を実行する権限がありません' },
        { status: 403 }
      ),
    });

    const { GET } = await import('@/app/api/exports/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/exports?clinic_id=${clinicId}&resource=reservations`
      )
    );

    expect(response.status).toBe(403);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it.each([
    'resource=audit_logs',
    'resource=customers&limit=5001',
    'resource=customers&table=customers',
  ])('rejects unsupported or unbounded query input: %s', async query => {
    const { GET } = await import('@/app/api/exports/route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/exports?clinic_id=${clinicId}&${query}`
      )
    );

    expect(response.status).toBe(400);
    expect(processApiRequestMock).not.toHaveBeenCalled();
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });
});

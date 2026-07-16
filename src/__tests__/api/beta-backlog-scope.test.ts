import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => ({
  canAccessClinicScope: jest.fn(
    (
      permissions: { clinic_scope_ids?: readonly string[] | null },
      clinicId: string
    ) => permissions.clinic_scope_ids?.includes(clinicId) ?? false
  ),
  resolveScopedClinicIds: jest.fn(
    (permissions: { clinic_scope_ids?: readonly string[] | null }) =>
      permissions.clinic_scope_ids
        ? Array.from(permissions.clinic_scope_ids)
        : null
  ),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const processApiRequestMock = jest.mocked(processApiRequest);

const backlogId = '11111111-1111-4111-8111-111111111111';
const clinicA = '22222222-2222-4222-8222-222222222222';
const clinicB = '33333333-3333-4333-8333-333333333333';
const affectedClinics = [clinicA, clinicB];

const permissions = {
  role: 'admin',
  clinic_id: clinicA,
  clinic_scope_ids: affectedClinics,
};

describe('/api/beta/backlog existing-scope write binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PATCH requires the affected_clinics value read before the update', async () => {
    const scopeQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { affected_clinics: affectedClinics, started_at: null },
        error: null,
      }),
    };
    const mutationQuery = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: backlogId, affected_clinics: affectedClinics },
        error: null,
      }),
    };
    const table = {
      select: jest.fn(() => scopeQuery),
      update: jest.fn(() => mutationQuery),
    };
    const supabase = { from: jest.fn(() => table) };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-user', email: 'admin@example.com', role: 'admin' },
      permissions,
      body: { id: backlogId, title: 'Updated backlog title' },
      supabase,
    });

    const { PATCH } = await import('@/app/api/beta/backlog/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/beta/backlog', { method: 'PATCH' })
    );

    expect(response.status).toBe(200);
    expect(mutationQuery.eq).toHaveBeenNthCalledWith(1, 'id', backlogId);
    expect(mutationQuery.eq).toHaveBeenNthCalledWith(
      2,
      'affected_clinics',
      affectedClinics
    );
  });

  it('DELETE requires the affected_clinics value read before the delete', async () => {
    const scopeQuery = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { affected_clinics: affectedClinics },
        error: null,
      }),
    };
    const deleteQuery = {
      error: null,
      eq: jest.fn(),
    };
    deleteQuery.eq.mockReturnValue(deleteQuery);
    const table = {
      select: jest.fn(() => scopeQuery),
      delete: jest.fn(() => deleteQuery),
    };
    const supabase = { from: jest.fn(() => table) };
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'admin-user', email: 'admin@example.com', role: 'admin' },
      permissions,
      supabase,
    });

    const { DELETE } = await import('@/app/api/beta/backlog/route');
    const response = await DELETE(
      new NextRequest(`http://localhost/api/beta/backlog?id=${backlogId}`, {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(200);
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(1, 'id', backlogId);
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(
      2,
      'affected_clinics',
      affectedClinics
    );
  });
});

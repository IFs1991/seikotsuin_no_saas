import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import {
  CLINIC_PRICING_ADMIN_ROLES,
  STAFF_ROLES,
} from '@/lib/constants/roles';

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
const customerId = '123e4567-e89b-12d3-a456-426614174100';

const coverageRow = {
  id: 'coverage-1',
  clinic_id: clinicId,
  customer_id: customerId,
  payer_context_code: 'insurance',
  patient_burden_rate: 30,
  effective_from: '2026-04-01',
  effective_to: null,
  verification_status: 'confirmed',
  verified_at: '2026-04-01T00:00:00.000Z',
  verified_by: 'user-1',
  notes: '保険証確認済み',
  created_by: 'user-1',
  updated_by: 'user-1',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

describe('/api/customers/[customerId]/insurance-coverages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the current coverage for staff-scoped reads', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [coverageRow],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order }) });
    const select = jest.fn().mockReturnValue({ eq });
    const assertClinicInScope = jest.fn();

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest.fn().mockReturnValue({ select }),
      },
      assertClinicInScope,
    });

    const { GET } = await import(
      '@/app/api/customers/[customerId]/insurance-coverages/route'
    );
    const response = await GET(
      new NextRequest(
        `http://localhost/api/customers/${customerId}/insurance-coverages?clinic_id=${clinicId}&date=2026-05-01`
      ),
      { params: Promise.resolve({ customerId }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(expect.any(NextRequest), {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: Array.from(STAFF_ROLES),
    });
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(body.data.current).toMatchObject({
      id: 'coverage-1',
      clinicId,
      customerId,
      patientBurdenRate: 30,
      verificationStatus: 'confirmed',
    });
    expect(body.data.requiresReview).toBe(false);
  });

  it('creates coverage defaults only for clinic pricing admins', async () => {
    const single = jest.fn().mockResolvedValue({
      data: coverageRow,
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const assertClinicInScope = jest.fn();

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        patientBurdenRate: 30,
        effectiveFrom: '2026-04-01',
        effectiveTo: null,
        verificationStatus: 'confirmed',
        notes: '保険証確認済み',
      },
      auth: { id: 'user-1', email: 'admin@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest.fn().mockReturnValue({ insert }),
      },
      assertClinicInScope,
    });

    const { POST } = await import(
      '@/app/api/customers/[customerId]/insurance-coverages/route'
    );
    const response = await POST(
      new NextRequest(
        `http://localhost/api/customers/${customerId}/insurance-coverages`,
        { method: 'POST' }
      ),
      { params: Promise.resolve({ customerId }) }
    );

    expect(response.status).toBe(201);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(Object),
      { allowedRoles: Array.from(CLINIC_PRICING_ADMIN_ROLES) }
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: clinicId,
        customer_id: customerId,
        payer_context_code: 'insurance',
        patient_burden_rate: 30,
        effective_from: '2026-04-01',
        verification_status: 'confirmed',
        created_by: 'user-1',
        updated_by: 'user-1',
      })
    );
  });
});

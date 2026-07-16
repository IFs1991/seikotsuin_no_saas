import { NextRequest, NextResponse } from 'next/server';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';

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
const itemId = '123e4567-e89b-12d3-a456-426614174001';

describe('POST /api/daily-reports/items/[id]/pricing/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('confirms pricing through the service-scoped RPC for staff roles', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          daily_report_item_id: itemId,
          revenue_estimate_id: 'estimate-1',
          estimate_status: 'calculated',
          estimated_total: 2000,
          pricing_snapshot_status: 'confirmed',
          patient_burden_rate: 30,
        },
      ],
      error: null,
    });
    const assertClinicInScope = jest.fn();

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        patientBurdenRateOverride: 30,
        manualEstimatedAmount: null,
        updateCustomerCoverage: true,
        confirmationNote: '保険証確認済み',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { rpc },
      assertClinicInScope,
    });

    const { POST } =
      await import('@/app/api/daily-reports/items/[id]/pricing/confirm/route');
    const response = await POST(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/pricing/confirm`,
        {
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ id: itemId }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(Object),
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    // SQL default-null parameters are omitted when the caller supplies no value.
    expect(rpc).toHaveBeenCalledWith('confirm_daily_report_item_pricing', {
      p_clinic_id: clinicId,
      p_daily_report_item_id: itemId,
      p_patient_burden_rate_override: 30,
      p_update_customer_coverage: true,
      p_confirmation_note: '保険証確認済み',
      p_actor_user_id: 'user-1',
    });
    expect(body).toEqual({
      success: true,
      data: {
        dailyReportItemId: itemId,
        revenueEstimateId: 'estimate-1',
        estimateStatus: 'calculated',
        estimatedTotal: 2000,
        pricingSnapshotStatus: 'confirmed',
        patientBurdenRate: 30,
      },
    });
  });

  it('rejects non-uuid item ids before authorization and RPC execution', async () => {
    const rpc = jest.fn();
    createScopedAdminContextMock.mockReturnValue({
      client: { rpc },
      assertClinicInScope: jest.fn(),
    });

    const { POST } =
      await import('@/app/api/daily-reports/items/[id]/pricing/confirm/route');
    const response = await POST(
      new NextRequest(
        'http://localhost/api/daily-reports/items/not-a-uuid/pricing/confirm',
        { method: 'POST' }
      ),
      { params: Promise.resolve({ id: 'not-a-uuid' }) }
    );

    expect(response.status).toBe(400);
    expect(processClinicScopedBodyMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not call the RPC when role validation fails', async () => {
    const rpc = jest.fn();
    processClinicScopedBodyMock.mockResolvedValue({
      success: false,
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { rpc },
      assertClinicInScope: jest.fn(),
    });

    const { POST } =
      await import('@/app/api/daily-reports/items/[id]/pricing/confirm/route');
    const response = await POST(
      new NextRequest(
        `http://localhost/api/daily-reports/items/${itemId}/pricing/confirm`,
        {
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ id: itemId }) }
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

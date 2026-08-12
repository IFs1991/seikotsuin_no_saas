import { NextRequest, NextResponse } from 'next/server';
import {
  ClinicInactiveError,
  ClinicNotFoundError,
  createPublicClinicContext,
} from '@/lib/supabase/scoped-admin';
import { verifyPublicLineMyPageAuth } from '@/lib/line/public-my-page-auth';
import { createCrmAdminClient } from '@/lib/crm-line/db';
import {
  listLineStaffPreferences,
  setLineStaffPreference,
  StaffPreferenceHistoryRequiredError,
} from '@/lib/services/patient-staff-preference-service';
import {
  publicStaffPreferenceUpdateSchema,
  publicStaffPreferencesQuerySchema,
} from '../schema';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers },
  });
}

async function createClinicContextOrResponse(clinicId: string) {
  try {
    return await createPublicClinicContext(clinicId);
  } catch (error) {
    if (error instanceof ClinicNotFoundError) {
      return noStoreJson(
        { success: false, error: 'Clinic not found' },
        { status: 404 }
      );
    }
    if (error instanceof ClinicInactiveError) {
      return noStoreJson(
        { success: false, error: 'Clinic is not accepting reservations' },
        { status: 403 }
      );
    }
    throw error;
  }
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof Response;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = publicStaffPreferencesQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    });
    if (!parsed.success) {
      return noStoreJson(
        {
          success: false,
          error: 'Validation error',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const clinicCtx = await createClinicContextOrResponse(
      parsed.data.clinic_id
    );
    if (isResponse(clinicCtx)) return clinicCtx;
    const auth = await verifyPublicLineMyPageAuth({
      headers: request.headers,
      supabase: clinicCtx.client,
      clinicId: parsed.data.clinic_id,
    });
    if (!auth.ok) {
      return noStoreJson(
        { success: false, error: 'LINE authentication is required' },
        { status: 401 }
      );
    }

    const data = await listLineStaffPreferences(createCrmAdminClient(), {
      clinicId: parsed.data.clinic_id,
      lineUserId: auth.lineUserId,
    });
    return noStoreJson({ success: true, data });
  } catch (error) {
    console.error('Public staff preferences GET error:', error);
    return noStoreJson(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson(
        { success: false, error: 'Invalid JSON data' },
        { status: 400 }
      );
    }
    const parsed = publicStaffPreferenceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson(
        {
          success: false,
          error: 'Validation error',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const clinicCtx = await createClinicContextOrResponse(
      parsed.data.clinic_id
    );
    if (isResponse(clinicCtx)) return clinicCtx;
    const auth = await verifyPublicLineMyPageAuth({
      headers: request.headers,
      supabase: clinicCtx.client,
      clinicId: parsed.data.clinic_id,
    });
    if (!auth.ok) {
      return noStoreJson(
        { success: false, error: 'LINE authentication is required' },
        { status: 401 }
      );
    }

    const row = await setLineStaffPreference(createCrmAdminClient(), {
      clinicId: parsed.data.clinic_id,
      lineUserId: auth.lineUserId,
      staffId: parsed.data.staff_id,
      notificationEnabled: parsed.data.notification_enabled,
    });
    return noStoreJson({
      success: true,
      data: {
        staff_id: row.staff_id,
        notification_enabled: row.notification_enabled,
      },
    });
  } catch (error) {
    if (error instanceof StaffPreferenceHistoryRequiredError) {
      return noStoreJson(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    console.error('Public staff preferences PUT error:', error);
    return noStoreJson(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

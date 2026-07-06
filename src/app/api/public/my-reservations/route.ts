import { NextRequest, NextResponse } from 'next/server';
import {
  ClinicInactiveError,
  ClinicNotFoundError,
  createPublicClinicContext,
} from '@/lib/supabase/scoped-admin';
import { verifyPublicLineMyPageAuth } from '@/lib/line/public-my-page-auth';
import {
  PublicMyPageCustomerNotFoundError,
  PublicMyPageService,
} from '@/lib/services/public-my-page-service';
import {
  myReservationsConsentUpdateSchema,
  myReservationsQuerySchema,
} from '../schema';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
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
    const parsed = myReservationsQuerySchema.safeParse({
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
    if (isResponse(clinicCtx)) {
      return clinicCtx;
    }

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

    const service = new PublicMyPageService(
      clinicCtx.client,
      parsed.data.clinic_id
    );
    const data = await service.getMyReservations(auth.lineUserId);

    return noStoreJson({ success: true, data });
  } catch (error) {
    console.error('Public my-reservations API error:', error);
    return noStoreJson(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const parsed = myReservationsConsentUpdateSchema.safeParse(body);
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
    if (isResponse(clinicCtx)) {
      return clinicCtx;
    }

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

    const service = new PublicMyPageService(
      clinicCtx.client,
      parsed.data.clinic_id
    );
    const data = await service.updateMarketingConsent(
      auth.lineUserId,
      parsed.data.consent_marketing
    );

    return noStoreJson({ success: true, data });
  } catch (error) {
    if (error instanceof PublicMyPageCustomerNotFoundError) {
      return noStoreJson(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    console.error('Public my-reservations consent API error:', error);
    return noStoreJson(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

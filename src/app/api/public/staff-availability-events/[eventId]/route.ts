import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ClinicInactiveError,
  ClinicNotFoundError,
  createPublicClinicContext,
} from '@/lib/supabase/scoped-admin';
import { verifyPublicLineMyPageAuth } from '@/lib/line/public-my-page-auth';
import { createCrmAdminClient } from '@/lib/crm-line/db';
import {
  getPublicStaffAvailabilityEvent,
  StaffAvailabilityNotFoundError,
  StaffAvailabilityUnavailableError,
} from '@/lib/services/staff-availability-service';
import { publicStaffAvailabilityEventQuerySchema } from '../../schema';

const eventIdSchema = z.string().uuid('eventId must be a valid UUID');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;
    const parsedEventId = eventIdSchema.safeParse(eventId);
    const parsedQuery = publicStaffAvailabilityEventQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    });
    if (!parsedEventId.success || !parsedQuery.success) {
      return noStoreJson(
        { success: false, error: 'Validation error' },
        { status: 400 }
      );
    }

    let clinicContext;
    try {
      clinicContext = await createPublicClinicContext(
        parsedQuery.data.clinic_id
      );
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

    const auth = await verifyPublicLineMyPageAuth({
      headers: request.headers,
      supabase: clinicContext.client,
      clinicId: parsedQuery.data.clinic_id,
    });
    if (!auth.ok) {
      return noStoreJson(
        { success: false, error: 'LINE authentication is required' },
        { status: 401 }
      );
    }

    const event = await getPublicStaffAvailabilityEvent(
      createCrmAdminClient(),
      {
        clinicId: parsedQuery.data.clinic_id,
        eventId: parsedEventId.data,
        lineUserId: auth.lineUserId,
      }
    );
    return noStoreJson({ success: true, data: event });
  } catch (error) {
    if (error instanceof StaffAvailabilityNotFoundError) {
      return noStoreJson(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    if (error instanceof StaffAvailabilityUnavailableError) {
      return noStoreJson(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    console.error('Public staff availability event GET error:', error);
    return noStoreJson(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

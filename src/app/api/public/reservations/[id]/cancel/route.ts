import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ClinicInactiveError,
  ClinicNotFoundError,
  createPublicClinicContext,
} from '@/lib/supabase/scoped-admin';
import { verifyPublicLineMyPageAuth } from '@/lib/line/public-my-page-auth';
import { logger } from '@/lib/logger';
import { enqueuePublicReservationCancellationNotification } from '@/lib/notifications/reservation-notifications';
import {
  PublicMyPageCancellationDeadlineError,
  PublicMyPageCancellationNotAllowedError,
  PublicMyPageReservationNotFoundError,
  PublicMyPageService,
} from '@/lib/services/public-my-page-service';
import { publicReservationCancelSchema } from '../../../schema';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

const reservationIdSchema = z.string().uuid('id must be a valid UUID');

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const parsedId = reservationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return noStoreJson(
        {
          success: false,
          error: 'Validation error',
          details: parsedId.error.flatten(),
        },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson(
        { success: false, error: 'Invalid JSON data' },
        { status: 400 }
      );
    }

    const parsedBody = publicReservationCancelSchema.safeParse(body);
    if (!parsedBody.success) {
      return noStoreJson(
        {
          success: false,
          error: 'Validation error',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const clinicCtx = await createClinicContextOrResponse(
      parsedBody.data.clinic_id
    );
    if (isResponse(clinicCtx)) {
      return clinicCtx;
    }

    const auth = await verifyPublicLineMyPageAuth({
      headers: request.headers,
      supabase: clinicCtx.client,
      clinicId: parsedBody.data.clinic_id,
    });
    if (!auth.ok) {
      return noStoreJson(
        { success: false, error: 'LINE authentication is required' },
        { status: 401 }
      );
    }

    const service = new PublicMyPageService(
      clinicCtx.client,
      parsedBody.data.clinic_id
    );
    const result = await service.cancelReservation(
      parsedId.data,
      auth.lineUserId
    );

    try {
      await enqueuePublicReservationCancellationNotification(clinicCtx.client, {
        clinicId: parsedBody.data.clinic_id,
        clinicName: clinicCtx.clinic.name,
        reservation: result.reservation,
        customer: result.customer,
      });
    } catch (error) {
      logger.error('Failed to enqueue public reservation cancellation notice', {
        clinicId: parsedBody.data.clinic_id,
        reservationId: parsedId.data,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return noStoreJson({
      success: true,
      data: {
        reservation_id: result.reservation.id,
        status: result.reservation.status,
        updated_at: result.reservation.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof PublicMyPageReservationNotFoundError) {
      return noStoreJson(
        { success: false, error: 'Reservation not found' },
        { status: 404 }
      );
    }

    if (error instanceof PublicMyPageCancellationDeadlineError) {
      return noStoreJson(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    if (error instanceof PublicMyPageCancellationNotAllowedError) {
      return noStoreJson(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    console.error('Public reservation cancellation API error:', error);
    return noStoreJson(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

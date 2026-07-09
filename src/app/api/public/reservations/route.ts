/**
 * POST /api/public/reservations
 *
 * Non-authenticated customer API for creating reservations.
 * Uses service role to bypass RLS, with explicit clinic_id validation.
 *
 * Business logic is delegated to PublicReservationService.
 *
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-06)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClinicContext,
  ClinicNotFoundError,
  ClinicInactiveError,
} from '@/lib/supabase/scoped-admin';
import {
  PublicReservationService,
  BookingDisabledError,
  MenuNotFoundError,
  ResourceNotFoundError,
  SlotConflictError,
  CustomerLookupError,
  CustomerCreateError,
  ReservationCreateError,
  BookingFormValidationError,
  type ReservationResult,
} from '@/lib/services/public-reservation-service';
import type {
  BookingFormResponseValue,
  IntakeResponseSnapshot,
} from '@/lib/booking-form/settings';
import { verifyLineIdTokenForClinic } from '@/lib/line/id-token';
import { enqueuePublicReservationNotifications } from '@/lib/notifications/reservation-notifications';
import { logger } from '@/lib/logger';
import { ERROR_CODES } from '@/lib/error-handler';
import { PublicBookingTimeValidationError } from '@/lib/services/public-availability-service';
import { verifyTurnstileForPublicReservation } from '@/lib/turnstile';
import {
  markOutreachRecipientBooked,
  resolveOutreachAttribution,
  type OutreachAttribution,
} from '@/lib/outreach';
import { reservationCreateSchema } from '../schema';

function formatIntakeResponseValue(
  value: IntakeResponseSnapshot['value']
): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }
  return value;
}

function formatIntakeSummary(snapshots: IntakeResponseSnapshot[]): string[] {
  return snapshots.map(
    snapshot =>
      `${snapshot.label}: ${formatIntakeResponseValue(snapshot.value)}`
  );
}

function getRequestIp(request: NextRequest): string | undefined {
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.trim();
  if (!forwardedFor) {
    return undefined;
  }

  return forwardedFor.split(',')[0]?.trim() || undefined;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON data' },
        { status: 400 }
      );
    }

    // Validate input
    const parsed = reservationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const {
      clinic_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_name_kana,
      birth_date,
      gender,
      menu_id,
      resource_id,
      start_time,
      notes,
      intake_responses,
      consents,
      line_id_token,
      turnstile_token,
      campaign_id,
    } = parsed.data;
    let channel: 'web' | 'line' = 'web';

    // Validate clinic exists and is active
    let clinicCtx;
    try {
      clinicCtx = await createPublicClinicContext(clinic_id);
    } catch (e) {
      if (e instanceof ClinicNotFoundError) {
        return NextResponse.json(
          { success: false, error: 'Clinic not found' },
          { status: 404 }
        );
      }
      if (e instanceof ClinicInactiveError) {
        return NextResponse.json(
          { success: false, error: 'Clinic is not accepting reservations' },
          { status: 403 }
        );
      }
      throw e;
    }

    const service = new PublicReservationService(clinicCtx.client, clinic_id);

    // Check booking settings
    try {
      await service.checkBookingEnabled();
    } catch (e) {
      if (e instanceof BookingDisabledError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 403 }
        );
      }
      console.error('Clinic settings lookup error:', e);
      return NextResponse.json(
        { success: false, error: 'Failed to verify online booking settings' },
        { status: 500 }
      );
    }

    let lineProfile:
      | { lineUserId: string; displayName: string | null }
      | undefined;
    if (line_id_token) {
      try {
        const lineVerification = await verifyLineIdTokenForClinic({
          supabase: clinicCtx.client,
          clinicId: clinic_id,
          idToken: line_id_token,
        });
        if (lineVerification.ok === true) {
          channel = 'line';
          lineProfile = {
            lineUserId: lineVerification.lineUserId,
            displayName: lineVerification.displayName,
          };
        } else {
          logger.warn(
            'LINE ID token verification failed; falling back to web',
            {
              clinicId: clinic_id,
              reason: lineVerification.reason,
              status: lineVerification.status,
            }
          );
        }
      } catch (error) {
        logger.warn('LINE ID token verification threw; falling back to web', {
          clinicId: clinic_id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    const turnstileResult = await verifyTurnstileForPublicReservation({
      token: turnstile_token,
      skipForVerifiedLine: lineProfile !== undefined,
      remoteIp: getRequestIp(request),
    });
    if (!turnstileResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'CAPTCHA verification failed',
          code: ERROR_CODES.CAPTCHA_FAILED,
        },
        { status: 400 }
      );
    }

    let intakeResponseSnapshots: IntakeResponseSnapshot[];
    try {
      const normalizedIntakeResponses = intake_responses.filter(
        (
          response
        ): response is { id: string; value: BookingFormResponseValue } =>
          typeof response.id === 'string' && response.value !== undefined
      );
      intakeResponseSnapshots = await service.validateBookingFormResponses({
        standardFields: {
          nameKana: customer_name_kana,
          phone: customer_phone,
          email: customer_email,
          birthDate: birth_date,
          gender,
          notes,
        },
        responses: normalizedIntakeResponses,
        consents,
      });
    } catch (e) {
      if (e instanceof BookingFormValidationError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 400 }
        );
      }
      console.error('Booking form validation error:', e);
      return NextResponse.json(
        { success: false, error: 'Failed to validate booking form responses' },
        { status: 500 }
      );
    }

    // Verify menu
    let menu;
    try {
      menu = await service.verifyMenu(menu_id);
    } catch (e) {
      if (e instanceof MenuNotFoundError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 404 }
        );
      }
      throw e;
    }

    // Calculate time slot
    const { startIso, endIso } = service.calculateTimeSlot(
      start_time,
      menu.duration_minutes
    );

    try {
      await service.validateReservationTime(startIso, endIso);
    } catch (e) {
      if (e instanceof PublicBookingTimeValidationError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 400 }
        );
      }
      console.error('Reservation time validation error:', e);
      return NextResponse.json(
        { success: false, error: 'Failed to validate reservation time' },
        { status: 500 }
      );
    }

    const isAutoAssign = resource_id === 'any';
    let assignedResourceId = resource_id;
    let retryAssignedResourceId: string | null = null;

    if (isAutoAssign) {
      try {
        const assigned = await service.selectStaffForAutoAssign(
          startIso,
          endIso
        );
        assignedResourceId = assigned.resourceId;
      } catch (e) {
        if (e instanceof SlotConflictError) {
          return NextResponse.json(
            { success: false, error: e.message },
            { status: 409 }
          );
        }
        console.error('Auto assignment error:', e);
        return NextResponse.json(
          { success: false, error: 'Failed to assign booking resource' },
          { status: 500 }
        );
      }
    } else {
      // Verify resource
      try {
        await service.verifyResource(resource_id);
      } catch (e) {
        if (e instanceof ResourceNotFoundError) {
          return NextResponse.json(
            { success: false, error: e.message },
            { status: 404 }
          );
        }
        throw e;
      }

      // Check slot availability
      try {
        await service.checkSlotAvailability(resource_id, startIso, endIso);
      } catch (e) {
        if (e instanceof SlotConflictError) {
          return NextResponse.json(
            { success: false, error: e.message },
            { status: 409 }
          );
        }
        console.error('Reservation slot validation error:', e);
        return NextResponse.json(
          { success: false, error: 'Failed to validate reservation slot' },
          { status: 500 }
        );
      }
    }

    // Find or create customer
    let customerResult;
    try {
      customerResult = await service.findOrCreateCustomer(
        customer_name,
        customer_phone,
        customer_email,
        lineProfile
      );
    } catch (e) {
      if (e instanceof CustomerLookupError) {
        console.error('Customer lookup error:', e);
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 500 }
        );
      }
      if (e instanceof CustomerCreateError) {
        console.error('Customer creation error:', e);
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 500 }
        );
      }
      throw e;
    }

    let outreachAttribution: OutreachAttribution | null = null;
    try {
      outreachAttribution = await resolveOutreachAttribution(clinicCtx.client, {
        clinicId: clinic_id,
        campaignId: campaign_id,
        customerId: customerResult.customerId,
      });
    } catch (error) {
      logger.warn('Failed to resolve outreach attribution; continuing', {
        clinicId: clinic_id,
        campaignId: campaign_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Create reservation
    let reservation: ReservationResult;
    try {
      reservation = await service.createReservation({
        customerId: customerResult.customerId,
        menuId: menu_id,
        resourceId: assignedResourceId,
        startIso,
        endIso,
        notes: notes ?? null,
        channel,
        isStaffRequested: !isAutoAssign,
        intakeResponses: intakeResponseSnapshots,
        campaignId: outreachAttribution?.campaignId ?? null,
      });
    } catch (e) {
      if (e instanceof SlotConflictError) {
        if (isAutoAssign) {
          try {
            const retryAssigned = await service.selectStaffForAutoAssign(
              startIso,
              endIso,
              [assignedResourceId]
            );
            retryAssignedResourceId = retryAssigned.resourceId;
            reservation = await service.createReservation({
              customerId: customerResult.customerId,
              menuId: menu_id,
              resourceId: retryAssignedResourceId,
              startIso,
              endIso,
              notes: notes ?? null,
              channel,
              isStaffRequested: false,
              intakeResponses: intakeResponseSnapshots,
              campaignId: outreachAttribution?.campaignId ?? null,
            });
          } catch (retryError) {
            if (customerResult.created) {
              await service.rollbackCustomer(customerResult.customerId);
            }
            if (retryError instanceof SlotConflictError) {
              return NextResponse.json(
                { success: false, error: retryError.message },
                { status: 409 }
              );
            }
            throw retryError;
          }
        } else {
          if (customerResult.created) {
            await service.rollbackCustomer(customerResult.customerId);
          }
          return NextResponse.json(
            { success: false, error: e.message },
            { status: 409 }
          );
        }
      }
      if (e instanceof ReservationCreateError) {
        console.error('Reservation creation error:', e);
        // Rollback newly created customer
        if (customerResult.created) {
          await service.rollbackCustomer(customerResult.customerId);
        }
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 500 }
        );
      }
      throw e;
    }

    if (outreachAttribution) {
      try {
        await markOutreachRecipientBooked(clinicCtx.client, {
          clinicId: clinic_id,
          campaignId: outreachAttribution.campaignId,
          recipientId: outreachAttribution.recipientId,
          reservationId: reservation.id,
        });
      } catch (error) {
        logger.warn('Failed to mark outreach recipient booking attribution', {
          clinicId: clinic_id,
          campaignId: outreachAttribution.campaignId,
          reservationId: reservation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      await enqueuePublicReservationNotifications(clinicCtx.client, {
        clinicId: clinic_id,
        reservationId: reservation.id,
        customerId: customerResult.customerId,
        customerName: customer_name,
        customerEmail: customer_email ?? null,
        clinicName: clinicCtx.clinic.name,
        menuName: menu.name,
        resourceId: retryAssignedResourceId ?? assignedResourceId,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
        channel,
        intakeSummary: formatIntakeSummary(intakeResponseSnapshots),
        updatedAt: reservation.updated_at,
      });
    } catch (error) {
      logger.error('Failed to enqueue public reservation notifications', {
        reservationId: reservation.id,
        clinicId: clinic_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          reservation_id: reservation.id,
          clinic_name: clinicCtx.clinic.name,
          menu_name: menu.name,
          start_time: reservation.start_time,
          end_time: reservation.end_time,
          status: reservation.status,
          resource_id: retryAssignedResourceId ?? assignedResourceId,
          is_staff_requested: !isAutoAssign,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Public reservations API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

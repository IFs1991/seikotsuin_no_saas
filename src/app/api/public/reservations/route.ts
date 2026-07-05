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
import { PublicBookingTimeValidationError } from '@/lib/services/public-availability-service';
import { reservationCreateSchema } from '../schema';

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
    } = parsed.data;
    const channel = 'web';

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
        customer_email
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

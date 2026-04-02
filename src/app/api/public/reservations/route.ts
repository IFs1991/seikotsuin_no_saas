/**
 * POST /api/public/reservations
 *
 * Non-authenticated customer API for creating reservations
 * Uses service role to bypass RLS, with explicit clinic_id validation
 *
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import { reservationCreateSchema } from '../schema';

type ReservationInsert = Database['public']['Tables']['reservations']['Insert'];

function isNoRowsError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'PGRST116'
  );
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
      menu_id,
      resource_id,
      start_time,
      notes,
      channel,
    } = parsed.data;

    // Use admin client (service role) for public access
    const supabase = createAdminClient();

    const { data: bookingSettingsRecord, error: bookingSettingsError } =
      await supabase
        .from('clinic_settings')
        .select('settings')
        .eq('clinic_id', clinic_id)
        .eq('category', 'booking_calendar')
        .single();

    const isMissingBookingSettings =
      bookingSettingsError &&
      typeof bookingSettingsError === 'object' &&
      'code' in bookingSettingsError &&
      bookingSettingsError.code === 'PGRST116';

    if (bookingSettingsError && !isMissingBookingSettings) {
      console.error('Clinic settings lookup error:', bookingSettingsError);
      return NextResponse.json(
        { success: false, error: 'Failed to verify online booking settings' },
        { status: 500 }
      );
    }

    const allowOnlineBooking =
      bookingSettingsRecord?.settings &&
      typeof bookingSettingsRecord.settings === 'object' &&
      'allowOnlineBooking' in bookingSettingsRecord.settings
        ? bookingSettingsRecord.settings.allowOnlineBooking === true
        : false;

    if (!allowOnlineBooking) {
      return NextResponse.json(
        {
          success: false,
          error: 'Online booking is disabled for this clinic',
        },
        { status: 403 }
      );
    }

    // Verify clinic exists and is active
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .select('id, name, is_active')
      .eq('id', clinic_id)
      .single();

    if (clinicError || !clinic) {
      return NextResponse.json(
        { success: false, error: 'Clinic not found' },
        { status: 404 }
      );
    }

    if (!clinic.is_active) {
      return NextResponse.json(
        { success: false, error: 'Clinic is not accepting reservations' },
        { status: 403 }
      );
    }

    // Verify menu exists and belongs to the clinic
    const { data: menu, error: menuError } = await supabase
      .from('menus')
      .select('id, name, duration_minutes, price')
      .eq('id', menu_id)
      .eq('clinic_id', clinic_id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .single();

    if (menuError || !menu) {
      return NextResponse.json(
        { success: false, error: 'Menu not found or not available' },
        { status: 404 }
      );
    }

    // Calculate end_time from menu duration
    const startDate = new Date(start_time);
    const endDate = new Date(
      startDate.getTime() + (menu.duration_minutes ?? 60) * 60 * 1000
    );
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Verify resource exists and belongs to the clinic
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('id')
      .eq('id', resource_id)
      .eq('clinic_id', clinic_id)
      .single();

    if (resourceError || !resource) {
      return NextResponse.json(
        { success: false, error: 'Resource not found' },
        { status: 404 }
      );
    }

    const { data: overlappingReservations, error: overlapError } =
      await supabase
        .from('reservations')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('staff_id', resource_id)
        .lt('start_time', endIso)
        .gt('end_time', startIso);

    if (overlapError) {
      console.error('Reservation overlap lookup error:', overlapError);
      return NextResponse.json(
        { success: false, error: 'Failed to validate reservation slot' },
        { status: 500 }
      );
    }

    if (overlappingReservations && overlappingReservations.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Requested time slot is not available' },
        { status: 409 }
      );
    }

    const { data: overlappingBlocks, error: blockError } = await supabase
      .from('blocks')
      .select('id, reason')
      .eq('clinic_id', clinic_id)
      .eq('resource_id', resource_id)
      .lt('start_time', endIso)
      .gt('end_time', startIso);

    if (blockError) {
      console.error('Reservation block lookup error:', blockError);
      return NextResponse.json(
        { success: false, error: 'Failed to validate reservation slot' },
        { status: 500 }
      );
    }

    if (overlappingBlocks && overlappingBlocks.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Requested time slot is not available' },
        { status: 409 }
      );
    }

    // Find or create customer
    let customer_id: string;
    let createdCustomerId: string | null = null;
    if (customer_email) {
      // Try to find existing customer by email
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from('customers')
          .select('id')
          .eq('clinic_id', clinic_id)
          .eq('email', customer_email)
          .eq('is_deleted', false)
          .single();

      if (existingCustomerError && !isNoRowsError(existingCustomerError)) {
        console.error('Customer lookup error:', existingCustomerError);
        return NextResponse.json(
          { success: false, error: 'Failed to lookup customer record' },
          { status: 500 }
        );
      }

      if (existingCustomer) {
        customer_id = existingCustomer.id;
      } else {
        // Create new customer
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            clinic_id,
            name: customer_name,
            phone: customer_phone,
            email: customer_email,
          })
          .select('id')
          .single();

        if (customerError || !newCustomer) {
          console.error('Customer creation error:', customerError);
          return NextResponse.json(
            { success: false, error: 'Failed to create customer record' },
            { status: 500 }
          );
        }
        customer_id = newCustomer.id;
        createdCustomerId = newCustomer.id;
      }
    } else {
      // Create anonymous customer record
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          clinic_id,
          name: customer_name,
          phone: customer_phone,
        })
        .select('id')
        .single();

      if (customerError || !newCustomer) {
        console.error('Customer creation error:', customerError);
        return NextResponse.json(
          { success: false, error: 'Failed to create customer record' },
          { status: 500 }
        );
      }
      customer_id = newCustomer.id;
      createdCustomerId = newCustomer.id;
    }

    // Create reservation
    const reservationInsert: ReservationInsert = {
      clinic_id,
      customer_id,
      menu_id,
      staff_id: resource_id,
      start_time: startIso,
      end_time: endIso,
      status: 'pending',
      notes: notes ?? null,
      channel,
    };

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .insert(reservationInsert)
      .select('id, start_time, end_time, status')
      .single();

    if (reservationError || !reservation) {
      console.error('Reservation creation error:', reservationError);
      if (createdCustomerId) {
        const { error: rollbackError } = await supabase
          .from('customers')
          .delete()
          .eq('id', createdCustomerId)
          .eq('clinic_id', clinic_id);

        if (rollbackError) {
          console.error('Customer rollback error:', rollbackError);
        }
      }
      return NextResponse.json(
        { success: false, error: 'Failed to create reservation' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          reservation_id: reservation.id,
          clinic_name: clinic.name,
          menu_name: menu.name,
          start_time: reservation.start_time,
          end_time: reservation.end_time,
          status: reservation.status,
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

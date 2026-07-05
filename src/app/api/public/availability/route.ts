import { NextRequest, NextResponse } from 'next/server';
import { availabilityQuerySchema } from '../schema';
import {
  createPublicClinicContext,
  ClinicInactiveError,
  ClinicNotFoundError,
} from '@/lib/supabase/scoped-admin';
import {
  AvailabilityBookingDisabledError,
  AvailabilityMenuNotFoundError,
  AvailabilityResourceNotFoundError,
  AvailabilityValidationError,
  PublicAvailabilityService,
} from '@/lib/services/public-availability-service';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = availabilityQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      menu_id: searchParams.get('menu_id'),
      resource_id: searchParams.get('resource_id'),
      date_from: searchParams.get('date_from'),
      date_to: searchParams.get('date_to'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { clinic_id, menu_id, resource_id, date_from, date_to } = parsed.data;

    let clinicCtx;
    try {
      clinicCtx = await createPublicClinicContext(clinic_id);
    } catch (e) {
      if (e instanceof ClinicNotFoundError) {
        return NextResponse.json(
          { success: false, error: 'Clinic not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof ClinicInactiveError) {
        return NextResponse.json(
          { success: false, error: 'Clinic is not active' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      throw e;
    }

    const service = new PublicAvailabilityService(clinicCtx.client, clinic_id);

    try {
      const availability = await service.getAvailability({
        menuId: menu_id,
        resourceId: resource_id,
        dateFrom: date_from,
        dateTo: date_to,
      });

      return NextResponse.json(
        {
          success: true,
          data: availability,
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (e) {
      if (e instanceof AvailabilityValidationError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof AvailabilityMenuNotFoundError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof AvailabilityResourceNotFoundError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (e instanceof AvailabilityBookingDisabledError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      throw e;
    }
  } catch (error) {
    console.error('Public availability API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

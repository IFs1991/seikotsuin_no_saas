import { NextRequest, NextResponse } from 'next/server';
import {
  ClinicInactiveError,
  ClinicNotFoundError,
  createPublicClinicContext,
} from '@/lib/supabase/scoped-admin';
import {
  normalizeBookingFormSettings,
  sanitizeBookingFormSettings,
} from '@/lib/booking-form/settings';
import { getPublicLineBookingMetadata } from '@/lib/line/public-booking';
import { getPublicTurnstileSiteKey } from '@/lib/turnstile';
import { bookingFormQuerySchema } from '../schema';

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = bookingFormQuerySchema.safeParse({
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

    let clinicCtx;
    try {
      clinicCtx = await createPublicClinicContext(parsed.data.clinic_id);
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

    const { data, error } = await clinicCtx.client
      .from('clinic_settings')
      .select('settings')
      .eq('clinic_id', parsed.data.clinic_id)
      .eq('category', 'booking_form')
      .maybeSingle();

    if (error) {
      return noStoreJson(
        { success: false, error: 'Failed to load booking form settings' },
        { status: 500 }
      );
    }

    const settings = normalizeBookingFormSettings(data?.settings);
    const lineMetadata = await getPublicLineBookingMetadata({
      supabase: clinicCtx.client,
      clinicId: parsed.data.clinic_id,
    });

    return noStoreJson({
      success: true,
      data: {
        ...sanitizeBookingFormSettings(settings),
        turnstile_site_key: getPublicTurnstileSiteKey(),
        ...lineMetadata,
      },
    });
  } catch (error) {
    console.error('Public booking-form API error:', error);
    return noStoreJson(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

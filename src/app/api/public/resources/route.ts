/**
 * GET /api/public/resources
 *
 * Non-authenticated customer API for viewing bookable resources.
 * Uses service role to bypass RLS, with explicit clinic_id validation.
 *
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClinicContext,
  ClinicNotFoundError,
  ClinicInactiveError,
} from '@/lib/supabase/scoped-admin';
import { resourcesQuerySchema } from '../schema';
import { PUBLIC_BOOKING_CACHE_HEADERS } from '../cache';

const PUBLIC_RESOURCE_COLUMNS = 'id, name, type, max_concurrent, display_order';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = resourcesQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      type: searchParams.get('type') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { clinic_id, type } = parsed.data;

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
          { success: false, error: 'Clinic is not active' },
          { status: 403 }
        );
      }
      throw e;
    }

    let query = clinicCtx.client
      .from('resources')
      .select(PUBLIC_RESOURCE_COLUMNS)
      .eq('clinic_id', clinic_id)
      .eq('is_active', true)
      .eq('is_bookable', true)
      .eq('is_deleted', false);

    if (type) {
      query = query.eq('type', type);
    }

    const { data: resources, error } = await query.order('display_order', {
      ascending: true,
    });

    if (error) {
      console.error('Public resources fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch resources' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          clinic_id,
          clinic_name: clinicCtx.clinic.name,
          resources: resources ?? [],
        },
      },
      { headers: PUBLIC_BOOKING_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Public resources API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

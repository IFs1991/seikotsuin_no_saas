/**
 * GET /api/public/menus
 *
 * Non-authenticated customer API for viewing menus
 * Uses service role to bypass RLS, with explicit clinic_id validation
 *
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClinicContext,
  ClinicNotFoundError,
  ClinicInactiveError,
} from '@/lib/supabase/scoped-admin';
import { menusQuerySchema } from '../schema';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const rawParams = {
      clinic_id: searchParams.get('clinic_id'),
      category: searchParams.get('category') ?? undefined,
    };

    // Validate input
    const parsed = menusQuerySchema.safeParse(rawParams);
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

    const { clinic_id, category } = parsed.data;

    // Validate clinic exists and is active via scoped admin context
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

    const { client: supabase, clinic } = clinicCtx;

    // Build menus query with clinic_id scope
    let query = supabase
      .from('menus')
      .select(
        'id, name, description, price, duration_minutes, category, is_insurance_applicable'
      )
      .eq('clinic_id', clinic_id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('display_order', { ascending: true });

    // Optional category filter
    if (category) {
      query = query.eq('category', category);
    }

    const { data: menus, error: menusError } = await query;

    if (menusError) {
      console.error('Menus fetch error:', menusError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch menus' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        clinic_id,
        clinic_name: clinic.name,
        menus: menus ?? [],
      },
    });
  } catch (error) {
    console.error('Public menus API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

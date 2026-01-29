/**
 * GET /api/public/menus
 *
 * Non-authenticated customer API for viewing menus
 * Uses service role to bypass RLS, with explicit clinic_id validation
 *
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md - Customer Access Model
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
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

    // Use admin client (service role) for public access
    const supabase = createAdminClient();

    // Verify clinic exists
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
        { success: false, error: 'Clinic is not active' },
        { status: 403 }
      );
    }

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

import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { buildSafeSearchFilter } from '@/lib/postgrest-sanitizer';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  customersQuerySchema,
  customerInsertSchema,
  customerUpdateSchema,
  mapCustomerInsertToRow,
  mapCustomerUpdateToRow,
} from './schema';

const PATH = '/api/customers';

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = customersQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      q: request.nextUrl.searchParams.get('q') ?? undefined,
      id: request.nextUrl.searchParams.get('id') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }
    const { clinic_id, q, id } = parsedQuery.data;

    const guard = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
    });
    if (!guard.success) return guard.error;

    if (id) {
      const { data, error } = await guard.supabase
        .from('customers')
        .select('*')
        .eq('clinic_id', clinic_id)
        .eq('id', id)
        .eq('is_deleted', false)
        .single();

      if (error && error.code === 'PGRST116') {
        return createErrorResponse('顧客が見つかりません', 404);
      }
      if (error) {
        throw normalizeSupabaseError(error, PATH);
      }
      if (!data) {
        return createErrorResponse('顧客が見つかりません', 404);
      }

      const mapped = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email ?? undefined,
        notes: data.notes ?? undefined,
        customAttributes: data.custom_attributes ?? undefined,
      };
      return createSuccessResponse(mapped);
    }

    let query = guard.supabase
      .from('customers')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('is_deleted', false);
    if (q) {
      // PostgRESTフィルターインジェクション対策: 特殊文字をエスケープ
      const searchFilter = buildSafeSearchFilter(q, ['name', 'phone']);
      if (searchFilter) {
        query = query.or(searchFilter);
      }
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? undefined,
      notes: row.notes ?? undefined,
      customAttributes: row.custom_attributes ?? undefined,
    }));
    return createSuccessResponse(mapped);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, customerInsertSchema);
    if (!result.success) return result.error;

    const insertPayload = mapCustomerInsertToRow(result.dto, result.auth.id);
    const { data, error } = await result.supabase
      .from('customers')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, customerUpdateSchema);
    if (!result.success) return result.error;

    const updatePayload = mapCustomerUpdateToRow(result.dto);
    const { data, error } = await result.supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', result.dto.id)
      .eq('clinic_id', result.dto.clinic_id)
      .select()
      .single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

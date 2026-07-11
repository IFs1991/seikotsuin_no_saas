import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { buildSafeSearchFilter } from '@/lib/postgrest-sanitizer';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import {
  customersQuerySchema,
  customerInsertSchema,
  customerUpdateSchema,
  decodeCustomerCursor,
  encodeCustomerCursor,
  mapCustomerInsertToRow,
  mapCustomerUpdateToRow,
} from './schema';

const PATH = '/api/customers';
const MANAGER_CUSTOMER_ACCESS_DENIED_MESSAGE =
  'マネージャーは患者情報APIへアクセスできません。';
const CUSTOMER_RESPONSE_COLUMNS =
  'id, name, phone, email, notes, custom_attributes';
const CUSTOMER_LIST_RESPONSE_COLUMNS = `${CUSTOMER_RESPONSE_COLUMNS}, created_at, updated_at, consent_marketing, consent_reminder, line_user_id`;
type CustomerResponseRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  custom_attributes: Record<string, unknown> | null;
};
type CustomerListRow = CustomerResponseRow & {
  created_at: string;
  updated_at: string;
  consent_marketing: boolean | null;
  consent_reminder: boolean | null;
  line_user_id: string | null;
};

type CustomerListResponse = {
  items: ReturnType<typeof mapCustomerListRowToApi>[];
  nextCursor: string | null;
};

type PostgresConstraintError = {
  code?: string;
  message?: string;
};

function mapCustomerRowToApi(row: CustomerResponseRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    customAttributes: row.custom_attributes ?? undefined,
  };
}

function mapCustomerListRowToApi(row: CustomerListRow) {
  return {
    ...mapCustomerRowToApi(row),
    lineUserId: row.line_user_id ?? undefined,
    consentMarketing: row.consent_marketing ?? false,
    consentReminder: row.consent_reminder ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createCustomerScopedClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function getCustomerReferenceErrorMessage(
  error: PostgresConstraintError
): string | null {
  if (error.code !== '23503') return null;

  const message = error.message ?? '';
  if (message.includes('customers_clinic_id_fkey')) {
    return '患者を登録する院データが見つかりません。院の選択を確認してください';
  }
  if (message.includes('customers_created_by_fkey')) {
    return '患者を登録するユーザー情報が見つかりません。再ログインしてからお試しください';
  }

  return '患者登録に必要な関連データが見つかりません';
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = customersQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      q: request.nextUrl.searchParams.get('q') ?? undefined,
      id: request.nextUrl.searchParams.get('id') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }
    const { clinic_id, q, id, limit, cursor: encodedCursor } = parsedQuery.data;

    const guard = await processApiRequest(request, {
      clinicId: clinic_id,
      requireClinicMatch: true,
      deniedRoles: ['manager'],
      deniedRoleMessage: MANAGER_CUSTOMER_ACCESS_DENIED_MESSAGE,
    });
    if (!guard.success) return guard.error;

    const supabase = createCustomerScopedClient(guard.permissions, clinic_id);

    if (id) {
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_RESPONSE_COLUMNS)
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

      return createSuccessResponse(
        mapCustomerRowToApi(data as CustomerResponseRow)
      );
    }

    let query = supabase
      .from('customers')
      .select(CUSTOMER_LIST_RESPONSE_COLUMNS)
      .eq('clinic_id', clinic_id)
      .eq('is_deleted', false);
    if (q) {
      // PostgRESTフィルターインジェクション対策: 特殊文字をエスケープ
      const searchFilter = buildSafeSearchFilter(q, ['name', 'phone']);
      if (searchFilter) {
        query = query.or(searchFilter);
      }
    }

    if (encodedCursor) {
      const cursor = decodeCustomerCursor(encodedCursor);
      if (!cursor) {
        return createErrorResponse('cursorが不正です', 400);
      }

      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    const rows = (data ?? []) as CustomerListRow[];
    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasNextPage && lastRow
        ? encodeCustomerCursor({
            createdAt: lastRow.created_at,
            id: lastRow.id,
          })
        : null;
    const response: CustomerListResponse = {
      items: pageRows.map(mapCustomerListRowToApi),
      nextCursor,
    };
    return createSuccessResponse(response);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      customerInsertSchema,
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: MANAGER_CUSTOMER_ACCESS_DENIED_MESSAGE,
      }
    );
    if (!result.success) return result.error;

    const insertPayload = mapCustomerInsertToRow(result.dto, result.auth.id);
    const supabase = createCustomerScopedClient(
      result.permissions,
      result.dto.clinic_id
    );
    const { data, error } = await supabase
      .from('customers')
      .insert(insertPayload)
      .select(CUSTOMER_RESPONSE_COLUMNS)
      .single();
    if (error) {
      const referenceErrorMessage = getCustomerReferenceErrorMessage(error);
      if (referenceErrorMessage) {
        return createErrorResponse(referenceErrorMessage, 400);
      }
      throw normalizeSupabaseError(error, PATH);
    }
    return createSuccessResponse(data, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      customerUpdateSchema,
      {
        deniedRoles: ['manager'],
        deniedRoleMessage: MANAGER_CUSTOMER_ACCESS_DENIED_MESSAGE,
      }
    );
    if (!result.success) return result.error;

    const updatePayload = mapCustomerUpdateToRow(result.dto);
    const supabase = createCustomerScopedClient(
      result.permissions,
      result.dto.clinic_id
    );
    const { data, error } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', result.dto.id)
      .eq('clinic_id', result.dto.clinic_id)
      .select(CUSTOMER_RESPONSE_COLUMNS)
      .single();
    if (error) throw normalizeSupabaseError(error, PATH);
    return createSuccessResponse(data);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

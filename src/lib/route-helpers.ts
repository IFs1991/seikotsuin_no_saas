/**
 * PR-03: tenant CRUD route 共通ヘルパー
 *
 * - handleRouteError: catch ブロックの共通化
 * - processClinicScopedBody: processApiRequest 二重呼び出しの解消
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';

import {
  createErrorResponse,
  processApiRequest,
  type ApiErrorResponse,
  type ProcessApiSuccess,
} from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  getStatusCodeFromErrorCode,
  isApiError,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import { canAccessClinicScope } from '@/lib/supabase';

// =========================================================
// handleRouteError
// =========================================================

/**
 * route handler の catch ブロックを共通化する。
 * 既存の 4 route (reservations, customers, menus, resources) で
 * 同一パターンだった error → status code 変換ロジックを集約。
 */
export function handleRouteError(
  error: unknown,
  path: string
): NextResponse<ApiErrorResponse> {
  let apiError;
  let statusCode = 500;

  if (error instanceof AppError) {
    apiError = error.toApiError(path);
    statusCode = error.statusCode;
  } else if (isApiError(error)) {
    apiError = error;
    statusCode = getStatusCodeFromErrorCode(apiError.code);
  } else if (error && typeof error === 'object' && 'code' in error) {
    apiError = normalizeSupabaseError(error, path);
    statusCode = getStatusCodeFromErrorCode(apiError.code);
  } else {
    apiError = createApiError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : 'Internal server error',
      undefined,
      path
    );
  }

  logError(error instanceof Error ? error : new Error(String(error)), {
    path,
  });

  return createErrorResponse(apiError.message, statusCode, apiError);
}

// =========================================================
// processClinicScopedBody
// =========================================================

export interface ClinicScopedBodySuccess<T> extends ProcessApiSuccess {
  dto: T;
}

export interface ClinicScopedBodyFailure {
  success: false;
  error: NextResponse<ApiErrorResponse>;
}

export type ClinicScopedBodyResult<T> =
  | ClinicScopedBodySuccess<T>
  | ClinicScopedBodyFailure;

/**
 * POST/PATCH で共通の「body 取得 → schema validation → clinic scope 検証」を
 * processApiRequest 1 回で完結させる。
 *
 * 旧パターン:
 *   const auth = await processApiRequest(request, { requireBody: true });   // 1回目
 *   const parsed = schema.safeParse(auth.body);
 *   const guard = await processApiRequest(request, { clinicId, ... });      // 2回目
 *
 * 新パターン:
 *   const result = await processClinicScopedBody(request, schema);          // 1回で完了
 */
export async function processClinicScopedBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
  options?: { allowedRoles?: string[] }
): Promise<ClinicScopedBodyResult<T>> {
  // 1. Auth + origin + body を 1 回で取得
  const result = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: options?.allowedRoles,
  });
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // 2. Schema validation
  const parsed = schema.safeParse(result.body);
  if (!parsed.success) {
    return {
      success: false,
      error: createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      ),
    };
  }

  const dto = parsed.data;

  // 3. Clinic scope check (PR-01 の canAccessClinicScope を使用)
  const clinicId = (dto as Record<string, unknown>).clinic_id;
  if (typeof clinicId !== 'string') {
    return {
      success: false,
      error: createErrorResponse('clinic_id は必須です', 400),
    };
  }

  if (!canAccessClinicScope(result.permissions, clinicId)) {
    return {
      success: false,
      error: createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      ),
    };
  }

  return {
    ...result,
    dto,
  };
}

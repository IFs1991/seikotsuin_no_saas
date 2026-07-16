/**
 * PR-03: tenant CRUD route 共通ヘルパー
 *
 * - handleRouteError: catch ブロックの共通化
 * - processClinicScopedBody: processApiRequest 二重呼び出しの解消
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';

import {
  createErrorResponse,
  createPublicAppErrorResponse,
  isAuthorityUnavailableError,
  processApiRequest,
  type ApiErrorResponse,
  type ProcessApiOptions,
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
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { normalizeRole } from '@/lib/constants/roles';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

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
  if (isAuthorityUnavailableError(error)) {
    logError(error, { path });
    return createPublicAppErrorResponse(error);
  }

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

  return createErrorResponse(
    apiError.message,
    statusCode,
    apiError,
    apiError.code
  );
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

export type ProcessClinicScopedBodyOptions = Pick<
  ProcessApiOptions,
  'allowedRoles' | 'deniedRoles' | 'deniedRoleMessage'
> & {
  path?: string;
};

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
export async function processClinicScopedBody<TOutput, TInput>(
  request: NextRequest,
  schema: ZodType<TOutput, ZodTypeDef, TInput>,
  options?: ProcessClinicScopedBodyOptions
): Promise<ClinicScopedBodyResult<TOutput>> {
  // 1. Auth + origin + body を 1 回で取得
  const apiOptions: ProcessApiOptions = {
    requireBody: true,
  };
  if (options?.allowedRoles) {
    apiOptions.allowedRoles = options.allowedRoles;
  }
  if (options?.deniedRoles) {
    apiOptions.deniedRoles = options.deniedRoles;
  }
  if (options?.deniedRoleMessage) {
    apiOptions.deniedRoleMessage = options.deniedRoleMessage;
  }

  const result = await processApiRequest(request, apiOptions);
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

  let path = options?.path ?? '/api/unknown';
  if (!options?.path && typeof request.url === 'string') {
    path = new URL(request.url).pathname;
  }
  try {
    const guard = await ensureClinicAccess(request, path, clinicId, {
      requireClinicMatch: true,
      allowedRoles: options?.allowedRoles,
    });

    await ensureScopedBusinessWriteAccess({
      permissions: guard.permissions,
      targetClinicId: clinicId,
    });

    return {
      ...result,
      auth: {
        id: guard.user.id,
        email: guard.user.email || '',
        role: normalizeRole(guard.permissions.role) ?? guard.permissions.role,
      },
      permissions: guard.permissions,
      supabase: guard.supabase,
      dto,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        error: createPublicAppErrorResponse(error),
      };
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
    });

    return {
      success: false,
      error: createErrorResponse('サーバーエラーが発生しました', 500),
    };
  }
}

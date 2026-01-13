// =================================================================
// API共通ヘルパー関数 - 認証・サニタイゼーション・エラーハンドリング
// =================================================================

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/error-handler';
import {
  ensureClinicAccess,
  type ClinicAccessOptions,
} from '@/lib/supabase/guards';
import type { SupabaseServerClient, UserPermissions } from '@/lib/supabase';
import { ALLOWED_REDIRECT_ORIGINS } from '@/lib/constants/security';
import { ADMIN_UI_ROLES, normalizeRole } from '@/lib/constants/roles';

// 認証・認可の結果型
export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  error?: string;
}

// APIエラーレスポンス型
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
  code?: string;
}

// API成功レスポンス型
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 管理者認証・認可チェック
 * ADMIN_UI_ROLES (admin, clinic_admin) を持つユーザーのみ許可
 */
export async function verifyAdminAuth(
  request: NextRequest
): Promise<AuthResult> {
  const path = new URL(request.url).pathname;

  try {
    const { user, permissions } = await ensureClinicAccess(
      request,
      path,
      null,
      {
        allowedRoles: Array.from(ADMIN_UI_ROLES),
        requireClinicMatch: false,
      }
    );

    // DOD-08: 返されるroleを正規化（clinic_manager → clinic_admin）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const normalizedRole = normalizeRole(permissions.role) ?? permissions.role;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || '',
        role: normalizedRole,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error('認証エラー:', error);
    return {
      success: false,
      error: '認証処理中にエラーが発生しました',
    };
  }
}

/**
 * プロトタイプ汚染攻撃を防ぐため、危険なキーを定義
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * 入力データのサニタイゼーション
 * XSS攻撃とプロトタイプ汚染攻撃を防ぐため、すべての文字列値をサニタイズし、危険なキーをフィルタリング
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function sanitizeInput(value: unknown): unknown {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // プロトタイプ汚染を防ぐため、危険なキーをスキップ
      if (DANGEROUS_KEYS.includes(key)) {
        continue;
      }
      sanitized[key] = sanitizeInput(val);
    }
    return sanitized;
  }

  return value;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function buildAllowedOrigins(requestOrigin: string): Set<string> {
  const allowed = new Set(ALLOWED_REDIRECT_ORIGINS);
  allowed.add(requestOrigin);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch (error) {
      logger.warn('Invalid NEXT_PUBLIC_APP_URL ignored for origin checks', error);
    }
  }

  return allowed;
}

function resolveOriginFromHeaders(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin && origin.trim().length > 0) {
    return origin;
  }

  const referer = request.headers.get('referer');
  if (referer && referer.trim().length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function isAllowedOrigin(origin: string, allowed: Set<string>): boolean {
  return allowed.has(origin);
}

/**
 * 統一されたAPIエラーレスポンス生成
 */
export function createErrorResponse(
  error: string,
  status: number = 500,
  details?: unknown,
  code?: string
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    success: false,
    error,
  };

  if (details !== undefined) response.details = details;
  if (code !== undefined) response.code = code;

  return NextResponse.json(response, { status });
}

/**
 * 統一されたAPI成功レスポンス生成
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  message?: string
): NextResponse<ApiSuccessResponse<T>> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  if (message !== undefined) response.message = message;

  return NextResponse.json(response, { status });
}

/**
 * APIリクエストの共通前処理
 * 認証チェック + 入力サニタイゼーション
 */
export interface ProcessApiOptions {
  requireBody?: boolean;
  allowedRoles?: string[];
  clinicId?: string | null;
  requireClinicMatch?: boolean;
  sanitizeInputValues?: boolean;
}

export interface ProcessApiSuccess {
  success: true;
  auth: NonNullable<AuthResult['user']>;
  permissions: UserPermissions;
  supabase: SupabaseServerClient;
  body?: unknown;
  error?: never;
}

export interface ProcessApiFailure {
  success: false;
  error: NextResponse<ApiErrorResponse>;
}

export type ProcessApiResult = ProcessApiSuccess | ProcessApiFailure;

export async function processApiRequest(
  request: NextRequest,
  options: ProcessApiOptions = {}
): Promise<ProcessApiResult> {
  const path = new URL(request.url).pathname;

  try {
    const method = request.method.toUpperCase();
    if (MUTATING_METHODS.has(method)) {
      const requestOrigin = new URL(request.url).origin;
      const originHeader = resolveOriginFromHeaders(request);

      if (originHeader) {
        const allowedOrigins = buildAllowedOrigins(requestOrigin);
        if (!isAllowedOrigin(originHeader, allowedOrigins)) {
          logger.warn('Blocked request from disallowed origin', {
            path,
            method,
            origin: originHeader,
          });

          return {
            success: false,
            error: createErrorResponse('不正なリクエスト元です', 403),
          };
        }
      } else if (process.env.NODE_ENV === 'production') {
        logger.warn('Missing origin headers on state-changing request', {
          path,
          method,
        });
      }
    }

    const guardOptions: ClinicAccessOptions = {};
    if (options.allowedRoles) {
      guardOptions.allowedRoles = options.allowedRoles;
    }
    if (options.requireClinicMatch !== undefined) {
      guardOptions.requireClinicMatch = options.requireClinicMatch;
    }

    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      path,
      options.clinicId ?? null,
      guardOptions
    );

    let body: unknown;
    if (options.requireBody) {
      try {
        const rawBody = await request.json();
        body =
          options.sanitizeInputValues === false
            ? rawBody
            : sanitizeInput(rawBody);
      } catch {
        return {
          success: false,
          error: createErrorResponse('無効なJSONデータです', 400),
        };
      }
    }

    // DOD-08: 返されるroleを正規化（clinic_manager → clinic_admin）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const normalizedRoleForAuth = normalizeRole(permissions.role) ?? permissions.role;

    return {
      success: true,
      auth: {
        id: user.id,
        email: user.email || '',
        role: normalizedRoleForAuth,
      },
      permissions,
      supabase,
      body,
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        error: createErrorResponse(
          error.message,
          error.statusCode,
          undefined,
          error.code
        ),
      };
    }

    logger.error('processApiRequest error', error);
    return {
      success: false,
      error: createErrorResponse('サーバーエラーが発生しました', 500),
    };
  }
}

/**
 * エラーログ出力（本番環境用）
 */
export function logError(
  error: unknown,
  context: {
    endpoint: string;
    userId: string;
    method?: string;
    params?: unknown;
  }
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    level: 'error',
    endpoint: context.endpoint,
    userId: context.userId,
    method: context.method,
    params: context.params,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
  };

  // 本番環境では構造化ログを外部サービスに送信
  if (process.env.NODE_ENV === 'production') {
    // TODO: Datadog, Sentry等の外部サービスへの送信
    logger.error(JSON.stringify(logData));
  } else {
    logger.error('API Error:', logData);
  }
}

/**
 * 監査ログヘルパー（API操作の記録）
 */
export function createAuditLog(context: {
  action: string;
  userId: string;
  userEmail: string;
  resource: string;
  resourceId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  ipAddress?: string;
}): {
  action: string;
  user_id: string;
  user_email: string;
  resource_type: string;
  resource_id?: string;
  before_value?: object;
  after_value?: object;
  ip_address?: string;
  created_at: string;
} {
  const auditLog: {
    action: string;
    user_id: string;
    user_email: string;
    resource_type: string;
    resource_id?: string;
    before_value?: object;
    after_value?: object;
    ip_address?: string;
    created_at: string;
  } = {
    action: context.action,
    user_id: context.userId,
    user_email: context.userEmail,
    resource_type: context.resource,
    created_at: new Date().toISOString(),
  };

  if (context.resourceId !== undefined)
    auditLog.resource_id = context.resourceId;
  if (context.beforeValue !== undefined)
    auditLog.before_value = context.beforeValue as object;
  if (context.afterValue !== undefined)
    auditLog.after_value = context.afterValue as object;
  if (context.ipAddress !== undefined) auditLog.ip_address = context.ipAddress;

  return auditLog;
}

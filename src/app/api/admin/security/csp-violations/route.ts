/**
 * CSP違反一覧API
 * Phase 3B: CSP違反の詳細データ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { canAccessClinicScope } from '@/lib/supabase';

// クエリパラメータのスキーマ
const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 50)),
  offset: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 0)),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  directive: z.string().optional(),
  client_ip: z.string().optional(),
  clinic_id: z.string().uuid().optional(),
  hours: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 24)),
});

function optionalSearchParam(value: string | null): string | undefined {
  return value ?? undefined;
}

export async function GET(request: NextRequest) {
  try {
    const requestedClinicId = request.nextUrl.searchParams.get('clinic_id');
    const auth = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: requestedClinicId,
      requireClinicMatch: requestedClinicId !== null,
    });
    if (!auth.success) {
      return auth.error!;
    }

    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse({
      limit: optionalSearchParam(searchParams.get('limit')),
      offset: optionalSearchParam(searchParams.get('offset')),
      severity: searchParams.get('severity') ?? undefined,
      directive: optionalSearchParam(searchParams.get('directive')),
      client_ip: optionalSearchParam(searchParams.get('client_ip')),
      clinic_id: requestedClinicId ?? undefined,
      hours: optionalSearchParam(searchParams.get('hours')),
    });

    const supabase = auth.supabase;
    const clinicId = params.clinic_id ?? auth.permissions?.clinic_id;

    // 期間設定
    const sinceTime = new Date();
    sinceTime.setHours(sinceTime.getHours() - params.hours);

    // クエリ構築
    let query = supabase
      .from('csp_violations')
      .select(
        `
        id,
        document_uri,
        violated_directive,
        blocked_uri,
        effective_directive,
        original_policy,
        disposition,
        line_number,
        column_number,
        source_file,
        script_sample,
        client_ip,
        user_agent,
        referrer,
        severity,
        threat_score,
        is_false_positive,
        created_at
      `
      )
      .gte('created_at', sinceTime.toISOString())
      .order('created_at', { ascending: false });

    // clinic_id フィルタ
    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    // フィルター適用
    if (params.severity) {
      query = query.eq('severity', params.severity);
    }

    if (params.directive) {
      query = query.ilike('violated_directive', `%${params.directive}%`);
    }

    if (params.client_ip) {
      query = query.eq('client_ip', params.client_ip);
    }

    // ページネーション
    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + params.limit - 1);
    }

    const { data: violations, error, count } = await query;

    if (error) {
      throw error;
    }

    const severityStats =
      violations?.reduce(
        (acc, v) => {
          acc[v.severity] = (acc[v.severity] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ) || {};

    const response = {
      violations: violations || [],
      total_count: count || 0,
      params: {
        limit: params.limit,
        offset: params.offset,
        hours: params.hours,
        filters: {
          severity: params.severity,
          directive: params.directive,
          client_ip: params.client_ip,
        },
      },
      statistics: {
        severity_breakdown: severityStats,
        period_hours: params.hours,
        generated_at: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('CSP違反一覧取得エラー:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'クエリパラメータが無効です',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'CSP違反一覧の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * CSP違反の手動レビュー・更新
 */
export async function PATCH(request: NextRequest) {
  try {
    const preflightBody = await request
      .clone()
      .json()
      .catch(() => null);
    const preflightClinicId =
      preflightBody &&
      typeof preflightBody === 'object' &&
      'clinic_id' in preflightBody &&
      typeof preflightBody.clinic_id === 'string'
        ? preflightBody.clinic_id
        : null;

    const auth = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: preflightClinicId,
      requireClinicMatch: preflightClinicId !== null,
      sanitizeInputValues: true,
    });
    if (!auth.success) {
      return auth.error!;
    }

    const body = auth.body as Record<string, unknown> | undefined;
    const violationId =
      body && typeof body.violationId === 'string' ? body.violationId : '';
    const is_false_positive =
      body && typeof body.is_false_positive === 'boolean'
        ? body.is_false_positive
        : undefined;
    const notes =
      body && typeof body.notes === 'string' ? body.notes : undefined;
    const clinicId =
      body && typeof body.clinic_id === 'string'
        ? body.clinic_id
        : auth.permissions?.clinic_id;

    if (!violationId) {
      return NextResponse.json(
        { error: 'violationId は必須です' },
        { status: 400 }
      );
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id は必須です' },
        { status: 400 }
      );
    }

    if (!canAccessClinicScope(auth.permissions, clinicId)) {
      return NextResponse.json(
        { error: 'このクリニックへのアクセス権がありません' },
        { status: 403 }
      );
    }

    const supabase = auth.supabase;

    const { data, error } = await supabase
      .from('csp_violations')
      .update({
        is_false_positive,
        notes,
        reviewed_by: auth.auth.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', violationId)
      .eq('clinic_id', clinicId)
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'CSP違反レビューが更新されました',
      violation: data?.[0],
    });
  } catch (error) {
    console.error('CSP違反レビュー更新エラー:', error);

    return NextResponse.json(
      {
        error: 'CSP違反レビューの更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

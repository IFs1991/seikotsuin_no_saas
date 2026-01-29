/**
 * CSP違反一覧API
 * Phase 3B: CSP違反の詳細データ取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';

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
  hours: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val) : 24)),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, {
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
      requireClinicMatch: false,
    });
    if (!auth.success) {
      return auth.error!;
    }

    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      severity: searchParams.get('severity') as any,
      directive: searchParams.get('directive'),
      client_ip: searchParams.get('client_ip'),
      hours: searchParams.get('hours'),
    });

    const supabase = await createClient();

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

    // 統計情報も含める
    const statsQuery = await supabase
      .from('csp_violations')
      .select('severity', { count: 'exact' })
      .gte('created_at', sinceTime.toISOString());

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
    const auth = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
      requireClinicMatch: false,
      sanitizeInputValues: true,
    });
    if (!auth.success) {
      return auth.error!;
    }

    const body = auth.body as Record<string, unknown> | undefined;
    const violationId =
      body && typeof body.violationId === 'string' ? body.violationId : '';
    const is_false_positive = body
      ? (body as any).is_false_positive
      : undefined;
    const notes = body ? (body as any).notes : undefined;

    if (!violationId) {
      return NextResponse.json(
        { error: 'violationId は必須です' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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

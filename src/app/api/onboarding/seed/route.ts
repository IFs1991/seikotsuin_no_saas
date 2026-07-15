/**
 * POST /api/onboarding/seed
 *
 * Step 4: 初期マスタ投入 + オンボーディング完了
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getServerClient,
  getCurrentUser,
  getUserAccessContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import { normalizeRole } from '@/lib/constants/roles';
import { AppError } from '@/lib/error-handler';
import { seedMasterSchema } from '../schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const user = await getCurrentUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // リクエストボディを取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: '無効なJSONデータです' },
        { status: 400 }
      );
    }

    // バリデーション
    const parsed = seedMasterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: '入力値にエラーがあります',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    // オンボーディング状態からclinic_idを取得
    const { data: state, error: stateLookupError } = await supabase
      .from('onboarding_states')
      .select('clinic_id, current_step, metadata')
      .eq('user_id', user.id)
      .single();

    if (stateLookupError) {
      console.error('Onboarding state lookup error:', stateLookupError);
      return NextResponse.json(
        { success: false, error: 'オンボーディング状態の取得に失敗しました' },
        { status: 500 }
      );
    }

    if (!state?.clinic_id) {
      return NextResponse.json(
        { success: false, error: 'クリニックが作成されていません' },
        { status: 400 }
      );
    }

    if (state.current_step !== 'seed') {
      return NextResponse.json(
        { success: false, error: '初期設定を実行できる段階ではありません' },
        { status: 409 }
      );
    }

    let accessContext;
    try {
      accessContext = await getUserAccessContext(user.id, supabase, { user });
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 503) {
        return NextResponse.json(
          {
            success: false,
            error: '認証情報を確認できません。時間をおいて再度お試しください',
          },
          { status: 503 }
        );
      }
      throw error;
    }

    const canonicalClinicIds = accessContext.permissions
      ? resolveScopedClinicIds(accessContext.permissions)
      : null;
    if (
      !accessContext.isActive ||
      !accessContext.permissions ||
      normalizeRole(accessContext.permissions.role) !== 'admin' ||
      !canonicalClinicIds?.includes(state.clinic_id)
    ) {
      return NextResponse.json(
        { success: false, error: '初期設定を実行する権限がありません' },
        { status: 403 }
      );
    }

    const { treatment_menus, payment_methods, patient_types } = parsed.data;

    const clinicId = state.clinic_id;
    // The service-role client is created only after authenticated subject,
    // active profile, DB role, canonical scope, and workflow-step checks pass.
    const adminClient = createAdminClient();

    // 施術メニュー投入（all-or-nothing: 1件でも失敗したら中断）
    const menuCount = { success: 0, failed: 0 };
    const menuErrors: string[] = [];

    for (const [index, menu] of treatment_menus.entries()) {
      const { error } = await adminClient.from('menus').insert({
        clinic_id: clinicId,
        name: menu.name,
        price: menu.price,
        duration_minutes: menu.duration_minutes ?? 30,
        description: menu.description?.trim() ? menu.description : null,
        is_active: true,
        created_by: user.id,
        display_order: index,
      });

      if (error) {
        menuCount.failed++;
        menuErrors.push(`${menu.name}: ${error.message}`);
        console.error('Treatment menu insert error:', error);
      } else {
        menuCount.success++;
      }
    }

    // メニュー投入に失敗があれば中断（completed に遷移しない）
    if (menuCount.failed > 0) {
      return NextResponse.json(
        {
          success: false,
          error: '施術メニューの投入に失敗しました',
          details: menuErrors,
          menu_count: menuCount,
        },
        { status: 500 }
      );
    }

    // Payment/patient preferences are tenant onboarding input. Persist them on
    // the caller-owned state instead of mutating globally shared master rows.
    const existingMetadata = isRecord(state.metadata) ? state.metadata : {};
    const { data: completedState, error: stateError } = await supabase
      .from('onboarding_states')
      .update({
        current_step: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...existingMetadata,
          seed_preferences: {
            payment_methods,
            patient_types,
          },
        },
      })
      .eq('user_id', user.id)
      .eq('clinic_id', clinicId)
      .eq('current_step', 'seed')
      .select('current_step')
      .maybeSingle();

    if (stateError || !completedState) {
      console.error('Onboarding completion error:', stateError);
      return NextResponse.json(
        { success: false, error: 'オンボーディングの完了に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        completed: true,
        menu_count: menuCount,
      },
    });
  } catch (error) {
    console.error('Seed master error:', error);
    return NextResponse.json(
      { success: false, error: '初期マスタの投入に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/onboarding/seed
 *
 * Step 4: 初期マスタ投入 + オンボーディング完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getCurrentUser } from '@/lib/supabase';
import { seedMasterSchema } from '../schema';

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
    const { data: state } = await supabase
      .from('onboarding_states')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (!state?.clinic_id) {
      return NextResponse.json(
        { success: false, error: 'クリニックが作成されていません' },
        { status: 400 }
      );
    }

    const { treatment_menus, payment_methods, patient_types } = parsed.data;

    const clinicId = state.clinic_id;

    // 施術メニュー投入
    for (const menu of treatment_menus) {
      const { error } = await supabase.from('master_treatment_menus').insert({
        clinic_id: clinicId,
        name: menu.name,
        price: menu.price,
        description: menu.description ?? null,
        is_active: true,
      });

      if (error) {
        console.error('Treatment menu insert error:', error);
        // 続行（一部失敗しても他は投入）
      }
    }

    // 支払方法投入
    for (const method of payment_methods) {
      const { error } = await supabase.from('master_payment_methods').insert({
        clinic_id: clinicId,
        name: method,
        is_active: true,
      });

      if (error) {
        console.error('Payment method insert error:', error);
      }
    }

    // 患者タイプ投入
    for (const type of patient_types) {
      const { error } = await supabase.from('master_patient_types').insert({
        clinic_id: clinicId,
        name: type,
      });

      if (error) {
        console.error('Patient type insert error:', error);
      }
    }

    // オンボーディング完了
    const { error: stateError } = await supabase
      .from('onboarding_states')
      .update({
        current_step: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (stateError) {
      console.error('Onboarding completion error:', stateError);
    }

    return NextResponse.json({
      success: true,
      data: {
        completed: true,
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

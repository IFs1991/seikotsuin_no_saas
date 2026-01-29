/**
 * POST /api/onboarding/clinic
 *
 * Step 2: クリニック作成 + profiles/user_permissions更新
 * RPC関数を使用してトランザクション内で一括処理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getCurrentUser } from '@/lib/supabase';
import { clinicCreateSchema } from '../schema';

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
    const parsed = clinicCreateSchema.safeParse(body);
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

    const { name, address, phone_number, opening_date, parent_id } =
      parsed.data;

    // RPC関数でトランザクション内で一括処理
    // parent_id support: @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md (Option 2)
    const { data: result, error: rpcError } = await supabase.rpc(
      'create_clinic_with_admin',
      {
        p_name: name,
        p_address: address ?? null,
        p_phone_number: phone_number ?? null,
        p_opening_date: opening_date ?? null,
        p_parent_id: parent_id ?? null,
      }
    );

    if (rpcError) {
      console.error('Clinic creation RPC error:', rpcError);
      return NextResponse.json(
        { success: false, error: 'クリニックの作成に失敗しました' },
        { status: 500 }
      );
    }

    // RPC関数の結果を確認
    const rpcResult = result as {
      success: boolean;
      clinic_id?: string;
      error?: string;
    };

    if (!rpcResult.success) {
      console.error('Clinic creation failed:', rpcResult.error);
      return NextResponse.json(
        {
          success: false,
          error: rpcResult.error || 'クリニックの作成に失敗しました',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          clinic_id: rpcResult.clinic_id,
          next_step: 'invites',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Clinic creation error:', error);
    return NextResponse.json(
      { success: false, error: 'クリニックの作成に失敗しました' },
      { status: 500 }
    );
  }
}

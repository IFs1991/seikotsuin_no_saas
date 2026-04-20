/**
 * POST /api/onboarding/clinic
 *
 * Step 2: クリニック作成 + profiles/user_permissions更新
 * RPC関数を使用してトランザクション内で一括処理
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getServerClient,
  getCurrentUser,
} from '@/lib/supabase';
import { clinicCreateSchema } from '../schema';

const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';

function resolveStaffName(
  email: string,
  fullName: string | null | undefined,
  metadata: Record<string, unknown> | undefined
): string {
  const normalizedFullName = fullName?.trim();
  if (normalizedFullName) {
    return normalizedFullName;
  }

  const metadataName =
    typeof metadata?.full_name === 'string'
      ? metadata.full_name.trim()
      : typeof metadata?.name === 'string'
        ? metadata.name.trim()
        : '';

  if (metadataName) {
    return metadataName;
  }

  return email.split('@')[0] || '管理者';
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

    const adminClient = createAdminClient();
    const staffEmail = user.email?.trim() || `${user.id}@placeholder.local`;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Onboarding profile lookup error:', profileError);
    }

    const staffName = resolveStaffName(
      staffEmail,
      profile?.full_name,
      user.user_metadata
    );

    const { data: existingStaff, error: staffLookupError } = await adminClient
      .from('staff')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (staffLookupError) {
      console.error('Onboarding staff lookup error:', staffLookupError);
      return NextResponse.json(
        { success: false, error: 'クリニック作成の準備に失敗しました' },
        { status: 500 }
      );
    }

    if (!existingStaff) {
      const { error: staffInsertError } = await adminClient
        .from('staff')
        .insert({
          id: user.id,
          clinic_id: null,
          name: staffName,
          role: 'admin',
          email: staffEmail,
          password_hash: MANAGED_PASSWORD_PLACEHOLDER,
          is_therapist: false,
        });

      if (staffInsertError) {
        console.error('Onboarding staff seed error:', staffInsertError);
        return NextResponse.json(
          { success: false, error: 'クリニック作成の準備に失敗しました' },
          { status: 500 }
        );
      }
    }

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

    const { error: staffSyncError } = await adminClient
      .from('staff')
      .update({
        clinic_id: rpcResult.clinic_id,
        name: staffName,
        role: 'admin',
        email: staffEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (staffSyncError) {
      console.error('Onboarding staff sync error:', staffSyncError);
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

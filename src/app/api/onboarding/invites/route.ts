/**
 * POST /api/onboarding/invites
 *
 * Step 3: スタッフ招待（Supabase invite使用）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getCurrentUser, createAdminClient } from '@/lib/supabase/server';
import { staffInviteSchema } from '../schema';

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
    const parsed = staffInviteSchema.safeParse(body);
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

    const { invites } = parsed.data;
    const results: Array<{ email: string; success: boolean; error?: string }> = [];

    // 招待がある場合のみ処理
    if (invites.length > 0) {
      const adminClient = createAdminClient();

      for (const invite of invites) {
        try {
          // 1. Supabase Auth で招待メール送信
          const { data: authData, error: authError } =
            await adminClient.auth.admin.inviteUserByEmail(invite.email, {
              redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/callback?invited=true`,
            });

          if (authError) {
            results.push({
              email: invite.email,
              success: false,
              error: authError.message,
            });
            continue;
          }

          // 2. staff_invitesに記録
          const { error: inviteError } = await adminClient
            .from('staff_invites')
            .insert({
              clinic_id: state.clinic_id,
              email: invite.email,
              role: invite.role,
              created_by: user.id,
            });

          if (inviteError) {
            console.error('Staff invite record error:', inviteError);
            // 招待メールは送信済みなので成功扱い
          }

          // 3. 招待されたユーザーのprofilesを事前作成（オプション）
          if (authData?.user) {
            await adminClient.from('profiles').upsert(
              {
                user_id: authData.user.id,
                email: invite.email,
                full_name: invite.email.split('@')[0],
                clinic_id: state.clinic_id,
                role: invite.role,
                is_active: true,
              },
              { onConflict: 'user_id' }
            );
          }

          results.push({ email: invite.email, success: true });
        } catch (error) {
          console.error('Invite error for', invite.email, error);
          results.push({
            email: invite.email,
            success: false,
            error: 'Unknown error',
          });
        }
      }
    }

    // オンボーディング状態を更新
    const { error: stateError } = await supabase
      .from('onboarding_states')
      .update({
        current_step: 'seed',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (stateError) {
      console.error('Onboarding state update error:', stateError);
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        next_step: 'seed',
      },
    });
  } catch (error) {
    console.error('Staff invite error:', error);
    return NextResponse.json(
      { success: false, error: 'スタッフ招待に失敗しました' },
      { status: 500 }
    );
  }
}

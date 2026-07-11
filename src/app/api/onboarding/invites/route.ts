/**
 * POST /api/onboarding/invites
 *
 * Step 3: スタッフ招待（Supabase invite使用）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getServerClient,
  getCurrentUser,
  createAdminClient,
} from '@/lib/supabase';
import { assertEnv } from '@/lib/env';
import { staffInviteSchema } from '../schema';
import {
  createAuthLog,
  getSafeAuthErrorLogData,
} from '@/lib/auth/safe-auth-logging';
import {
  createStaffInviteToken,
  sendStaffInviteEmail,
  StaffInviteDeliveryTimeoutError,
} from '@/lib/auth/staff-invite';

const log = createAuthLog('OnboardingInvitesRoute');

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
    const results: Array<{ email: string; success: boolean; error?: string }> =
      [];

    // 招待がある場合のみ処理
    if (invites.length > 0) {
      const adminClient = createAdminClient();
      const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');

      for (const invite of invites) {
        const token = createStaffInviteToken();
        try {
          // メールと受諾画面で同じトークンを使い、先にDBへ記録する。
          const { data: inviteData, error: inviteError } = await supabase
            .from('staff_invites')
            .insert({
              clinic_id: state.clinic_id,
              email: invite.email,
              role: invite.role,
              created_by: user.id,
              token,
            })
            .select('id')
            .single();

          if (inviteError || !inviteData) {
            log.error(
              'Staff invite record error',
              getSafeAuthErrorLogData(inviteError)
            );
            results.push({
              email: invite.email,
              success: false,
              error:
                inviteError?.code === '23505'
                  ? 'このメールアドレスには招待を送信済みです'
                  : '招待を記録できませんでした',
            });
            continue;
          }

          const cleanupPendingInvite = async () => {
            const { error: cleanupError } = await adminClient
              .from('staff_invites')
              .delete()
              .eq('id', inviteData.id)
              .eq('clinic_id', state.clinic_id)
              .eq('created_by', user.id)
              .is('accepted_at', null);

            if (cleanupError) {
              log.error(
                'Staff invite cleanup error',
                getSafeAuthErrorLogData(cleanupError)
              );
            }
          };

          try {
            const inviteResult = await sendStaffInviteEmail({
              adminClient,
              appUrl,
              email: invite.email,
              token,
            });

            if (inviteResult.error) {
              log.error(
                'Staff invite delivery error',
                getSafeAuthErrorLogData(inviteResult.error)
              );
              await cleanupPendingInvite();
              results.push({
                email: invite.email,
                success: false,
                error: '招待メールを送信できませんでした',
              });
              continue;
            }
          } catch (deliveryError) {
            log.error(
              'Staff invite delivery error',
              getSafeAuthErrorLogData(deliveryError)
            );
            await cleanupPendingInvite();
            results.push({
              email: invite.email,
              success: false,
              error:
                deliveryError instanceof StaffInviteDeliveryTimeoutError
                  ? '招待メールの送信がタイムアウトしました'
                  : '招待メールを送信できませんでした',
            });
            continue;
          }

          results.push({ email: invite.email, success: true });
        } catch (error) {
          log.error('Invite processing error', getSafeAuthErrorLogData(error));
          results.push({
            email: invite.email,
            success: false,
            error: '招待を処理できませんでした',
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
      log.error(
        'Onboarding state update error',
        getSafeAuthErrorLogData(stateError)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        next_step: 'seed',
      },
    });
  } catch (error) {
    log.error('Staff invite error', getSafeAuthErrorLogData(error));
    return NextResponse.json(
      { success: false, error: 'スタッフ招待に失敗しました' },
      { status: 500 }
    );
  }
}

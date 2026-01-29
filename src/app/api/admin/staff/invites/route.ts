/**
 * POST /api/admin/staff/invites
 *
 * スタッフ招待API（管理設定画面用）
 * @spec docs/stabilization/admin-settings-staff-invite-todo.md
 * @spec docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';

// ================================================================
// Constants
// ================================================================

/**
 * inviteUserByEmail のタイムアウト時間（ミリ秒）
 * @see SI-02: 招待APIのタイムアウトガード
 */
const INVITE_TIMEOUT_MS = 10000;

/**
 * E2E_INVITE_MODE=skip が有効かどうかを判定
 * 本番環境(NODE_ENV=production)では常に無効
 * @see SI-03: E2E専用の招待スキップ
 */
const isE2EInviteSkipMode =
  process.env.E2E_INVITE_MODE === 'skip' &&
  process.env.NODE_ENV !== 'production';

// ================================================================
// Validation Schema
// ================================================================

// 招待可能なロールのみ許可（admin, clinic_adminは除外）
const INVITABLE_ROLES = ['therapist', 'staff', 'manager'] as const;

const StaffInviteRequestSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  role: z.enum(INVITABLE_ROLES, {
    errorMap: () => ({ message: '無効なロールです' }),
  }),
  full_name: z.string().trim().min(1).max(255).optional(),
});

// ================================================================
// POST Handler
// ================================================================

export async function POST(request: NextRequest) {
  try {
    // 認証・認可チェック
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, permissions, body, supabase } = processResult;

    // Zodバリデーション
    const parsed = StaffInviteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const { email, role, full_name } = parsed.data;

    // clinic_id取得（permissions.clinic_idから）
    const clinicId = permissions.clinic_id;
    if (!clinicId) {
      return createErrorResponse('クリニック情報が見つかりません', 400);
    }

    // 重複チェック（既に招待済みまたは登録済み）
    const { data: existing } = await supabase
      .from('staff_invites')
      .select('id, accepted_at')
      .eq('clinic_id', clinicId)
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      if (existing.accepted_at) {
        return createErrorResponse(
          'このメールアドレスは既に登録されています',
          409
        );
      }
      return createErrorResponse(
        'このメールアドレスには既に招待を送信済みです',
        409
      );
    }

    // ================================================================
    // Supabase Auth で招待メール送信
    // @see SI-02: タイムアウトガード
    // @see SI-03: E2E専用スキップ
    // ================================================================

    let authData: { user: { id: string } } | null = null;

    if (isE2EInviteSkipMode) {
      // E2Eモード: inviteUserByEmail をスキップし、ダミーのuser idを生成
      // staff_invites への INSERT のみで成功応答を返す
      authData = null;
    } else {
      // 本番モード: inviteUserByEmail を呼び出す（タイムアウト付き）
      const adminClient = createAdminClient();

      // タイムアウト用のPromise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('招待メール送信がタイムアウトしました'));
        }, INVITE_TIMEOUT_MS);
      });

      try {
        const inviteResult = await Promise.race([
          adminClient.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/callback?invited=true`,
          }),
          timeoutPromise,
        ]);

        if (inviteResult.error) {
          logError(inviteResult.error, {
            endpoint: '/api/admin/staff/invites',
            method: 'POST',
            userId: auth.id,
            params: { email, role, clinicId },
          });
          return createErrorResponse(
            `招待メールの送信に失敗しました: ${inviteResult.error.message}`,
            500
          );
        }

        authData = inviteResult.data;
      } catch (timeoutError) {
        logError(timeoutError, {
          endpoint: '/api/admin/staff/invites',
          method: 'POST',
          userId: auth.id,
          params: { email, role, clinicId },
        });
        return createErrorResponse(
          '招待メールの送信がタイムアウトしました。しばらく経ってから再度お試しください。',
          504
        );
      }
    }

    // staff_invites テーブルに記録
    const { data: inviteData, error: inviteError } = await supabase
      .from('staff_invites')
      .insert({
        clinic_id: clinicId,
        email,
        role,
        created_by: auth.id,
      })
      .select('id, email, role, created_at')
      .single();

    if (inviteError) {
      logError(inviteError, {
        endpoint: '/api/admin/staff/invites',
        method: 'POST',
        userId: auth.id,
        params: { email, role, clinicId },
      });

      // ユニーク制約違反
      if (inviteError.code === '23505') {
        return createErrorResponse(
          'このメールアドレスには既に招待を送信済みです',
          409
        );
      }

      return createErrorResponse('招待の記録に失敗しました', 500);
    }

    // profiles にも事前作成（オプション、オンボーディングと同様）
    if (authData?.user) {
      await supabase.from('profiles').upsert(
        {
          user_id: authData.user.id,
          email,
          full_name: full_name || email.split('@')[0],
          clinic_id: clinicId,
          role,
          is_active: true,
        },
        { onConflict: 'user_id' }
      );
    }

    // 監査ログ記録（非ブロッキング）
    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'staff_invite_send',
      inviteData.id,
      {
        clinic_id: clinicId,
        invited_email: email,
        role,
      }
    );

    return createSuccessResponse(
      {
        invite_id: inviteData.id,
        email: inviteData.email,
        role: inviteData.role,
        message: '招待メールを送信しました',
      },
      201
    );
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/staff/invites',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

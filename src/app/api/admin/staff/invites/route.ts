/**
 * POST /api/admin/staff/invites
 *
 * スタッフ招待API（店舗単位のスタッフ管理導線用）
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
import {
  ADMIN_UI_ROLES,
  STAFF_INVITE_ROLE_VALUES,
} from '@/lib/constants/roles';
import { assertEnv } from '@/lib/env';
import { createAdminClient, resolveScopedClinicIds } from '@/lib/supabase';
import { getSafeAuthErrorLogData } from '@/lib/auth/safe-auth-logging';
import {
  createStaffInviteToken,
  sendStaffInviteEmail,
  StaffInviteDeliveryTimeoutError,
} from '@/lib/auth/staff-invite';

// ================================================================
// Constants
// ================================================================

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

const StaffInviteRequestSchema = z.object({
  clinic_id: z.string().uuid('クリニックIDの形式が不正です'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('有効なメールアドレスを入力してください'),
  role: z.enum(STAFF_INVITE_ROLE_VALUES, {
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
      return processResult.error;
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

    const { clinic_id: clinicId, email, role, full_name } = parsed.data;

    // A multi-clinic canonical scope has no safe implicit write target. The
    // caller must name the clinic and it must be in the DB/JWT intersection.
    const scopedClinicIds = resolveScopedClinicIds(permissions);
    if (!scopedClinicIds?.includes(clinicId)) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
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

    // 受諾画面とメールの双方で同じ不透明トークンを使用する。
    // メールを先に送ると、記録作成前にリンクが開かれる競合が起きるため先に記録する。
    const inviteToken = createStaffInviteToken();
    const { data: inviteData, error: inviteError } = await supabase
      .from('staff_invites')
      .insert({
        clinic_id: clinicId,
        email,
        role,
        created_by: auth.id,
        token: inviteToken,
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

    if (!isE2EInviteSkipMode) {
      const adminClient = createAdminClient();
      const cleanupPendingInvite = async () => {
        const { error: cleanupError } = await adminClient
          .from('staff_invites')
          .delete()
          .eq('id', inviteData.id)
          .eq('clinic_id', clinicId)
          .eq('created_by', auth.id)
          .is('accepted_at', null);

        if (cleanupError) {
          logError(cleanupError, {
            endpoint: '/api/admin/staff/invites',
            method: 'POST',
            userId: auth.id,
            params: { inviteId: inviteData.id, clinicId },
          });
        }
      };

      try {
        const inviteResult = await sendStaffInviteEmail({
          adminClient,
          appUrl: assertEnv('NEXT_PUBLIC_APP_URL'),
          email,
          token: inviteToken,
          ...(full_name ? { metadata: { full_name } } : {}),
        });

        if (inviteResult.error) {
          logError(getSafeAuthErrorLogData(inviteResult.error), {
            endpoint: '/api/admin/staff/invites',
            method: 'POST',
            userId: auth.id,
            params: { role, clinicId },
          });
          await cleanupPendingInvite();
          return createErrorResponse(
            '招待メールを送信できませんでした。しばらく経ってから再度お試しください。',
            502,
            undefined,
            'INVITE_DELIVERY_FAILED'
          );
        }
      } catch (deliveryError) {
        logError(getSafeAuthErrorLogData(deliveryError), {
          endpoint: '/api/admin/staff/invites',
          method: 'POST',
          userId: auth.id,
          params: { role, clinicId },
        });
        await cleanupPendingInvite();

        if (deliveryError instanceof StaffInviteDeliveryTimeoutError) {
          return createErrorResponse(
            '招待メールの送信がタイムアウトしました。しばらく経ってから再度お試しください。',
            504,
            undefined,
            'INVITE_DELIVERY_TIMEOUT'
          );
        }

        return createErrorResponse(
          '招待メールを送信できませんでした。しばらく経ってから再度お試しください。',
          502,
          undefined,
          'INVITE_DELIVERY_FAILED'
        );
      }
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

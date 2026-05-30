import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { emailSchema, passwordSchema } from '@/lib/schemas/auth';
import { createAdminClient } from '@/lib/supabase';
import { isHqAdminActor } from '../access';

const AccountOnlyCreateSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
});

type CreateAccountError = {
  message?: string | null;
};

const mapCreateAccountErrorMessage = (error?: CreateAccountError | null) => {
  const normalizedMessage = error?.message?.toLowerCase();
  if (
    normalizedMessage?.includes('already') ||
    normalizedMessage?.includes('registered')
  ) {
    return 'ログインメールアドレスは既に使用されています';
  }

  return 'アカウントの作成に失敗しました';
};

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, body } = processResult;
    if (!isHqAdminActor(permissions)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = AccountOnlyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const fullName = parsed.data.full_name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const adminClient = createAdminClient();

    const { data: authData, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createUserError || !authData.user) {
      logError(createUserError, {
        endpoint: '/api/admin/users/accounts',
        method: 'POST',
        userId: auth.id,
        params: { email, stage: 'create_auth_user' },
      });
      return createErrorResponse(
        mapCreateAccountErrorMessage(createUserError),
        400
      );
    }

    const createdUserId = authData.user.id;
    const timestamp = new Date().toISOString();
    const { error: profileError } = await adminClient.from('profiles').upsert(
      {
        user_id: createdUserId,
        email,
        full_name: fullName,
        clinic_id: null,
        role: 'staff',
        is_active: true,
        updated_at: timestamp,
      },
      { onConflict: 'user_id' }
    );

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUserId);
      logError(profileError, {
        endpoint: '/api/admin/users/accounts',
        method: 'POST',
        userId: auth.id,
        params: { email, stage: 'upsert_profiles' },
      });
      return createErrorResponse('プロフィールの作成に失敗しました', 500);
    }

    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'account_only_create',
      createdUserId,
      {
        user_id: createdUserId,
        email,
        permission_status: 'unassigned',
      }
    );

    return createSuccessResponse(
      {
        id: createdUserId,
        email,
        full_name: fullName,
        permission_status: 'unassigned',
        role: null,
        clinic_id: null,
      },
      201
    );
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/accounts',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

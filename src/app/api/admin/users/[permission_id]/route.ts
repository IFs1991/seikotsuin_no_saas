import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

const ROLE_VALUES = [
  'admin',
  'clinic_admin',
  'therapist',
  'staff',
  'manager',
] as const;

const PermissionUpdateSchema = z
  .object({
    role: z.enum(ROLE_VALUES).optional(),
    clinic_id: z.string().uuid().nullable().optional(),
    revoke: z.boolean().optional(),
  })
  .refine(
    data =>
      data.revoke === true ||
      data.role !== undefined ||
      data.clinic_id !== undefined,
    {
      message: '更新対象が指定されていません',
    }
  );

const requireAdmin = (role: string) => role === 'admin';

export async function PATCH(
  request: NextRequest,
  context: { params: { permission_id: string } }
) {
  const { permission_id } = context.params;

  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth, permissions, body } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = PermissionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    if (parsed.data.revoke) {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('id', permission_id);

      if (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id },
        });
        return createErrorResponse('権限の剥奪に失敗しました', 500);
      }

      await AuditLogger.logAdminAction(
        auth.id,
        auth.email,
        'permission_revoke',
        permission_id
      );

      return createSuccessResponse({ id: permission_id, revoked: true });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.role !== undefined) updatePayload.role = parsed.data.role;
    if (parsed.data.clinic_id !== undefined)
      updatePayload.clinic_id = parsed.data.clinic_id;

    const { data, error } = await supabase
      .from('user_permissions')
      .update(updatePayload)
      .eq('id', permission_id)
      .select('id, staff_id, role, clinic_id, username, created_at')
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/users/[permission_id]',
        method: 'PATCH',
        userId: auth.id,
        params: { permission_id },
      });
      return createErrorResponse('権限の更新に失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'permission_update',
      permission_id,
      updatePayload
    );

    return createSuccessResponse(data);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/[permission_id]',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

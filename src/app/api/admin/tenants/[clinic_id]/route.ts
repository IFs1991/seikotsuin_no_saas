import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

const ClinicUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    address: z.string().max(500).optional().nullable(),
    phone_number: z.string().max(50).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .refine(
    data =>
      data.name !== undefined ||
      data.address !== undefined ||
      data.phone_number !== undefined ||
      data.is_active !== undefined,
    {
      message: '更新対象が指定されていません',
    }
  );

const requireAdmin = (role: string) => role === 'admin';

export async function PATCH(
  request: NextRequest,
  context: { params: { clinic_id: string } }
) {
  const { clinic_id } = context.params;

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

    const parsed = ClinicUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.address !== undefined)
      updatePayload.address = parsed.data.address;
    if (parsed.data.phone_number !== undefined)
      updatePayload.phone_number = parsed.data.phone_number;
    if (parsed.data.is_active !== undefined)
      updatePayload.is_active = parsed.data.is_active;

    const { data, error } = await supabase
      .from('clinics')
      .update(updatePayload)
      .eq('id', clinic_id)
      .select('id, name, address, phone_number, is_active, created_at')
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tenants/[clinic_id]',
        method: 'PATCH',
        userId: auth.id,
        params: { clinic_id },
      });
      return createErrorResponse('クリニックの更新に失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_update',
      clinic_id,
      updatePayload
    );

    return createSuccessResponse(data);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tenants/[clinic_id]',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

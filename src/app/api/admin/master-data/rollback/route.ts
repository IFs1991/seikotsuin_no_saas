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

const rollbackPayloadSchema = z.object({
  clinic_id: z.string().uuid().nullable().optional(),
});

const normalizeClinicId = (raw?: string | null) => {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'null' || normalized === 'global') {
    return null;
  }
  return raw;
};

const buildSnapshotKey = (clinicId: string | null) =>
  `system_settings_snapshot:${clinicId ?? 'global'}`;

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase, body, permissions } = processResult;

    const validationResult = rollbackPayloadSchema.safeParse(body ?? {});
    if (!validationResult.success) {
      return createErrorResponse(
        'バリデーションエラー',
        400,
        validationResult.error.errors
      );
    }

    const normalizedClinicId = normalizeClinicId(
      validationResult.data.clinic_id
    );
    const effectiveClinicId =
      normalizedClinicId ??
      (permissions.role === 'clinic_admin'
        ? (permissions.clinic_id ?? null)
        : null);

    const snapshotKey = buildSnapshotKey(effectiveClinicId ?? null);
    const { data: snapshotRow, error: snapshotError } = await (supabase
      .from('temporary_data') as any)
      .select('data')
      .eq('key', snapshotKey)
      .maybeSingle();

    if (snapshotError) {
      logError(snapshotError, {
        endpoint: '/api/admin/master-data/rollback',
        method: 'POST',
        userId: auth.id,
        params: { clinicId: validationResult.data.clinic_id },
      });
      return createErrorResponse('スナップショットの取得に失敗しました', 500);
    }

    const snapshotPayload = snapshotRow?.data as
      | { items?: Array<Record<string, unknown>> }
      | undefined;
    const items = snapshotPayload?.items;

    if (!Array.isArray(items)) {
      return createErrorResponse('復元対象のスナップショットが見つかりません', 404);
    }

    let deleteQuery = (supabase.from('system_settings') as any).delete();
    if (effectiveClinicId === null) {
      deleteQuery = deleteQuery.is('clinic_id', null);
    } else if (effectiveClinicId) {
      deleteQuery = deleteQuery.eq('clinic_id', effectiveClinicId);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      logError(deleteError, {
        endpoint: '/api/admin/master-data/rollback',
        method: 'POST',
        userId: auth.id,
        params: { clinicId: validationResult.data.clinic_id },
      });
      return createErrorResponse('既存データの削除に失敗しました', 500);
    }

    const rows = items.map(item => ({
      clinic_id: (item.clinic_id as string | null | undefined) ?? null,
      key: item.name,
      value: JSON.stringify(item.value),
      data_type: item.data_type ?? 'string',
      description: item.description,
      is_editable: item.is_editable ?? true,
      is_public: item.is_public ?? false,
      display_order: item.display_order ?? 0,
      updated_by: auth.id,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: insertError } = await (supabase
        .from('system_settings') as any)
        .insert(rows);

      if (insertError) {
        logError(insertError, {
          endpoint: '/api/admin/master-data/rollback',
          method: 'POST',
          userId: auth.id,
          params: { clinicId: validationResult.data.clinic_id },
        });
        return createErrorResponse('スナップショットの復元に失敗しました', 500);
      }
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'rollback_master_data',
      undefined,
      {
        count: rows.length,
        clinic_id: effectiveClinicId,
      }
    );

    return createSuccessResponse({ restored: rows.length });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data/rollback',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

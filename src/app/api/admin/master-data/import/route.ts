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

const importItemSchema = z.object({
  id: z.string().uuid().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(255, '名前は255文字以内で入力してください'),
  category: z.string().optional(),
  value: z.unknown(),
  data_type: z
    .enum(['string', 'number', 'boolean', 'json', 'array'])
    .optional()
    .default('string'),
  description: z.string().max(500).optional(),
  is_editable: z.boolean().optional().default(true),
  is_public: z.boolean().optional().default(false),
  display_order: z.number().int().optional().default(0),
});

const importPayloadSchema = z.object({
  items: z.array(importItemSchema).min(1, 'itemsは必須です'),
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

    const validationResult = importPayloadSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(
        'バリデーションエラー',
        400,
        validationResult.error.errors
      );
    }

    const { items, clinic_id } = validationResult.data;
    const normalizedClinicId = normalizeClinicId(clinic_id);
    const defaultClinicId =
      normalizedClinicId ??
      (permissions.role === 'clinic_admin'
        ? (permissions.clinic_id ?? null)
        : null);

    const rows = items.map(item => {
      const itemClinicId = item.clinic_id ?? defaultClinicId ?? null;
      if (
        permissions.role !== 'admin' &&
        itemClinicId &&
        permissions.clinic_id !== itemClinicId
      ) {
        throw new Error('指定されたクリニックへのアクセス権限がありません');
      }
      return {
        clinic_id: itemClinicId,
        key: item.name,
        value: JSON.stringify(item.value),
        data_type: item.data_type ?? 'string',
        description: item.description,
        is_editable: item.is_editable ?? true,
        is_public: item.is_public ?? false,
        display_order: item.display_order ?? 0,
        updated_by: auth.id,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await (supabase.from('system_settings') as any).upsert(
      rows,
      { onConflict: 'clinic_id,key' }
    );

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data/import',
        method: 'POST',
        userId: auth.id,
        params: { clinicId: clinic_id },
      });
      return createErrorResponse('データの取り込みに失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'import_master_data',
      undefined,
      {
        count: rows.length,
        clinic_id: defaultClinicId,
      }
    );

    return createSuccessResponse({ imported: rows.length });
  } catch (error) {
    if (error instanceof Error && error.message.includes('アクセス権限')) {
      return createErrorResponse(error.message, 403);
    }

    logError(error, {
      endpoint: '/api/admin/master-data/import',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

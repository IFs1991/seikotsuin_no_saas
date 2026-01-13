import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import type { Database } from '@/types/supabase';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

// TODO: system_settings テーブルは clinic_settings に統合されたため、
// このAPIは clinic_settings の新しいスキーマに対応するリファクタリングが必要
type SystemSettingRow = {
  id: string;
  clinic_id: string;
  key: string;
  value: unknown;
  data_type?: string;
  category: string;
  description?: string;
  is_editable?: boolean;
  is_public?: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
};

const parseSettingValue = (raw: unknown) => {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const extractCategory = (key: string) =>
  key.includes('_') ? key.split('_')[0] : key;

const formatSystemSetting = (row: SystemSettingRow) => ({
  id: row.id,
  clinic_id: row.clinic_id,
  name: row.key,
  category: extractCategory(row.key),
  value: parseSettingValue(row.value),
  data_type: row.data_type ?? 'string',
  description: row.description ?? undefined,
  is_editable: row.is_editable ?? false,
  is_public: row.is_public ?? false,
  display_order: row.display_order ?? 0,
  updated_at: row.updated_at ?? undefined,
  updated_by: row.updated_by ?? undefined,
});

const normalizeClinicId = (raw: string | null) => {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.toLowerCase();
  if (normalized === 'null' || normalized === 'global') {
    return null;
  }
  return raw;
};

const buildSnapshotKey = (clinicId: string | null) =>
  `system_settings_snapshot:${clinicId ?? 'global'}`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicIdParam = searchParams.get('clinic_id');
    const normalizedClinicId = normalizeClinicId(clinicIdParam);

    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase, permissions } = processResult;

    let effectiveClinicId = normalizedClinicId;
    if (effectiveClinicId === undefined) {
      effectiveClinicId =
        permissions.role === 'clinic_admin'
          ? (permissions.clinic_id ?? null)
          : null;
    }

    let query = (supabase.from('system_settings') as any)
      .select('*')
      .order('key', { ascending: true })
      .order('display_order', { ascending: true });

    if (effectiveClinicId === null) {
      query = query.is('clinic_id', null);
    } else if (effectiveClinicId) {
      query = query.eq('clinic_id', effectiveClinicId);
    }

    const { data, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data/export',
        method: 'GET',
        userId: auth.id,
        params: { clinicId: clinicIdParam },
      });
      return createErrorResponse('データの取得に失敗しました', 500);
    }

    const formattedData = ((data ?? []) as SystemSettingRow[]).map(
      formatSystemSetting
    );

    const snapshotKey = buildSnapshotKey(effectiveClinicId ?? null);
    const snapshotPayload = {
      items: formattedData,
      exported_at: new Date().toISOString(),
      clinic_id: effectiveClinicId ?? null,
    };

    const { error: snapshotError } = await (supabase
      .from('temporary_data') as any)
      .upsert(
        [
          {
            key: snapshotKey,
            data: snapshotPayload,
            data_type: 'system_settings_snapshot',
            clinic_id: effectiveClinicId ?? null,
            user_id: auth.id,
            description: 'system_settings export snapshot',
          },
        ],
        { onConflict: 'key' }
      );

    if (snapshotError) {
      logError(snapshotError, {
        endpoint: '/api/admin/master-data/export',
        method: 'GET',
        userId: auth.id,
        params: { clinicId: clinicIdParam },
      });
      return createErrorResponse('スナップショットの保存に失敗しました', 500);
    }

    await AuditLogger.logDataExport(
      auth.id,
      auth.email,
      'system_settings',
      formattedData.length,
      effectiveClinicId ?? undefined
    );

    return createSuccessResponse({
      items: formattedData,
      snapshot_key: snapshotKey,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data/export',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

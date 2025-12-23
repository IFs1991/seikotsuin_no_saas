import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/lib/constants';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import type { Database } from '@/types/supabase';

type SystemSettingRow =
  Database['public']['Tables']['system_settings']['Row'];

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


// ================================================================
// マスターデータ管理 API - リファクタリング版
// ================================================================

// マスターデータ バリデーションスキーマ
const masterDataSchema = z.object({
  id: z.string().uuid().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(255, '名前は255文字以内で入力してください'),
  category: z
    .string()
    .min(1, 'カテゴリは必須です')
    .max(100, 'カテゴリは100文字以内で入力してください'),
  value: z.unknown(),
  data_type: z
    .enum(['string', 'number', 'boolean', 'json', 'array'], {
      errorMap: () => ({ message: '正しいデータ型を選択してください' }),
    })
    .default('string'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
  is_editable: z.boolean().default(true),
  is_public: z.boolean().default(false),
  display_order: z.number().int().default(0),
  updated_by: z.string().uuid().optional(),
});

// Zodスキーマからの型推論（現在未使用だが将来的に使用予定）
// type MasterDataItem = z.infer<typeof masterDataSchema>;

// GET: マスターデータ一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const clinicId = searchParams.get('clinic_id');
    const isPublic = searchParams.get('is_public');

    const clinicParam = clinicId?.toLowerCase() ?? undefined;
    const normalizedClinicId =
      clinicParam === 'null' || clinicParam === 'global' ? null : clinicParam;

    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin', 'clinic_manager'],
      clinicId: normalizedClinicId ?? null,
      requireClinicMatch:
        normalizedClinicId !== null && normalizedClinicId !== undefined,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase, permissions } = processResult;

    let effectiveClinicId = normalizedClinicId;
    if (
      effectiveClinicId === undefined &&
      permissions.role === 'clinic_manager'
    ) {
      effectiveClinicId = permissions.clinic_id ?? null;
    }

    let query = (supabase.from('system_settings') as any)
      .select('*')
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    // フィルター条件を追加
    if (category) {
      query = query.ilike('key', `${category}%`);
    }

    if (clinicParam === 'null' || clinicParam === 'global') {
      query = query.is('clinic_id', null);
    } else if (effectiveClinicId) {
      query = query.eq('clinic_id', effectiveClinicId);
    }

    if (isPublic) {
      query = query.eq('is_public', isPublic === 'true');
    }

    const { data, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'GET',
        userId: auth.id,
        params: { category, clinicId: clinicParam, isPublic },
      });
      return createErrorResponse('データの取得に失敗しました', 500);
    }

    // データを整形してフロントエンド用の形式に変換
    const formattedData = ((data ?? []) as SystemSettingRow[]).map(
      formatSystemSetting
    );

    return createSuccessResponse({
      items: formattedData,
      total: formattedData.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// POST: マスターデータ新規作成
export async function POST(request: NextRequest) {
  try {
    // 共通前処理（認証・サニタイゼーション）
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin', 'clinic_manager'],
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body, supabase, permissions } = processResult;

    // Zodバリデーション
    const validationResult = masterDataSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(
        ERROR_MESSAGES.VALIDATION_ERROR,
        400,
        validationResult.error.errors
      );
    }

    const {
      clinic_id,
      name,
      value,
      data_type,
      description,
      is_editable,
      is_public,
    } = validationResult.data;

    if (
      permissions.role !== 'admin' &&
      clinic_id &&
      permissions.clinic_id !== clinic_id
    ) {
      return createErrorResponse(
        '指定されたクリニックへのアクセス権限がありません',
        403
      );
    }

    const targetClinicId =
      clinic_id ??
      (permissions.role === 'clinic_manager'
        ? (permissions.clinic_id ?? null)
        : null);

    // system_settingsテーブルに挿入
    const { data, error } = await (supabase
      .from('system_settings') as any)
      .insert([
        {
          clinic_id: targetClinicId,
          key: name,
          value: JSON.stringify(value),
          data_type: data_type || 'string',
          description,
          is_editable: is_editable !== false,
          is_public: is_public === true,
          updated_by: auth.id,
        },
      ])
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'POST',
        userId: auth.id,
        params: { name },
      });
      return createErrorResponse('データの作成に失敗しました', 500);
    }

    // レスポンス用にデータを整形
    const inserted = data as SystemSettingRow;
    const formattedData = formatSystemSetting(inserted);

    // 監査ログ記録
    await AuditLogger.logDataAccess(
      auth.id,
      auth.email,
      'system_settings',
      inserted.id,
      inserted.clinic_id || undefined
    );

    return createSuccessResponse(formattedData, 201, SUCCESS_MESSAGES.CREATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// PUT: マスターデータ更新
export async function PUT(request: NextRequest) {
  try {
    // 共通前処理（認証・サニタイゼーション）
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin', 'clinic_manager'],
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body, supabase, permissions } = processResult;

    if (!body || typeof body !== 'object' || !('id' in body) || !body.id) {
      return createErrorResponse('IDが指定されていません', 400);
    }

    // Zodバリデーション（部分更新対応）
    const validationResult = masterDataSchema.partial().safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(
        ERROR_MESSAGES.VALIDATION_ERROR,
        400,
        validationResult.error.errors
      );
    }

    const {
      id,
      clinic_id,
      name,
      value,
      data_type,
      description,
      is_editable,
      is_public,
    } = validationResult.data;

    // 更新データを準備
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: auth.id,
    };

    if (name !== undefined) updateData.key = name;
    if (value !== undefined) updateData.value = JSON.stringify(value);
    if (data_type !== undefined) updateData.data_type = data_type;
    if (description !== undefined) updateData.description = description;
    if (is_editable !== undefined) updateData.is_editable = is_editable;
    if (is_public !== undefined) updateData.is_public = is_public;
    if (clinic_id !== undefined) updateData.clinic_id = clinic_id;

    const { data, error } = await (supabase
      .from('system_settings') as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'PUT',
        userId: auth.id,
        params: { id, name },
      });
      return createErrorResponse('データの更新に失敗しました', 500);
    }

    // レスポンス用にデータを整形
    const updated = data as SystemSettingRow;
    const formattedData = formatSystemSetting(updated);

    if (
      permissions.role !== 'admin' &&
      data.clinic_id &&
      permissions.clinic_id !== data.clinic_id
    ) {
      return createErrorResponse(
        '指定されたクリニックへのアクセス権限がありません',
        403
      );
    }

    // 監査ログ記録
    await AuditLogger.logDataModify(
      auth.id,
      auth.email,
      'system_settings',
      updated.id,
      updateData,
      updated.clinic_id || undefined
    );

    return createSuccessResponse(formattedData, 200, SUCCESS_MESSAGES.UPDATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'PUT',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// DELETE: マスターデータ削除
export async function DELETE(request: NextRequest) {
  try {
    // 共通前処理（認証・認可チェック）
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin', 'clinic_manager'],
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase, permissions } = processResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return createErrorResponse('IDが指定されていません', 400);
    }

    // 削除前に対象データを取得（編集可能チェック）
    const { data: existingData, error: fetchError } = await (supabase
      .from('system_settings') as any)
      .select('is_editable, clinic_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existingData) {
      return createErrorResponse('データが見つかりません', 404);
    }

    const settingMeta = existingData as Pick<
      SystemSettingRow,
      'clinic_id' | 'is_editable'
    >;

    if (
      permissions.role !== 'admin' &&
      settingMeta.clinic_id &&
      permissions.clinic_id !== settingMeta.clinic_id
    ) {
      return createErrorResponse(
        '指定されたクリニックへのアクセス権限がありません',
        403
      );
    }

    if (!settingMeta.is_editable) {
      return createErrorResponse('編集不可のデータは削除できません', 403);
    }

    const { error } = await (supabase.from('system_settings') as any)
      .delete()
      .eq('id', id);

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'DELETE',
        userId: auth.id,
        params: { id },
      });
      return createErrorResponse('データの削除に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataDelete(
      auth.id,
      auth.email,
      'system_settings',
      id,
      settingMeta.clinic_id || undefined
    );

    return createSuccessResponse(null, 200, SUCCESS_MESSAGES.DELETED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'DELETE',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * Blocks API
 * DOD-09: テナントテーブルへのクライアント直アクセス排除
 * 販売停止（Block）管理用のサーバーサイドAPI
 */

import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createSuccessResponse,
  createErrorResponse,
} from '@/lib/api-helpers';
import { STAFF_ROLES, CLINIC_ADMIN_ROLES, isHQRole } from '@/lib/constants/roles';

// ===== GET: Block一覧取得 =====
export async function GET(request: NextRequest) {
  const result = await processApiRequest(request, {
    allowedRoles: Array.from(STAFF_ROLES),
    requireClinicMatch: false,
  });

  if (!result.success) {
    return result.error;
  }

  const { supabase, permissions } = result;
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const resourceId = searchParams.get('resourceId');
  const requestedClinicId = searchParams.get('clinic_id');

  // DOD-09: テナント境界の強制
  // HQロール以外は自分のclinic_idのみ参照可能
  let clinicId: string | null;
  if (isHQRole(permissions.role)) {
    // HQロールはリクエストされたclinic_idまたは全クリニック参照可能
    clinicId = requestedClinicId;
  } else {
    // 非HQロールは自分のclinic_idのみ
    clinicId = permissions.clinic_id;
    // リクエストされたclinic_idが自分のものと異なる場合は拒否
    if (requestedClinicId && requestedClinicId !== permissions.clinic_id) {
      return createErrorResponse('他のクリニックのデータにはアクセスできません', 403);
    }
  }

  if (!clinicId) {
    return createErrorResponse('clinic_idは必須です', 400);
  }

  try {
    // リソースを経由してclinic_idでスコープ
    // 直接blocksテーブルにclinic_idがない場合、resourcesテーブルと結合
    let query = supabase
      .from('blocks')
      .select(`
        *,
        resources!inner(clinic_id)
      `)
      .eq('resources.clinic_id', clinicId);

    if (resourceId) {
      query = query.eq('resourceId', resourceId);
    }

    if (startDate) {
      query = query.gte('startTime', startDate);
    }

    if (endDate) {
      query = query.lte('endTime', endDate);
    }

    query = query.order('startTime', { ascending: true });

    const { data, error } = await query;

    if (error) {
      // resourcesとのリレーションがない場合、直接blocksをclinic_idでフィルタ
      const fallbackQuery = supabase
        .from('blocks')
        .select('*')
        .eq('clinic_id', clinicId);

      if (resourceId) {
        fallbackQuery.eq('resourceId', resourceId);
      }
      if (startDate) {
        fallbackQuery.gte('startTime', startDate);
      }
      if (endDate) {
        fallbackQuery.lte('endTime', endDate);
      }

      const fallbackResult = await fallbackQuery.order('startTime', { ascending: true });

      if (fallbackResult.error) {
        console.error('Blocks fetch error:', fallbackResult.error);
        return createErrorResponse('Blockの取得に失敗しました', 500);
      }

      return createSuccessResponse(fallbackResult.data || []);
    }

    return createSuccessResponse(data || []);
  } catch (error) {
    console.error('Blocks GET error:', error);
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// ===== POST: Block作成 =====
// 管理系ロール（admin, clinic_admin, manager）のみ作成可能
export async function POST(request: NextRequest) {
  const result = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
    requireClinicMatch: false,
  });

  if (!result.success) {
    return result.error;
  }

  const { supabase, auth, permissions, body } = result;
  const clinicId = permissions.clinic_id;

  if (!clinicId) {
    return createErrorResponse('clinic_idは必須です', 400);
  }

  const blockData = body as {
    resourceId: string;
    startTime: string;
    endTime: string;
    recurrenceRule?: string;
    reason?: string;
  };

  if (!blockData.resourceId || !blockData.startTime || !blockData.endTime) {
    return createErrorResponse('必須フィールドが不足しています', 400);
  }

  try {
    // リソースがこのクリニックに属しているか確認
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('id, clinic_id')
      .eq('id', blockData.resourceId)
      .single();

    if (resourceError || !resource) {
      return createErrorResponse('指定されたリソースが見つかりません', 404);
    }

    if (resource.clinic_id !== clinicId) {
      return createErrorResponse('このリソースへのアクセス権限がありません', 403);
    }

    const insertData = {
      resourceId: blockData.resourceId,
      startTime: blockData.startTime,
      endTime: blockData.endTime,
      recurrenceRule: blockData.recurrenceRule || null,
      reason: blockData.reason || null,
      createdBy: auth.id,
      clinic_id: clinicId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('blocks')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Block creation error:', error);
      return createErrorResponse('Block作成に失敗しました', 500);
    }

    return createSuccessResponse(data, 201, 'Block作成に成功しました');
  } catch (error) {
    console.error('Blocks POST error:', error);
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// ===== DELETE: Block削除 =====
// 管理系ロール（admin, clinic_admin, manager）のみ削除可能
export async function DELETE(request: NextRequest) {
  const result = await processApiRequest(request, {
    allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
    requireClinicMatch: false,
  });

  if (!result.success) {
    return result.error;
  }

  const { supabase, permissions } = result;
  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get('id');
  const clinicId = permissions.clinic_id;

  if (!blockId) {
    return createErrorResponse('Block IDは必須です', 400);
  }

  if (!clinicId) {
    return createErrorResponse('clinic_idは必須です', 400);
  }

  try {
    // 削除対象のBlockがこのクリニックに属しているか確認
    const { data: block, error: fetchError } = await supabase
      .from('blocks')
      .select('id, clinic_id')
      .eq('id', blockId)
      .single();

    if (fetchError || !block) {
      return createErrorResponse('指定されたBlockが見つかりません', 404);
    }

    // DOD-09: テナント境界の強制 - clinic_idが異なる場合は拒否
    if (block.clinic_id !== clinicId) {
      return createErrorResponse('このBlockへのアクセス権限がありません', 403);
    }

    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      console.error('Block deletion error:', error);
      return createErrorResponse('Block削除に失敗しました', 500);
    }

    return createSuccessResponse({ deleted: true }, 200, 'Block削除に成功しました');
  } catch (error) {
    console.error('Blocks DELETE error:', error);
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

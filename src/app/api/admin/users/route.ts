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

const AssignPermissionSchema = z.object({
  user_id: z.string().uuid(),
  clinic_id: z.string().uuid().nullable().optional(),
  role: z.enum(ROLE_VALUES),
});

const requireAdmin = (role: string) => role === 'admin';

type PermissionRow = {
  id: string;
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
  created_at: string | null;
  username: string;
  clinics?: { name: string | null } | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') ?? undefined;
  const clinicId = searchParams.get('clinic_id') ?? undefined;
  const search = searchParams.get('search')?.trim() ?? '';

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, permissions, auth } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    let query = supabase
      .from('user_permissions')
      .select('id, staff_id, role, clinic_id, created_at, username, clinics(name)')
      .order('created_at', { ascending: false });

    if (role) {
      if (!ROLE_VALUES.includes(role as (typeof ROLE_VALUES)[number])) {
        return createErrorResponse('不正なロール指定です', 400);
      }
      query = query.eq('role', role);
    }

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    const { data, error } = await query;
    if (error) {
      logError(error, {
        endpoint: '/api/admin/users',
        method: 'GET',
        userId: auth.id,
        params: { role, clinic_id: clinicId, search },
      });
      return createErrorResponse('ユーザー権限の取得に失敗しました', 500);
    }

    const rows = (data ?? []) as PermissionRow[];
    const staffIds = Array.from(
      new Set(rows.map(row => row.staff_id).filter(Boolean))
    ) as string[];

    const profileMap = new Map<
      string,
      { email: string | null; full_name: string | null }
    >();

    if (staffIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', staffIds);

      if (profileError) {
        logError(profileError, {
          endpoint: '/api/admin/users',
          method: 'GET',
          userId: auth.id,
        });
      }

      (profiles ?? []).forEach(profile => {
        profileMap.set(profile.user_id, {
          email: profile.email ?? null,
          full_name: profile.full_name ?? null,
        });
      });
    }

    let items = rows.map(row => ({
      id: row.id,
      user_id: row.staff_id,
      role: row.role,
      clinic_id: row.clinic_id,
      clinic_name: row.clinics?.name ?? null,
      username: row.username,
      profile_email: row.staff_id ? profileMap.get(row.staff_id)?.email : null,
      profile_name: row.staff_id ? profileMap.get(row.staff_id)?.full_name : null,
      created_at: row.created_at,
    }));

    if (search) {
      const lowered = search.toLowerCase();
      items = items.filter(item => {
        return (
          (item.username ?? '').toLowerCase().includes(lowered) ||
          (item.profile_email ?? '').toLowerCase().includes(lowered) ||
          (item.profile_name ?? '').toLowerCase().includes(lowered) ||
          (item.user_id ?? '').toLowerCase().includes(lowered)
        );
      });
    }

    return createSuccessResponse({
      items,
      total: items.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = AssignPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const { user_id, clinic_id, role } = parsed.data;

    if (role !== 'admin' && !clinic_id) {
      return createErrorResponse('clinic_id が必須です', 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', user_id)
      .maybeSingle();

    if (profileError) {
      logError(profileError, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
        params: { user_id },
      });
    }

    if (!profile?.email) {
      return createErrorResponse(
        '対象ユーザーのプロフィールが見つかりません',
        404
      );
    }

    const { data: existingPermission, error: existingError } = await supabase
      .from('user_permissions')
      .select('id, hashed_password, username')
      .eq('staff_id', user_id)
      .maybeSingle();

    if (existingError) {
      logError(existingError, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
      });
      return createErrorResponse('権限情報の取得に失敗しました', 500);
    }

    const username = profile.email;
    const targetClinicId = role === 'admin' ? null : clinic_id ?? null;

    let result;
    if (existingPermission) {
      result = await supabase
        .from('user_permissions')
        .update({
          role,
          clinic_id: targetClinicId,
          username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPermission.id)
        .select('id, staff_id, role, clinic_id, username, created_at')
        .single();
    } else {
      result = await supabase
        .from('user_permissions')
        .insert({
          staff_id: user_id,
          role,
          clinic_id: targetClinicId,
          username,
          hashed_password: 'managed_by_supabase',
        })
        .select('id, staff_id, role, clinic_id, username, created_at')
        .single();
    }

    if (result.error) {
      logError(result.error, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
        params: { user_id, role, clinic_id: targetClinicId },
      });
      return createErrorResponse('権限の付与に失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'permission_assign',
      result.data.id,
      {
        user_id,
        role,
        clinic_id: targetClinicId,
      }
    );

    return createSuccessResponse(result.data, existingPermission ? 200 : 201);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

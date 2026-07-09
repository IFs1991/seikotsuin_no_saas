/**
 * POST /api/onboarding/clinic
 *
 * Step 2: クリニック作成 + profiles/user_permissions更新
 * service role で明示的にテーブル更新する
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getServerClient,
  getCurrentUser,
} from '@/lib/supabase';
import { clinicCreateSchema } from '../schema';

const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';

type AdminClient = ReturnType<typeof createAdminClient>;

type OnboardingEligibility = {
  profile: {
    full_name: string | null;
    clinic_id: string | null;
  } | null;
  staff: {
    id: string;
    clinic_id: string | null;
  } | null;
};

function resolveStaffName(
  email: string,
  fullName: string | null | undefined,
  metadata: Record<string, unknown> | undefined
): string {
  const normalizedFullName = fullName?.trim();
  if (normalizedFullName) {
    return normalizedFullName;
  }

  const metadataName =
    typeof metadata?.full_name === 'string'
      ? metadata.full_name.trim()
      : typeof metadata?.name === 'string'
        ? metadata.name.trim()
        : '';

  if (metadataName) {
    return metadataName;
  }

  return email.split('@')[0] || '管理者';
}

async function verifyInitialOnboardingEligibility(
  adminClient: AdminClient,
  userId: string
): Promise<OnboardingEligibility | 'existing-tenant-state'> {
  const { data: permission, error: permissionError } = await adminClient
    .from('user_permissions')
    .select('staff_id')
    .eq('staff_id', userId)
    .maybeSingle();

  if (permissionError) {
    throw permissionError;
  }
  if (permission) {
    return 'existing-tenant-state';
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('full_name, clinic_id')
    .eq('user_id', userId)
    .maybeSingle<{
      full_name: string | null;
      clinic_id: string | null;
    }>();

  if (profileError) {
    throw profileError;
  }
  if (profile?.clinic_id) {
    return 'existing-tenant-state';
  }

  const { data: staff, error: staffError } = await adminClient
    .from('staff')
    .select('id, clinic_id')
    .eq('id', userId)
    .maybeSingle<{
      id: string;
      clinic_id: string | null;
    }>();

  if (staffError) {
    throw staffError;
  }
  if (staff?.clinic_id) {
    return 'existing-tenant-state';
  }

  const { data: onboardingState, error: onboardingStateError } =
    await adminClient
      .from('onboarding_states')
      .select('clinic_id, current_step, completed_at')
      .eq('user_id', userId)
      .maybeSingle<{
        clinic_id: string | null;
        current_step: string;
        completed_at: string | null;
      }>();

  if (onboardingStateError) {
    throw onboardingStateError;
  }
  if (
    onboardingState?.clinic_id ||
    onboardingState?.current_step === 'completed' ||
    onboardingState?.completed_at
  ) {
    return 'existing-tenant-state';
  }

  return {
    profile: profile ?? null,
    staff: staff ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const user = await getCurrentUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // リクエストボディを取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: '無効なJSONデータです' },
        { status: 400 }
      );
    }

    // バリデーション
    const parsed = clinicCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: '入力値にエラーがあります',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { name, address, phone_number, opening_date, parent_id } =
      parsed.data;

    if (parent_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'オンボーディングでは親クリニックを指定できません',
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const staffEmail = user.email?.trim() || `${user.id}@placeholder.local`;

    const eligibility = await verifyInitialOnboardingEligibility(
      adminClient,
      user.id
    );
    if (eligibility === 'existing-tenant-state') {
      return NextResponse.json(
        {
          success: false,
          error:
            '既存のテナント状態があるためオンボーディングでは作成できません',
        },
        { status: 403 }
      );
    }

    const staffName = resolveStaffName(
      staffEmail,
      eligibility.profile?.full_name,
      user.user_metadata
    );

    if (!eligibility.staff) {
      const { error: staffInsertError } = await adminClient
        .from('staff')
        .insert({
          id: user.id,
          clinic_id: null,
          name: staffName,
          role: 'admin',
          email: staffEmail,
          password_hash: MANAGED_PASSWORD_PLACEHOLDER,
          is_therapist: false,
        });

      if (staffInsertError) {
        console.error('Onboarding staff seed error:', staffInsertError);
        return NextResponse.json(
          { success: false, error: 'クリニック作成の準備に失敗しました' },
          { status: 500 }
        );
      }
    }

    const now = new Date().toISOString();
    const { data: clinic, error: clinicInsertError } = await adminClient
      .from('clinics')
      .insert({
        name,
        address: address ?? null,
        phone_number: phone_number ?? null,
        opening_date: opening_date ?? null,
        parent_id: null,
        is_active: true,
      })
      .select('id')
      .single();

    if (clinicInsertError) {
      console.error('Clinic insert error:', clinicInsertError);
      return NextResponse.json(
        { success: false, error: 'クリニックの作成に失敗しました' },
        { status: 500 }
      );
    }

    const clinicId = clinic.id;

    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({
        clinic_id: clinicId,
        role: 'admin',
        updated_at: now,
      })
      .eq('user_id', user.id);

    if (profileUpdateError) {
      console.error('Onboarding profile assignment error:', profileUpdateError);
      return NextResponse.json(
        { success: false, error: 'クリニックの作成に失敗しました' },
        { status: 500 }
      );
    }

    const { error: permissionUpsertError } = await adminClient
      .from('user_permissions')
      .upsert(
        {
          staff_id: user.id,
          clinic_id: clinicId,
          role: 'admin',
          username: staffEmail,
          hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
        },
        { onConflict: 'staff_id' }
      );

    if (permissionUpsertError) {
      console.error(
        'Onboarding user permission upsert error:',
        permissionUpsertError
      );
      return NextResponse.json(
        { success: false, error: 'クリニックの作成に失敗しました' },
        { status: 500 }
      );
    }

    const { error: onboardingStateUpsertError } = await adminClient
      .from('onboarding_states')
      .upsert(
        {
          user_id: user.id,
          clinic_id: clinicId,
          current_step: 'invites',
          updated_at: now,
        },
        { onConflict: 'user_id' }
      );

    if (onboardingStateUpsertError) {
      console.error(
        'Onboarding state upsert error:',
        onboardingStateUpsertError
      );
      return NextResponse.json(
        { success: false, error: 'クリニックの作成に失敗しました' },
        { status: 500 }
      );
    }

    const { error: staffSyncError } = await adminClient
      .from('staff')
      .update({
        clinic_id: clinicId,
        name: staffName,
        role: 'admin',
        email: staffEmail,
        updated_at: now,
      })
      .eq('id', user.id);

    if (staffSyncError) {
      console.error('Onboarding staff sync error:', staffSyncError);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          clinic_id: clinicId,
          next_step: 'invites',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Clinic creation error:', error);
    return NextResponse.json(
      { success: false, error: 'クリニックの作成に失敗しました' },
      { status: 500 }
    );
  }
}

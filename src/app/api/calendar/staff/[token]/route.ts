import { NextRequest, NextResponse } from 'next/server';
import {
  buildCalendarIcs,
  hashCalendarFeedToken,
  type CalendarFeedTokenRow,
  type CalendarIcsShiftRow,
} from '@/lib/calendar-feed';
import { createAdminClient } from '@/lib/supabase';

const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 180;

type AdminClient = ReturnType<typeof createAdminClient>;

type ClinicStatusRow = {
  id: string;
  is_active: boolean | null;
};

type StaffProfileStatusRow = {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
};

type LinkedProfileStatusRow = {
  user_id: string;
  is_active: boolean | null;
};

type StaffMembershipStatusRow = {
  staff_profile_id: string;
  clinic_id: string;
  membership_type: string;
};

function rangeStart(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - LOOKBACK_DAYS);
  return date.toISOString();
}

function rangeEnd(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + LOOKAHEAD_DAYS);
  return date.toISOString();
}

function icsResponse(ics: string): NextResponse {
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function loadFeedToken(
  adminClient: AdminClient,
  token: string
): Promise<CalendarFeedTokenRow | null> {
  const { data, error } = await adminClient
    .from('calendar_feed_tokens')
    .select(
      'id, clinic_id, staff_profile_id, feed_type, token_hash, label, is_active, created_by, created_at, revoked_at'
    )
    .eq('token_hash', hashCalendarFeedToken(token))
    .eq('feed_type', 'staff')
    .maybeSingle<CalendarFeedTokenRow>();

  if (error) {
    throw error;
  }
  if (
    !data ||
    !data.is_active ||
    data.revoked_at ||
    !data.staff_profile_id ||
    !data.clinic_id
  ) {
    return null;
  }
  return data;
}

async function isFeedTargetActive(
  adminClient: AdminClient,
  staffProfileId: string,
  clinicId: string
): Promise<boolean> {
  const [staffProfileResult, membershipResult, clinicResult] =
    await Promise.all([
      adminClient
        .from('staff_profiles')
        .select('id, user_id, is_active')
        .eq('id', staffProfileId)
        .maybeSingle<StaffProfileStatusRow>(),
      adminClient
        .from('staff_clinic_memberships')
        .select('staff_profile_id, clinic_id, membership_type')
        .eq('staff_profile_id', staffProfileId)
        .eq('clinic_id', clinicId)
        .neq('membership_type', 'blocked')
        .maybeSingle<StaffMembershipStatusRow>(),
      adminClient
        .from('clinics')
        .select('id, is_active')
        .eq('id', clinicId)
        .maybeSingle<ClinicStatusRow>(),
    ]);

  if (
    staffProfileResult.error ||
    membershipResult.error ||
    clinicResult.error
  ) {
    throw (
      staffProfileResult.error ?? membershipResult.error ?? clinicResult.error
    );
  }

  const staffProfile = staffProfileResult.data;
  if (
    staffProfile?.is_active !== true ||
    !membershipResult.data ||
    clinicResult.data?.is_active !== true
  ) {
    return false;
  }

  if (!staffProfile.user_id) {
    return true;
  }

  const { data: linkedProfile, error: linkedProfileError } = await adminClient
    .from('profiles')
    .select('user_id, is_active')
    .eq('user_id', staffProfile.user_id)
    .maybeSingle<LinkedProfileStatusRow>();

  if (linkedProfileError) {
    throw linkedProfileError;
  }

  return linkedProfile?.is_active === true;
}

async function loadStaffShifts(
  adminClient: AdminClient,
  staffProfileId: string,
  clinicId: string
): Promise<CalendarIcsShiftRow[]> {
  const { data, error } = await adminClient
    .from('staff_shifts')
    .select(
      `
      id,
      clinic_id,
      staff_id,
      staff_profile_id,
      home_clinic_id,
      assignment_type,
      time_preset,
      start_time,
      end_time,
      status,
      resources!staff_shifts_staff_id_fkey(id, name, clinic_id),
      clinics!staff_shifts_clinic_id_fkey(id, name)
    `
    )
    .eq('staff_profile_id', staffProfileId)
    .eq('clinic_id', clinicId)
    .eq('status', 'confirmed')
    .gte('start_time', rangeStart())
    .lte('start_time', rangeEnd())
    .order('start_time', { ascending: true })
    .returns<CalendarIcsShiftRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const adminClient = createAdminClient();
  const feedToken = await loadFeedToken(adminClient, token);

  if (!feedToken) {
    return new NextResponse('Not found', { status: 404 });
  }

  const targetIsActive = await isFeedTargetActive(
    adminClient,
    feedToken.staff_profile_id,
    feedToken.clinic_id
  );
  if (!targetIsActive) {
    return new NextResponse('Not found', { status: 404 });
  }

  const shifts = await loadStaffShifts(
    adminClient,
    feedToken.staff_profile_id,
    feedToken.clinic_id
  );
  return icsResponse(
    buildCalendarIcs({
      feedName: feedToken.label ?? 'Tiramisu staff shifts',
      feedType: 'staff',
      shifts,
    })
  );
}

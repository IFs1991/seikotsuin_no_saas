import { NextRequest, NextResponse } from 'next/server';

import { AppError, ERROR_CODES } from '@/lib/error-handler';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  buildProfileResponse,
  fetchClinicNameWithClient,
  type ProfileResponse,
} from '@/lib/auth/profile-read-model';
import {
  fetchDailyReportsReadModel,
  type DailyReportsReadModel,
} from '@/lib/daily-reports/read-model';
import { logPerf, nowMs } from '@/lib/performance/server-timing';

const PATH = '/api/dashboard/bootstrap';

type DashboardBootstrapResponse = {
  success: true;
  data: {
    profile: ProfileResponse;
    dailyReports: DailyReportsReadModel;
  };
};

async function resolveFallbackClinicId(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, undefined, 401);
  }

  const accessContext = await getUserAccessContext(user.id, supabase, {
    user,
  });

  return accessContext.clinicId;
}

export async function GET(request: NextRequest) {
  try {
    const tTotal = nowMs();
    const searchParams = request.nextUrl.searchParams;
    const requestedClinicId = searchParams.get('clinic_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const clinicId = requestedClinicId ?? (await resolveFallbackClinicId());

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id could not be resolved' },
        { status: 403 }
      );
    }

    const tAccess = nowMs();
    const { supabase, user } = await ensureClinicAccess(
      request,
      PATH,
      clinicId
    );
    logPerf('dashboardBootstrap.ensureClinicAccess', tAccess, { clinicId });

    const tProfile = nowMs();
    const accessContext = await getUserAccessContext(user.id, supabase, {
      user,
    });
    const clinicName = await fetchClinicNameWithClient(supabase, clinicId);
    const profile = buildProfileResponse({
      user,
      accessContext,
      clinicName,
    });
    logPerf('dashboardBootstrap.profile', tProfile, { clinicId });

    const tDailyReports = nowMs();
    const dailyReports = await fetchDailyReportsReadModel({
      supabase,
      clinicId,
      startDate,
      endDate,
    });
    logPerf('dashboardBootstrap.dailyReports', tDailyReports, {
      clinicId,
      count: dailyReports.reports.length,
    });

    const response: DashboardBootstrapResponse = {
      success: true,
      data: {
        profile,
        dailyReports,
      },
    };

    logPerf('dashboardBootstrap.total', tTotal, { clinicId });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Dashboard bootstrap API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

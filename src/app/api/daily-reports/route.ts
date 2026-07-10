import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import {
  fetchDailyReportByIdReadModel,
  fetchDailyReportsReadModel,
} from '@/lib/daily-reports/read-model';
import {
  DAILY_REPORT_MUTATION_ROLES,
  dailyReportPayloadSchema,
} from '@/lib/daily-reports/schema';
import {
  upsertDailyReport,
  validateDailyReportWriteScope,
} from '@/lib/daily-reports/write-model';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

const PATH = '/api/daily-reports';
const DAILY_REPORT_DELETE_ROLES = ['admin', 'clinic_admin'] as const;

export async function GET(request: NextRequest) {
  try {
    const tTotal = nowMs();
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const reportId = searchParams.get('id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const tAccess = nowMs();
    const { supabase } = await ensureClinicAccess(request, PATH, clinicId);
    logPerf('dailyReports.ensureClinicAccess', tAccess, { clinicId });

    // 個別日報取得
    if (reportId) {
      const report = await fetchDailyReportByIdReadModel({
        supabase,
        clinicId,
        reportId,
      });

      if (!report) {
        return NextResponse.json(
          { error: 'Report not found' },
          { status: 404 }
        );
      }

      const response = {
        success: true,
        data: report,
      };
      logPerf('dailyReports.total', tTotal, { clinicId, reportId });

      return NextResponse.json(response);
    }

    const readModel = await fetchDailyReportsReadModel({
      supabase,
      clinicId,
      startDate,
      endDate,
    });

    const response = {
      success: true,
      data: readModel,
    };
    logPerf('dailyReports.total', tTotal, { clinicId });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = dailyReportPayloadSchema.safeParse(body);

    if (!validationResult.success) {
      const { fieldErrors, formErrors } = validationResult.error.flatten();
      return NextResponse.json(
        {
          success: false,
          error: {
            message: '日報データのバリデーションに失敗しました',
            fieldErrors,
            formErrors,
          },
        },
        { status: 400 }
      );
    }

    const payload = validationResult.data;

    const { supabase, permissions } = await ensureClinicAccess(
      request,
      PATH,
      payload.clinic_id,
      {
        allowedRoles: Array.from(DAILY_REPORT_MUTATION_ROLES),
      }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: payload.clinic_id,
    });

    const scope = await validateDailyReportWriteScope(supabase, payload);
    if (scope.ok === false) {
      return NextResponse.json(
        { success: false, error: scope.message },
        { status: scope.status }
      );
    }
    const data = await upsertDailyReport(supabase, payload);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      );
    }

    // DOD-09: テナント境界の強制 - permissions.clinic_id を取得
    const { supabase, permissions } = await ensureClinicAccess(
      request,
      PATH,
      null,
      {
        allowedRoles: Array.from(DAILY_REPORT_DELETE_ROLES),
        requireClinicMatch: false,
      }
    );

    const clinicId = permissions.clinic_id;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: clinicId,
    });

    // DOD-09: 削除対象の日報がこのクリニックに属しているか確認
    const { data: report, error: fetchError } = await supabase
      .from('daily_reports')
      .select('id, clinic_id')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // テナント境界チェック
    if (report.clinic_id !== clinicId) {
      return NextResponse.json(
        { error: 'Access denied: This report belongs to another clinic' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('daily_reports')
      .delete()
      .eq('id', reportId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

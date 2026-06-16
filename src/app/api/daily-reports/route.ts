import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import {
  fetchDailyReportByIdReadModel,
  fetchDailyReportsReadModel,
} from '@/lib/daily-reports/read-model';

const PATH = '/api/daily-reports';
const DAILY_REPORT_MUTATION_ROLES = [
  'admin',
  'clinic_admin',
  'therapist',
  'staff',
] as const;
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
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Daily Reports API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = DailyReportPayloadSchema.safeParse(body);

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

    const { supabase } = await ensureClinicAccess(
      request,
      PATH,
      payload.clinic_id,
      {
        allowedRoles: Array.from(DAILY_REPORT_MUTATION_ROLES),
      }
    );

    const { data, error } = await supabase
      .from('daily_reports')
      .upsert(
        {
          clinic_id: payload.clinic_id,
          staff_id: payload.staff_id ?? null,
          report_date: payload.report_date,
          total_patients: payload.total_patients,
          new_patients: payload.new_patients,
          total_revenue: payload.total_revenue,
          insurance_revenue: payload.insurance_revenue,
          private_revenue: payload.private_revenue,
          report_text: payload.report_text ?? null,
        },
        {
          onConflict: 'clinic_id,report_date',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Daily Reports POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const DailyReportPayloadSchema = z
  .object({
    clinic_id: z.string({ required_error: 'clinic_idは必須です' }).uuid({
      message: 'clinic_idはUUID形式で指定してください',
    }),
    staff_id: z
      .string()
      .uuid({ message: 'staff_idはUUID形式で指定してください' })
      .optional()
      .nullable(),
    report_date: z
      .string({ required_error: 'report_dateは必須です' })
      .regex(
        /\d{4}-\d{2}-\d{2}/,
        'report_dateはYYYY-MM-DD形式で入力してください'
      ),
    total_patients: z.coerce
      .number({ invalid_type_error: 'total_patientsは数値で入力してください' })
      .int('total_patientsは整数で入力してください')
      .min(0, 'total_patientsは0以上で入力してください'),
    new_patients: z.coerce
      .number({ invalid_type_error: 'new_patientsは数値で入力してください' })
      .int('new_patientsは整数で入力してください')
      .min(0, 'new_patientsは0以上で入力してください'),
    total_revenue: z.coerce
      .number({ invalid_type_error: 'total_revenueは数値で入力してください' })
      .min(0, 'total_revenueは0以上で入力してください'),
    insurance_revenue: z.coerce
      .number({
        invalid_type_error: 'insurance_revenueは数値で入力してください',
      })
      .min(0, 'insurance_revenueは0以上で入力してください'),
    private_revenue: z.coerce
      .number({ invalid_type_error: 'private_revenueは数値で入力してください' })
      .min(0, 'private_revenueは0以上で入力してください'),
    report_text: z
      .string()
      .max(2000, 'report_textは2000文字以内で入力してください')
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.new_patients > data.total_patients) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'new_patientsはtotal_patients以下で入力してください',
        path: ['new_patients'],
      });
    }

    if (data.insurance_revenue + data.private_revenue > data.total_revenue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'total_revenueは保険診療と自費診療の合計以上である必要があります',
        path: ['total_revenue'],
      });
    }
  });

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
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Daily Reports DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

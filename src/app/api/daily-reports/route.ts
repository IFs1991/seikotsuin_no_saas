import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const PATH = '/api/daily-reports';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinicId);

    let query = supabase
      .from('daily_reports')
      .select(
        `
        *,
        staff(name, role)
      `
      )
      .eq('clinic_id', clinicId);

    if (startDate) {
      query = query.gte('report_date', startDate);
    }
    if (endDate) {
      query = query.lte('report_date', endDate);
    }

    const { data: reports, error: reportsError } = await query
      .order('report_date', { ascending: false })
      .limit(30);

    if (reportsError) {
      throw reportsError;
    }

    // レポートサマリー計算
    const summary = {
      totalReports: reports?.length || 0,
      averagePatients:
        reports?.length > 0
          ? reports.reduce((sum, r) => sum + (r.total_patients || 0), 0) /
            reports.length
          : 0,
      averageRevenue:
        reports?.length > 0
          ? reports.reduce(
              (sum, r) => sum + parseFloat(r.total_revenue || '0'),
              0
            ) / reports.length
          : 0,
      totalRevenue:
        reports?.reduce(
          (sum, r) => sum + parseFloat(r.total_revenue || '0'),
          0
        ) || 0,
    };

    // 月別トレンド
    const monthlyTrends =
      reports?.reduce(
        (acc, report) => {
          const month = report.report_date.slice(0, 7); // YYYY-MM
          if (!acc[month]) {
            acc[month] = {
              month,
              reports: 0,
              totalPatients: 0,
              totalRevenue: 0,
            };
          }
          acc[month].reports += 1;
          acc[month].totalPatients += report.total_patients || 0;
          acc[month].totalRevenue += parseFloat(report.total_revenue || '0');
          return acc;
        },
        {} as Record<string, any>
      ) || {};

    return NextResponse.json({
      success: true,
      data: {
        reports:
          reports?.map(report => ({
            id: report.id,
            reportDate: report.report_date,
            staffName: report.staff?.name || '未設定',
            totalPatients: report.total_patients,
            newPatients: report.new_patients,
            totalRevenue: parseFloat(report.total_revenue || '0'),
            insuranceRevenue: parseFloat(report.insurance_revenue || '0'),
            privateRevenue: parseFloat(report.private_revenue || '0'),
            reportText: report.report_text,
            createdAt: report.created_at,
          })) || [],
        summary,
        monthlyTrends: Object.values(monthlyTrends),
      },
    });
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
    const {
      clinic_id,
      staff_id,
      report_date,
      total_patients,
      new_patients,
      total_revenue,
      insurance_revenue,
      private_revenue,
      report_text,
    } = body;

    if (!clinic_id || !report_date) {
      return NextResponse.json(
        { error: 'Required fields missing' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      allowedRoles: ['manager'],
    });

    const { data, error } = await supabase
      .from('daily_reports')
      .upsert(
        {
          clinic_id,
          staff_id,
          report_date,
          total_patients: total_patients || 0,
          new_patients: new_patients || 0,
          total_revenue: total_revenue || 0,
          insurance_revenue: insurance_revenue || 0,
          private_revenue: private_revenue || 0,
          report_text,
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

    const { supabase } = await ensureClinicAccess(request, PATH, null, {
      allowedRoles: ['manager'],
      requireClinicMatch: false,
    });

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

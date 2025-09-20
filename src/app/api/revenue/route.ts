import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const period = searchParams.get('period') || 'month';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    // 期間設定
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        gte: startDate,
        lte: endDate,
      };
    } else {
      const now = new Date();
      let start: Date;
      if (period === 'week') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      } else if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        start = new Date(now.getFullYear(), 0, 1);
      }
      dateFilter = { gte: start.toISOString().split('T')[0] };
    }

    // 収益データ取得
    const { data: revenueData, error: revenueError } = await supabase
      .from('revenues')
      .select(
        `
        *,
        master_treatment_menus(name),
        master_categories(name),
        patients(name)
      `
      )
      .eq('clinic_id', clinicId)
      .gte('revenue_date', dateFilter.gte)
      .order('revenue_date', { ascending: false });

    if (revenueError) {
      throw revenueError;
    }

    // メニュー別収益ランキング
    const menuRevenue = revenueData?.reduce(
      (acc, item) => {
        const menuName = item.master_treatment_menus?.name || 'その他';
        if (!acc[menuName]) {
          acc[menuName] = {
            menu_id: item.treatment_menu_id,
            menu_name: menuName,
            total_revenue: 0,
            transaction_count: 0,
          };
        }
        acc[menuName].total_revenue += parseFloat(item.amount);
        acc[menuName].transaction_count += 1;
        return acc;
      },
      {} as Record<string, any>
    );

    const menuRanking = Object.values(menuRevenue || {})
      .sort((a: any, b: any) => b.total_revenue - a.total_revenue)
      .slice(0, 10);

    // 日次トレンド
    const dailyTrends = revenueData?.reduce(
      (acc, item) => {
        const date = item.revenue_date;
        if (!acc[date]) {
          acc[date] = {
            date,
            total_revenue: 0,
            insurance_revenue: 0,
            private_revenue: 0,
            transaction_count: 0,
          };
        }
        acc[date].total_revenue += parseFloat(item.amount);
        acc[date].insurance_revenue += parseFloat(item.insurance_revenue || 0);
        acc[date].private_revenue += parseFloat(item.private_revenue || 0);
        acc[date].transaction_count += 1;
        return acc;
      },
      {} as Record<string, any>
    );

    const revenueTrends = Object.values(dailyTrends || {}).sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 時間帯別収益（SQLクエリで取得）
    const { data: hourlyRevenue, error: hourlyError } = await supabase.rpc(
      'get_hourly_revenue_pattern',
      { clinic_uuid: clinicId }
    );

    // 前年同期比較
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const { data: lastYearData, error: lastYearError } = await supabase
      .from('revenues')
      .select('amount')
      .eq('clinic_id', clinicId)
      .gte('revenue_date', lastYear.toISOString().split('T')[0])
      .lte(
        'revenue_date',
        new Date(lastYear.getFullYear(), lastYear.getMonth() + 1, 0)
          .toISOString()
          .split('T')[0]
      );

    const currentTotal =
      revenueData?.reduce((sum, item) => sum + parseFloat(item.amount), 0) || 0;
    const lastYearTotal =
      lastYearData?.reduce((sum, item) => sum + parseFloat(item.amount), 0) ||
      0;
    const growthRate =
      lastYearTotal > 0
        ? (((currentTotal - lastYearTotal) / lastYearTotal) * 100).toFixed(1)
        : '0';

    return NextResponse.json({
      success: true,
      data: {
        dailyRevenue: currentTotal,
        weeklyRevenue:
          revenueTrends
            ?.slice(-7)
            .reduce((sum: number, item: any) => sum + item.total_revenue, 0) ||
          0,
        monthlyRevenue:
          revenueTrends?.reduce(
            (sum: number, item: any) => sum + item.total_revenue,
            0
          ) || 0,
        insuranceRevenue:
          revenueData?.reduce(
            (sum, item) => sum + parseFloat(item.insurance_revenue || 0),
            0
          ) || 0,
        selfPayRevenue:
          revenueData?.reduce(
            (sum, item) => sum + parseFloat(item.private_revenue || 0),
            0
          ) || 0,
        menuRanking,
        hourlyRevenue: hourlyRevenue || [],
        revenueForecast: currentTotal * 1.1, // 簡易予測（10%増）
        growthRate: `${growthRate}%`,
        revenueTrends,
        costAnalysis: '32.5%', // 固定値（実際は計算）
        staffRevenueContribution: [], // スタッフ別データは別途実装
      },
    });
  } catch (error) {
    console.error('Revenue API error:', error);
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
      patient_id,
      visit_id,
      amount,
      insurance_revenue,
      private_revenue,
      treatment_menu_id,
      payment_method_id,
    } = body;

    if (!clinic_id || !amount) {
      return NextResponse.json(
        { error: 'Required fields missing' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('revenues')
      .insert({
        clinic_id,
        patient_id,
        visit_id,
        revenue_date: new Date().toISOString().split('T')[0],
        amount,
        insurance_revenue: insurance_revenue || 0,
        private_revenue: private_revenue || 0,
        treatment_menu_id,
        payment_method_id,
      })
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
    console.error('Revenue POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

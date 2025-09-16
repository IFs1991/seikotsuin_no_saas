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

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    // スタッフパフォーマンスデータ取得
    const { data: staffPerformance, error: staffError } = await supabase
      .from('staff_performance_summary')
      .select('*')
      .eq('clinic_id', clinicId);

    if (staffError) {
      throw staffError;
    }

    // 今月のパフォーマンスデータ
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: monthlyPerformance, error: monthlyError } = await supabase
      .from('staff_performance')
      .select(`
        *,
        staff(name, role)
      `)
      .eq('clinic_id', clinicId)
      .gte('performance_date', `${currentMonth}-01`)
      .order('performance_date', { ascending: false });

    if (monthlyError) {
      throw monthlyError;
    }

    // スタッフメトリクス計算
    const staffMetrics = {
      dailyPatients: staffPerformance?.reduce((sum, staff) => {
        const avgDaily = staff.total_visits / Math.max(staff.working_days, 1);
        return sum + avgDaily;
      }, 0) / Math.max(staffPerformance?.length || 1, 1),
      
      totalRevenue: staffPerformance?.reduce((sum, staff) => sum + (staff.total_revenue_generated || 0), 0) || 0,
      
      averageSatisfaction: staffPerformance?.reduce((sum, staff) => {
        return sum + (staff.average_satisfaction_score || 0);
      }, 0) / Math.max(staffPerformance?.length || 1, 1)
    };

    // 収益ランキング
    const revenueRanking = staffPerformance
      ?.sort((a, b) => (b.total_revenue_generated || 0) - (a.total_revenue_generated || 0))
      .slice(0, 10)
      .map(staff => ({
        staff_id: staff.staff_id,
        name: staff.staff_name,
        revenue: staff.total_revenue_generated || 0,
        patients: staff.unique_patients || 0,
        satisfaction: staff.average_satisfaction_score || 0
      })) || [];

    // 満足度相関データ
    const satisfactionCorrelation = staffPerformance?.map(staff => ({
      name: staff.staff_name,
      satisfaction: staff.average_satisfaction_score || 0,
      revenue: staff.total_revenue_generated || 0,
      patients: staff.unique_patients || 0
    })) || [];

    // パフォーマンストレンド（過去3ヶ月）
    const performanceTrends = monthlyPerformance?.reduce((acc, record) => {
      const staffName = record.staff?.name || 'Unknown';
      if (!acc[staffName]) {
        acc[staffName] = [];
      }
      acc[staffName].push({
        date: record.performance_date,
        revenue: record.revenue_generated || 0,
        patients: record.patient_count || 0,
        satisfaction: record.satisfaction_score || 0
      });
      return acc;
    }, {} as Record<string, any[]>) || {};

    // スキルマトリックス（ダミーデータ）
    const skillMatrix = staffPerformance?.map(staff => ({
      id: staff.staff_id,
      name: staff.staff_name,
      skills: [
        { name: '基本施術', level: Math.floor(Math.random() * 5) + 1 },
        { name: 'カウンセリング', level: Math.floor(Math.random() * 5) + 1 },
        { name: '専門技術', level: Math.floor(Math.random() * 5) + 1 },
        { name: '接客', level: Math.floor(Math.random() * 5) + 1 }
      ]
    })) || [];

    // 研修履歴（ダミーデータ）
    const trainingHistory = [
      {
        id: 1,
        staff_id: staffPerformance?.[0]?.staff_id,
        title: '基礎施術研修',
        date: '2024-01-15',
        completed: true
      },
      {
        id: 2,
        staff_id: staffPerformance?.[0]?.staff_id,
        title: 'コミュニケーション研修',
        date: '2024-02-20',
        completed: true
      }
    ];

    return NextResponse.json({
      success: true,
      data: {
        staffMetrics,
        revenueRanking,
        satisfactionCorrelation,
        performanceTrends,
        skillMatrix,
        trainingHistory,
        totalStaff: staffPerformance?.length || 0,
        activeStaff: staffPerformance?.filter(s => s.working_days > 0).length || 0
      }
    });
  } catch (error) {
    console.error('Staff API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinic_id, name, role, email, hire_date, is_therapist } = body;

    if (!clinic_id || !name || !email || !role) {
      return NextResponse.json(
        { error: 'Required fields missing' },
        { status: 400 }
      );
    }

    // パスワードハッシュ化（実際の実装では適切なハッシュ化を使用）
    const password_hash = 'temporary_hash'; // 実際は bcrypt などを使用

    const { data, error } = await supabase
      .from('staff')
      .insert({
        clinic_id,
        name,
        role,
        email,
        password_hash,
        hire_date,
        is_therapist: is_therapist || false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Staff POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
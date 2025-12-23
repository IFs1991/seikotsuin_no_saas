import { NextRequest, NextResponse } from 'next/server';
import { AppError, ERROR_CODES } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import type { SupabaseServerClient } from '@/lib/supabase';

const PATH = '/api/ai-comments';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const date =
      searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinicId);

    const { data, error } = await supabase
      .from('daily_ai_comments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('comment_date', date)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      const generatedComment = await generateDailyComment(
        supabase,
        clinicId,
        date
      );
      return NextResponse.json({
        success: true,
        data: generatedComment,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        summary: data.summary,
        highlights: data.good_points ? [data.good_points] : [],
        improvements: data.improvement_points ? [data.improvement_points] : [],
        suggestions: data.suggestion_for_tomorrow
          ? [data.suggestion_for_tomorrow]
          : [],
        created_at: data.created_at,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('AI Comments GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinic_id, date } = body;

    if (!clinic_id) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      allowedRoles: ['manager'],
    });

    const commentDate = date || new Date().toISOString().split('T')[0];
    const generatedComment = await generateDailyComment(
      supabase,
      clinic_id,
      commentDate
    );

    return NextResponse.json({
      success: true,
      data: generatedComment,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('AI Comments POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateDailyComment(
  supabase: SupabaseServerClient,
  clinicId: string,
  date: string
) {
  try {
    const { data: dailyData, error: dailyError } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('revenue_date', date)
      .single();

    if (dailyError && dailyError.code !== 'PGRST116') {
      throw dailyError;
    }

    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: previousData, error: previousError } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('revenue_date', yesterday.toISOString().split('T')[0])
      .single();

    if (previousError && previousError.code !== 'PGRST116') {
      throw previousError;
    }

    const weekAgo = new Date(date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('revenue_date', weekAgo.toISOString().split('T')[0])
      .lt('revenue_date', date);

    if (weeklyError) {
      throw weeklyError;
    }

    const analysis = analyzePerformance(
      dailyData,
      previousData,
      weeklyData || []
    );

    const { data: savedComment, error } = await supabase
      .from('daily_ai_comments')
      .upsert(
        {
          clinic_id: clinicId,
          comment_date: date,
          summary: analysis.summary,
          good_points: analysis.highlights.join('\n'),
          improvement_points: analysis.improvements.join('\n'),
          suggestion_for_tomorrow: analysis.suggestions.join('\n'),
          raw_ai_response: analysis,
        },
        {
          onConflict: 'clinic_id,comment_date',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      id: savedComment.id,
      summary: analysis.summary,
      highlights: analysis.highlights,
      improvements: analysis.improvements,
      suggestions: analysis.suggestions,
      created_at: savedComment.created_at,
    };
  } catch (error) {
    console.error('Generate daily comment error:', error);
    throw new AppError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to generate AI comment',
      500,
      { clinicId, date }
    );
  }
}

function analyzePerformance(
  dailyData: any,
  previousData: any,
  weeklyData: any[]
) {
  const todayRevenue = dailyData?.total_revenue || 0;
  const todayPatients = dailyData?.unique_patients || 0;
  const yesterdayRevenue = previousData?.total_revenue || 0;
  const yesterdayPatients = previousData?.unique_patients || 0;

  const weeklyAvgRevenue =
    weeklyData.length > 0
      ? weeklyData.reduce((sum, day) => sum + (day.total_revenue || 0), 0) /
        weeklyData.length
      : 0;
  const weeklyAvgPatients =
    weeklyData.length > 0
      ? weeklyData.reduce((sum, day) => sum + (day.unique_patients || 0), 0) /
        weeklyData.length
      : 0;

  let summary = '';
  const highlights: string[] = [];
  const improvements: string[] = [];
  const suggestions: string[] = [];

  if (todayRevenue > yesterdayRevenue) {
    const increase = (
      ((todayRevenue - yesterdayRevenue) / Math.max(yesterdayRevenue, 1)) *
      100
    ).toFixed(1);
    highlights.push(`前日比売上が${increase}%向上しました`);
  } else if (todayRevenue < yesterdayRevenue) {
    const decrease = (
      ((yesterdayRevenue - todayRevenue) / Math.max(yesterdayRevenue, 1)) *
      100
    ).toFixed(1);
    improvements.push(`前日比売上が${decrease}%低下している可能性があります`);
  }

  if (todayPatients > yesterdayPatients) {
    highlights.push('患者数が前日より増加しています');
  }

  if (todayPatients < yesterdayPatients) {
    improvements.push('患者数が前日より減少しています');
  }

  if (weeklyAvgRevenue > 0) {
    const diff = todayRevenue - weeklyAvgRevenue;
    if (diff > 0) {
      highlights.push('週間平均を上回る売上を記録しました');
    } else if (diff < 0) {
      improvements.push(
        '週間平均を下回っています。施策の見直しを検討してください'
      );
    }
  }

  if (!summary) {
    summary =
      '本日の売上と患者数を分析しました。詳細はハイライトと改善提案をご確認ください。';
  }

  if (suggestions.length === 0) {
    suggestions.push(
      'スタッフとの共有ミーティングで好調・不調要因を確認してください'
    );
  }

  return {
    summary,
    highlights,
    improvements,
    suggestions,
  };
}

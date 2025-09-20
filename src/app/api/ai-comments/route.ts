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
    const date =
      searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('daily_ai_comments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('comment_date', date)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // コメントが存在しない場合は生成
    if (!data) {
      const generatedComment = await generateDailyComment(clinicId, date);
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

    const commentDate = date || new Date().toISOString().split('T')[0];
    const generatedComment = await generateDailyComment(clinic_id, commentDate);

    return NextResponse.json({
      success: true,
      data: generatedComment,
    });
  } catch (error) {
    console.error('AI Comments POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateDailyComment(clinicId: string, date: string) {
  try {
    // 当日のデータを取得
    const { data: dailyData } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('revenue_date', date)
      .single();

    // 前日のデータを取得
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: previousData } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('revenue_date', yesterday.toISOString().split('T')[0])
      .single();

    // 過去7日間の平均を取得
    const weekAgo = new Date(date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: weeklyData } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('revenue_date', weekAgo.toISOString().split('T')[0])
      .lt('revenue_date', date);

    // AI分析コメント生成
    const analysis = analyzePerformance(
      dailyData,
      previousData,
      weeklyData || []
    );

    // データベースに保存
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
    throw error;
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

  // 売上分析
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
    improvements.push(`前日比売上が${decrease}%減少しています`);
  }

  // 患者数分析
  if (todayPatients > yesterdayPatients) {
    highlights.push(
      `来院患者数が前日より${todayPatients - yesterdayPatients}名増加しました`
    );
  } else if (todayPatients < yesterdayPatients) {
    improvements.push(
      `来院患者数が前日より${yesterdayPatients - todayPatients}名減少しました`
    );
  }

  // 週平均との比較
  if (todayRevenue > weeklyAvgRevenue * 1.1) {
    highlights.push('週平均を上回る優秀な売上実績です');
  } else if (todayRevenue < weeklyAvgRevenue * 0.9) {
    improvements.push('週平均を下回る売上となっています');
  }

  // 提案生成
  if (improvements.length > 0) {
    suggestions.push('新患獲得キャンペーンの実施を検討してください');
    suggestions.push('既存患者へのフォローアップを強化しましょう');
  }

  if (highlights.length > 0) {
    suggestions.push('好調な要因を分析し、継続的な改善につなげましょう');
  }

  if (dailyData?.insurance_revenue && dailyData?.private_revenue) {
    const privateRatio =
      (dailyData.private_revenue /
        (dailyData.insurance_revenue + dailyData.private_revenue)) *
      100;
    if (privateRatio < 30) {
      suggestions.push('自費診療メニューの提案を積極的に行いましょう');
    }
  }

  // サマリー生成
  summary = `本日の売上は${todayRevenue.toLocaleString()}円、来院患者数は${todayPatients}名でした。`;
  if (highlights.length > 0) {
    summary += ' 全体的に良好な結果となっています。';
  } else if (improvements.length > 0) {
    summary += ' 改善の余地がある結果となっています。';
  } else {
    summary += ' 安定した運営状況です。';
  }

  return {
    summary,
    highlights:
      highlights.length > 0 ? highlights : ['安定した運営を継続されています'],
    improvements: improvements.length > 0 ? improvements : [],
    suggestions:
      suggestions.length > 0
        ? suggestions
        : ['現在の運営方針を継続してください'],
  };
}

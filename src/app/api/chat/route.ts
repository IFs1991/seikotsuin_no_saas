import { NextRequest, NextResponse } from 'next/server';
import { AppError, ERROR_CODES } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { generateAIComment } from '../../../api/gemini/ai-analysis-service';

const PATH = '/api/chat';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    const userId = searchParams.get('user_id');

    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      null,
      { requireClinicMatch: false }
    );

    const isPrivileged = ['admin', 'clinic_manager'].includes(permissions.role);
    const effectiveUserId = userId ?? user.id;

    if (effectiveUserId !== user.id && !isPrivileged) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        '他ユーザーのチャット履歴を閲覧する権限がありません',
        403
      );
    }

    let query = supabase.from('chat_sessions').select(`
        *,
        chat_messages(*)
      `);

    if (sessionId) {
      query = query.eq('id', sessionId);
    } else {
      query = query.eq('user_id', effectiveUserId);
    }

    const { data: sessions, error } = await query
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Chat GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinic_id, message, session_id } = body;

    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      clinic_id,
      { requireClinicMatch: Boolean(clinic_id) }
    );

    const user_id = body.user_id ?? user.id;

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    const isPrivileged = ['admin', 'clinic_manager'].includes(permissions.role);
    if (user.id !== user_id && !isPrivileged) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        '他ユーザーとしてメッセージを送信する権限がありません',
        403
      );
    }

    let currentSessionId = session_id;

    // 新しいセッションの場合、セッションを作成
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id,
          clinic_id,
          is_admin_session: !clinic_id,
        })
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      currentSessionId = newSession.id;
    }

    // ユーザーメッセージを保存
    const { data: userMessage, error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: currentSessionId,
        sender: 'user',
        message_text: message,
      })
      .select()
      .single();

    if (userMsgError) {
      throw userMsgError;
    }

    // コンテキストデータ取得（clinic_idがある場合）
    let contextData = {};
    if (clinic_id) {
      const { data: recentData } = await supabase
        .from('daily_revenue_summary')
        .select('*')
        .eq('clinic_id', clinic_id)
        .order('revenue_date', { ascending: false })
        .limit(7);

      contextData = {
        recentRevenue: recentData || [],
        clinicId: clinic_id,
      };
    }

    // AI応答生成
    const aiResponse = await generateAIResponse(message, contextData);

    // AI応答を保存
    const { data: aiMessage, error: aiMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: currentSessionId,
        sender: 'ai',
        message_text: aiResponse.message,
        response_data: aiResponse.data,
      })
      .select()
      .single();

    if (aiMsgError) {
      throw aiMsgError;
    }

    return NextResponse.json({
      success: true,
      data: {
        session_id: currentSessionId,
        user_message: userMessage,
        ai_message: aiMessage,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('Chat POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateAIResponse(message: string, contextData: any) {
  // 簡易的なAI応答生成（実際はGemini APIを使用）
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('売上') || lowerMessage.includes('収益')) {
    const recentRevenue = contextData.recentRevenue || [];
    const totalRevenue = recentRevenue.reduce(
      (sum: number, item: any) => sum + (item.total_revenue || 0),
      0
    );

    return {
      message: `最近7日間の売上状況をお答えします。総売上は${totalRevenue.toLocaleString()}円です。詳細な分析が必要でしたら、具体的にお聞かせください。`,
      data: {
        chart_data: recentRevenue,
        analysis_type: 'revenue',
      },
    };
  }

  if (lowerMessage.includes('患者') || lowerMessage.includes('来院')) {
    return {
      message:
        '患者動向について分析いたします。具体的にどの期間の患者データを確認されたいですか？新患数、リピート率、離脱リスクなど、詳細な項目もお聞かせください。',
      data: {
        analysis_type: 'patients',
      },
    };
  }

  if (lowerMessage.includes('スタッフ') || lowerMessage.includes('施術者')) {
    return {
      message:
        'スタッフのパフォーマンス分析をご提供します。収益貢献度、患者満足度、勤務実績など、どの観点から分析をご希望でしょうか？',
      data: {
        analysis_type: 'staff',
      },
    };
  }

  if (lowerMessage.includes('アドバイス') || lowerMessage.includes('改善')) {
    return {
      message:
        '経営改善のアドバイスをさせていただきます。現在のデータを基に、以下の点が改善ポイントとして考えられます：\n\n1. 新患獲得の強化\n2. リピート率の向上\n3. 自費診療メニューの充実\n\n具体的にどの分野のアドバイスをお求めでしょうか？',
      data: {
        analysis_type: 'advice',
      },
    };
  }

  // デフォルト応答
  return {
    message:
      'こんにちは！経営分析についてお手伝いします。売上分析、患者動向、スタッフ評価、経営アドバイスなど、どのような情報をお求めでしょうか？',
    data: {
      analysis_type: 'general',
    },
  };
}

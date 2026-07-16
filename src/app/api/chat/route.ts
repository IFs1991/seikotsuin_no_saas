import { NextRequest, NextResponse } from 'next/server';
import { AppError, ERROR_CODES } from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { ADMIN_UI_ROLES, type Role } from '@/lib/constants/roles';
import { createAuthorityUnavailableResponse } from '@/lib/api-helpers';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';
import type { Database } from '@/types/supabase';
import { resolveScopedChatSessionId } from '@/lib/chat/scoped-session';
import { ScopeAccessError } from '@/lib/auth/manager-scope';

const PATH = '/api/chat';

type DailyRevenueSummaryRow =
  Database['public']['Views']['daily_revenue_summary']['Row'];

type ChatContextData = {
  recentRevenue?: DailyRevenueSummaryRow[];
  clinicId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, PATH, clinicId, {
      requireClinicMatch: true,
    });

    let query = supabase.from('chat_sessions').select(`
        *,
        chat_messages(*)
      `);

    query = query.eq('clinic_id', clinicId);

    if (sessionId) {
      query = query.eq('id', sessionId);
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
    const authorityUnavailable = createAuthorityUnavailableResponse(error);
    if (authorityUnavailable) return authorityUnavailable;

    if (error instanceof ScopeAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

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
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid JSON data' }, { status: 400 });
    }

    const { clinic_id, message, session_id, user_id } = rawBody;

    if (typeof clinic_id !== 'string' || clinic_id.length === 0) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    if (typeof message !== 'string' || message.length === 0) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    if (
      session_id !== undefined &&
      session_id !== null &&
      (typeof session_id !== 'string' || session_id.length === 0)
    ) {
      return NextResponse.json(
        { error: 'session_id must be a non-empty string' },
        { status: 400 }
      );
    }

    if (
      user_id !== undefined &&
      user_id !== null &&
      (typeof user_id !== 'string' || user_id.length === 0)
    ) {
      return NextResponse.json(
        { error: 'user_id must be a non-empty string' },
        { status: 400 }
      );
    }

    const { supabase, user, permissions } = await ensureClinicAccess(
      request,
      PATH,
      clinic_id,
      { requireClinicMatch: true }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: clinic_id,
    });

    const targetUserId = typeof user_id === 'string' ? user_id : user.id;

    const isPrivileged = ADMIN_UI_ROLES.has(permissions.role as Role);
    if (user.id !== targetUserId && !isPrivileged) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        '他ユーザーとしてメッセージを送信する権限がありません',
        403
      );
    }

    let currentSessionId = typeof session_id === 'string' ? session_id : null;

    if (currentSessionId) {
      const { data: existingSession, error: sessionLookupError } =
        await supabase
          .from('chat_sessions')
          .select('id, clinic_id, user_id')
          .eq('id', currentSessionId)
          .eq('clinic_id', clinic_id)
          .maybeSingle();

      if (sessionLookupError) {
        throw sessionLookupError;
      }

      if (!existingSession || existingSession.user_id !== targetUserId) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          'このチャットセッションへのアクセス権限がありません',
          403
        );
      }
    }

    // 新しいセッションの場合、セッションを作成
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: targetUserId,
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

    const scopedSessionId = await resolveScopedChatSessionId({
      client: supabase,
      permissions,
      sessionId: currentSessionId,
      clinicId: clinic_id,
      userId: targetUserId,
    });

    // ユーザーメッセージを保存
    const { data: userMessage, error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: scopedSessionId,
        sender: 'user',
        message_text: message,
      })
      .select()
      .single();

    if (userMsgError) {
      throw userMsgError;
    }

    // コンテキストデータ取得（clinic_idがある場合）
    let contextData: ChatContextData = {};
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
        session_id: scopedSessionId,
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
        session_id: scopedSessionId,
        user_message: userMessage,
        ai_message: aiMessage,
      },
    });
  } catch (error) {
    const authorityUnavailable = createAuthorityUnavailableResponse(error);
    if (authorityUnavailable) return authorityUnavailable;

    if (error instanceof ScopeAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

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

async function generateAIResponse(
  message: string,
  contextData: ChatContextData
) {
  // 簡易的なAI応答生成（実際はGemini APIを使用）
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('売上') || lowerMessage.includes('収益')) {
    const recentRevenue = contextData.recentRevenue ?? [];
    const totalRevenue = recentRevenue.reduce(
      (sum, item) => sum + (item.total_revenue ?? 0),
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

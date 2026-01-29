/**
 * ベータフィードバック収集API
 *
 * このAPIは以下の機能を提供します：
 * - GET: ベータフィードバックの取得（クリニックまたは全体）
 * - POST: 新規フィードバックの投稿
 * - PATCH: フィードバックのステータス更新（管理者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// バリデーションスキーマ
const feedbackSubmitSchema = z.object({
  category: z.enum([
    'feature_request',
    'bug_report',
    'usability',
    'performance',
    'other',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  affectedFeature: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

const feedbackUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z
    .enum(['new', 'acknowledged', 'in_progress', 'resolved', 'closed'])
    .optional(),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  assignedTo: z.string().uuid().optional(),
  resolution: z.string().optional(),
});

/**
 * GET /api/beta/feedback
 * ベータフィードバックの取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized feedback access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // プロフィール取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // クエリパラメータ
    const clinicId = searchParams.get('clinicId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');

    // クエリ構築
    let query = supabase
      .from('beta_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    // 管理者以外は自分のクリニックのみ
    if (profile.role !== 'admin') {
      query = query.eq('clinic_id', profile.clinic_id);
    } else if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    // フィルター適用
    if (status) {
      query = query.eq('status', status);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data: feedback, error } = await query;

    if (error) {
      logger.error('Failed to fetch beta feedback', { error, userId: user.id });
      return NextResponse.json(
        { error: 'Failed to fetch feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback fetched successfully', {
      userId: user.id,
      count: feedback?.length || 0,
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    logger.error('Unexpected error in GET /api/beta/feedback', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/beta/feedback
 * 新規フィードバックの投稿
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized feedback submission attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // プロフィール取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('user_id', user.id)
      .single();

    if (!profile || !profile.clinic_id) {
      return NextResponse.json(
        { error: 'Profile or clinic not found' },
        { status: 404 }
      );
    }

    // リクエストボディ検証
    const body = await request.json();
    const validation = feedbackSubmitSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid feedback submission', {
        errors: validation.error.errors,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // ユーザー情報取得
    const { data: userData } = await supabase.auth.getUser();
    const userName = userData?.user?.email?.split('@')[0] || 'Unknown User';

    // フィードバック登録
    const { data: newFeedback, error: insertError } = await supabase
      .from('beta_feedback')
      .insert({
        clinic_id: profile.clinic_id,
        user_id: user.id,
        user_name: userName,
        category: data.category,
        severity: data.severity,
        title: data.title,
        description: data.description,
        affected_feature: data.affectedFeature,
        steps_to_reproduce: data.stepsToReproduce,
        expected_behavior: data.expectedBehavior,
        actual_behavior: data.actualBehavior,
        attachments: data.attachments || [],
        status: 'new',
        priority:
          data.severity === 'critical'
            ? 'p0'
            : data.severity === 'high'
              ? 'p1'
              : 'p3',
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to insert beta feedback', {
        error: insertError,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback submitted successfully', {
      userId: user.id,
      feedbackId: newFeedback.id,
      category: data.category,
      severity: data.severity,
    });

    return NextResponse.json({ feedback: newFeedback }, { status: 201 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/beta/feedback', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/beta/feedback
 * フィードバックのステータス更新（管理者のみ）
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized feedback update attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      logger.warn('Non-admin feedback update attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // リクエストボディ検証
    const body = await request.json();
    const validation = feedbackUpdateSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid feedback update', {
        errors: validation.error.errors,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { id, ...updates } = validation.data;

    // 更新データ構築
    const updateData: Record<string, unknown> = {};
    if (updates.status) updateData.status = updates.status;
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.assignedTo) updateData.assigned_to = updates.assignedTo;
    if (updates.resolution) updateData.resolution = updates.resolution;

    // resolvedステータスの場合、resolved_atを設定
    if (updates.status === 'resolved' || updates.status === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }

    // フィードバック更新
    const { data: updatedFeedback, error: updateError } = await supabase
      .from('beta_feedback')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update beta feedback', {
        error: updateError,
        feedbackId: id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to update feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback updated successfully', {
      userId: user.id,
      feedbackId: id,
      updates,
    });

    return NextResponse.json({ feedback: updatedFeedback });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/beta/feedback', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

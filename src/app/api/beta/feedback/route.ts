/**
 * ベータフィードバック収集API
 *
 * このAPIは以下の機能を提供します：
 * - GET: ベータフィードバックの取得（クリニックまたは全体）
 * - POST: 新規フィードバックの投稿
 * - PATCH: フィードバックのステータス更新（管理者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { canAccessClinicScope, resolveScopedClinicIds } from '@/lib/supabase';
import { processApiRequest } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const FEEDBACK_ADMIN_ROLES = ['admin'] as const;

type FeedbackScopeRow = {
  clinic_id: string;
};

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
    const { searchParams } = new URL(request.url);

    const processResult = await processApiRequest(request, {
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, supabase } = processResult;

    // クエリパラメータ
    const clinicId = searchParams.get('clinicId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const scopedClinicIds = resolveScopedClinicIds(permissions);

    if (!scopedClinicIds || scopedClinicIds.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden: Clinic scope required' },
        { status: 403 }
      );
    }

    if (clinicId && !canAccessClinicScope(permissions, clinicId)) {
      return NextResponse.json(
        { error: 'Forbidden: Clinic access denied' },
        { status: 403 }
      );
    }

    // クエリ構築
    let query = supabase
      .from('beta_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    // Admin is also limited to the canonical DB/JWT scope.
    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    } else {
      query = query.in('clinic_id', scopedClinicIds);
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
      logger.error('Failed to fetch beta feedback', {
        error,
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Failed to fetch feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback fetched successfully', {
      userId: auth.id,
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
    const processResult = await processApiRequest(request, {
      requireBody: true,
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });
    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, body, permissions, supabase } = processResult;
    const targetClinicId = resolveScopedClinicIds(permissions)?.[0] ?? null;

    if (!targetClinicId || !canAccessClinicScope(permissions, targetClinicId)) {
      return NextResponse.json(
        { error: 'Forbidden: Clinic access denied' },
        { status: 403 }
      );
    }

    // リクエストボディ検証
    const validation = feedbackSubmitSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid feedback submission', {
        errors: validation.error.errors,
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    const userName = auth.email.split('@')[0] || 'Unknown User';

    // フィードバック登録
    const { data: newFeedback, error: insertError } = await supabase
      .from('beta_feedback')
      .insert({
        clinic_id: targetClinicId,
        user_id: auth.id,
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
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback submitted successfully', {
      userId: auth.id,
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
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(FEEDBACK_ADMIN_ROLES),
      requireBody: true,
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });
    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, body, permissions, supabase } = processResult;

    if (permissions.role !== 'admin') {
      logger.warn('Non-admin feedback update attempt', { userId: auth.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // リクエストボディ検証
    const validation = feedbackUpdateSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid feedback update', {
        errors: validation.error.errors,
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { id, ...updates } = validation.data;

    const { data: targetFeedback, error: targetError } = await supabase
      .from('beta_feedback')
      .select('clinic_id')
      .eq('id', id)
      .maybeSingle<FeedbackScopeRow>();

    if (targetError) {
      logger.error('Failed to resolve beta feedback scope', {
        error: targetError,
        feedbackId: id,
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Failed to update feedback' },
        { status: 500 }
      );
    }

    if (!targetFeedback) {
      return NextResponse.json(
        { error: 'Feedback not found' },
        { status: 404 }
      );
    }

    if (!canAccessClinicScope(permissions, targetFeedback.clinic_id)) {
      return NextResponse.json(
        { error: 'Forbidden: Clinic access denied' },
        { status: 403 }
      );
    }

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
      .eq('clinic_id', targetFeedback.clinic_id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update beta feedback', {
        error: updateError,
        feedbackId: id,
        userId: auth.id,
      });
      return NextResponse.json(
        { error: 'Failed to update feedback' },
        { status: 500 }
      );
    }

    logger.info('Beta feedback updated successfully', {
      userId: auth.id,
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

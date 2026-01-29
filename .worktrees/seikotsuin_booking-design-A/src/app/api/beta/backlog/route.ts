/**
 * 改善バックログ管理API
 *
 * このAPIは以下の機能を提供します：
 * - GET: 改善バックログの取得
 * - POST: 新規バックログアイテムの作成（管理者のみ）
 * - PATCH: バックログアイテムの更新（管理者のみ）
 * - DELETE: バックログアイテムの削除（管理者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// バリデーションスキーマ
const backlogCreateSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  category: z.enum([
    'feature',
    'enhancement',
    'bug_fix',
    'technical_debt',
    'documentation',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  estimatedEffort: z.enum(['xs', 's', 'm', 'l', 'xl']),
  businessValue: z.number().min(1).max(10),
  relatedFeedbackIds: z.array(z.string().uuid()).optional(),
  affectedClinics: z.array(z.string().uuid()).optional(),
  milestone: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

const backlogUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  category: z
    .enum([
      'feature',
      'enhancement',
      'bug_fix',
      'technical_debt',
      'documentation',
    ])
    .optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  estimatedEffort: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
  businessValue: z.number().min(1).max(10).optional(),
  status: z
    .enum(['backlog', 'planned', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  milestone: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

/**
 * GET /api/beta/backlog
 * 改善バックログの取得
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
      logger.warn('Unauthorized backlog access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // クエリパラメータ
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const milestone = searchParams.get('milestone');

    // クエリ構築
    let query = supabase
      .from('improvement_backlog')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

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
    if (milestone) {
      query = query.eq('milestone', milestone);
    }

    const { data: backlog, error } = await query;

    if (error) {
      logger.error('Failed to fetch improvement backlog', {
        error,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to fetch backlog' },
        { status: 500 }
      );
    }

    logger.info('Improvement backlog fetched successfully', {
      userId: user.id,
      count: backlog?.length || 0,
    });

    return NextResponse.json({ backlog });
  } catch (error) {
    logger.error('Unexpected error in GET /api/beta/backlog', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/beta/backlog
 * 新規バックログアイテムの作成（管理者のみ）
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
      logger.warn('Unauthorized backlog creation attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      logger.warn('Non-admin backlog creation attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // リクエストボディ検証
    const body = await request.json();
    const validation = backlogCreateSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid backlog creation', {
        errors: validation.error.errors,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // バックログアイテム作成
    const { data: newBacklog, error: insertError } = await supabase
      .from('improvement_backlog')
      .insert({
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        estimated_effort: data.estimatedEffort,
        business_value: data.businessValue,
        related_feedback_ids: data.relatedFeedbackIds || [],
        affected_clinics: data.affectedClinics || [],
        milestone: data.milestone,
        assigned_to: data.assignedTo,
        status: 'backlog',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to insert backlog item', {
        error: insertError,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to create backlog item' },
        { status: 500 }
      );
    }

    logger.info('Backlog item created successfully', {
      userId: user.id,
      backlogId: newBacklog.id,
      category: data.category,
      priority: data.priority,
    });

    return NextResponse.json({ backlog: newBacklog }, { status: 201 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/beta/backlog', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/beta/backlog
 * バックログアイテムの更新（管理者のみ）
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
      logger.warn('Unauthorized backlog update attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      logger.warn('Non-admin backlog update attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // リクエストボディ検証
    const body = await request.json();
    const validation = backlogUpdateSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Invalid backlog update', {
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
    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.category) updateData.category = updates.category;
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.estimatedEffort)
      updateData.estimated_effort = updates.estimatedEffort;
    if (updates.businessValue)
      updateData.business_value = updates.businessValue;
    if (updates.status) updateData.status = updates.status;
    if (updates.milestone) updateData.milestone = updates.milestone;
    if (updates.assignedTo) updateData.assigned_to = updates.assignedTo;

    // ステータスが'in_progress'に変更された場合、started_atを設定
    if (updates.status === 'in_progress') {
      const { data: existingBacklog } = await supabase
        .from('improvement_backlog')
        .select('started_at')
        .eq('id', id)
        .single();

      if (!existingBacklog?.started_at) {
        updateData.started_at = new Date().toISOString();
      }
    }

    // ステータスが'completed'に変更された場合、completed_atを設定
    if (updates.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    // バックログアイテム更新
    const { data: updatedBacklog, error: updateError } = await supabase
      .from('improvement_backlog')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update backlog item', {
        error: updateError,
        backlogId: id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to update backlog item' },
        { status: 500 }
      );
    }

    logger.info('Backlog item updated successfully', {
      userId: user.id,
      backlogId: id,
      updates,
    });

    return NextResponse.json({ backlog: updatedBacklog });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/beta/backlog', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/beta/backlog
 * バックログアイテムの削除（管理者のみ）
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing backlog item id' },
        { status: 400 }
      );
    }

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized backlog deletion attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      logger.warn('Non-admin backlog deletion attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // バックログアイテム削除
    const { error: deleteError } = await supabase
      .from('improvement_backlog')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('Failed to delete backlog item', {
        error: deleteError,
        backlogId: id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to delete backlog item' },
        { status: 500 }
      );
    }

    logger.info('Backlog item deleted successfully', {
      userId: user.id,
      backlogId: id,
    });

    return NextResponse.json({ message: 'Backlog item deleted successfully' });
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/beta/backlog', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

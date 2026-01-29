/**
 * 販売停止（Block）サービス層
 * F008: 販売停止設定機能
 * DOD-09: server-only サーバーサイド専用
 */

import 'server-only';

import { getServerClient, type SupabaseServerClient } from '@/lib/supabase';
import type { Block, CreateBlockData } from '@/types/reservation';

export class BlockService {
  private readonly clinicId: string;
  private readonly supabase: SupabaseServerClient | null;

  constructor(clinicId: string, supabase?: SupabaseServerClient) {
    if (!clinicId) {
      throw new Error('clinicId is required for BlockService');
    }
    this.clinicId = clinicId;
    this.supabase = supabase ?? null;
  }

  private async getSupabase(): Promise<SupabaseServerClient> {
    if (this.supabase) {
      return this.supabase;
    }
    return await getServerClient();
  }

  /**
   * Block作成
   * @param data Block作成データ
   * @returns 作成されたBlock
   */
  async createBlock(data: CreateBlockData): Promise<Block> {
    const supabase = await this.getSupabase();
    const blockData = {
      ...data,
      clinic_id: this.clinicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { data: result, error } = await supabase
      .from('blocks')
      .insert(blockData)
      .select()
      .single();

    if (error) {
      throw new Error(`Block作成に失敗しました: ${error.message}`);
    }

    return result;
  }

  /**
   * Block取得（ID指定）
   * @param id BlockID
   * @returns Block
   */
  async getBlockById(id: string): Promise<Block> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', this.clinicId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error('Blockが見つかりません');
    }

    return data;
  }

  /**
   * リソース別Block一覧取得
   * @param resourceId リソースID
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns Block配列
   */
  async getBlocksByResource(
    resourceId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Block[]> {
    const supabase = await this.getSupabase();
    let query = supabase
      .from('blocks')
      .select('*')
      .eq('resourceId', resourceId)
      .eq('clinic_id', this.clinicId);

    if (startDate) {
      query = query.gte('startTime', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('endTime', endDate.toISOString());
    }

    const { data, error } = await query.order('startTime', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * 期間内の全Block取得
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns Block配列
   */
  async getBlocksByDateRange(startDate: Date, endDate: Date): Promise<Block[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('clinic_id', this.clinicId)
      .gte('startTime', startDate.toISOString())
      .lte('endTime', endDate.toISOString())
      .order('startTime', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Block更新
   * @param id BlockID
   * @param updates 更新データ
   * @returns 更新されたBlock
   */
  async updateBlock(
    id: string,
    updates: Partial<Omit<Block, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<Block> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from('blocks')
      .update({ ...updates, updatedAt: new Date() })
      .eq('id', id)
      .eq('clinic_id', this.clinicId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Block削除
   * @param id BlockID
   * @returns 成功フラグ
   */
  async deleteBlock(id: string): Promise<boolean> {
    const supabase = await this.getSupabase();
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', id)
      .eq('clinic_id', this.clinicId);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  }

  /**
   * 指定時刻がブロックされているか確認
   * @param resourceId リソースID
   * @param startTime 開始時刻
   * @param endTime 終了時刻
   * @returns ブロック情報（ブロックされていない場合はnull）
   */
  async checkBlockConflict(
    resourceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Block | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('resourceId', resourceId)
      .eq('clinic_id', this.clinicId)
      .or(
        `startTime.lt.${endTime.toISOString()},endTime.gt.${startTime.toISOString()}`
      )
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = No rows found
      throw new Error(error.message);
    }

    return data || null;
  }

  /**
   * 繰り返しBlockの展開（RRULE処理）
   * 簡易実装：毎週繰り返しのみ対応
   * 完全なRFC 5545対応は外部ライブラリ（rrule.js等）の使用を推奨
   */
  async expandRecurringBlock(block: Block, untilDate: Date): Promise<Block[]> {
    if (!block.recurrenceRule) {
      return [block];
    }

    // 簡易的な毎週繰り返し処理（例: FREQ=WEEKLY;COUNT=4）
    const expanded: Block[] = [block];

    // RRULEパースの簡易実装（実際にはrrule.jsを使用することを推奨）
    const match = block.recurrenceRule.match(/FREQ=WEEKLY;COUNT=(\d+)/);
    if (match && match[1]) {
      const count = parseInt(match[1]);
      const duration = block.endTime.getTime() - block.startTime.getTime();

      for (let i = 1; i < count; i++) {
        const newStartTime = new Date(block.startTime);
        newStartTime.setDate(newStartTime.getDate() + i * 7);

        if (newStartTime > untilDate) break;

        const newEndTime = new Date(newStartTime.getTime() + duration);

        expanded.push({
          ...block,
          id: `${block.id}-recur-${i}`,
          startTime: newStartTime,
          endTime: newEndTime,
        });
      }
    }

    return expanded;
  }
}

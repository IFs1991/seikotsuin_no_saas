/**
 * バックアップコード生成・管理システム
 * Phase 3B: MFA認証のフォールバック機能
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// バックアップコード設定
export const BACKUP_CODE_CONFIG = {
  COUNT: 10, // 生成するバックアップコードの数
  LENGTH: 8, // 各コードの長さ
  CHARSET: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', // 使用可能文字
  MIN_REMAINING_WARNING: 3, // 残りコード数の警告閾値
} as const;

// バックアップコードスキーマ
const BackupCodeSchema = z.object({
  code: z.string().length(BACKUP_CODE_CONFIG.LENGTH, `バックアップコードは${BACKUP_CODE_CONFIG.LENGTH}桁である必要があります`),
  isUsed: z.boolean().default(false),
  usedAt: z.date().optional(),
});

const BackupCodeSetSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  clinicId: z.string().min(1, 'クリニックIDが必要です'),
  codes: z.array(BackupCodeSchema).length(BACKUP_CODE_CONFIG.COUNT),
  generatedAt: z.date(),
});

export type BackupCode = z.infer<typeof BackupCodeSchema>;
export type BackupCodeSet = z.infer<typeof BackupCodeSetSchema>;

export interface BackupCodeUsage {
  totalGenerated: number;
  totalUsed: number;
  remainingCount: number;
  lastUsed?: Date;
  generatedAt: Date;
  warningLevel: 'none' | 'low' | 'critical';
}

/**
 * バックアップコード管理クラス
 * 高度なセキュリティを持つワンタイムコード生成・検証・管理
 */
export class BackupCodeManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * 新しいバックアップコードセット生成
   * 暗号学的に安全な乱数を使用した高品質なコード生成
   */
  generateBackupCodes(): string[] {
    const codes: string[] = [];
    const charset = BACKUP_CODE_CONFIG.CHARSET;
    
    // 衝突回避のためのセット
    const generatedCodes = new Set<string>();
    
    while (codes.length < BACKUP_CODE_CONFIG.COUNT) {
      let code = '';
      
      // 各文字を暗号学的に安全な乱数で選択
      for (let i = 0; i < BACKUP_CODE_CONFIG.LENGTH; i++) {
        const randomIndex = this.getSecureRandomInt(0, charset.length - 1);
        code += charset.charAt(randomIndex);
      }
      
      // 重複チェック
      if (!generatedCodes.has(code)) {
        generatedCodes.add(code);
        codes.push(code);
      }
    }
    
    return codes;
  }

  /**
   * バックアップコードの検証とマーク
   * 使用済みコードは自動的に無効化される
   */
  async verifyAndMarkBackupCode(userId: string, inputCode: string): Promise<{
    isValid: boolean;
    remainingCodes: number;
    warningLevel: 'none' | 'low' | 'critical';
  }> {
    try {
      // 入力コードの正規化
      const normalizedCode = inputCode.toUpperCase().trim();
      
      if (normalizedCode.length !== BACKUP_CODE_CONFIG.LENGTH) {
        return {
          isValid: false,
          remainingCodes: 0,
          warningLevel: 'none',
        };
      }

      // 現在のMFA設定取得
      const { data: mfaSettings, error } = await this.supabase
        .from('user_mfa_settings')
        .select('*')
        .eq('user_id', userId)
        .eq('is_enabled', true)
        .single();

      if (error || !mfaSettings) {
        throw new Error('MFA設定が見つかりません');
      }

      const backupCodes = (mfaSettings.backup_codes as string[]) || [];
      const codeIndex = backupCodes.indexOf(normalizedCode);

      if (codeIndex === -1) {
        // 無効なコードの試行をログ記録
        await this.logBackupCodeEvent(userId, 'invalid_attempt', {
          code: normalizedCode.slice(0, 2) + '****',
          remainingCodes: backupCodes.length,
        });

        return {
          isValid: false,
          remainingCodes: backupCodes.length,
          warningLevel: this.getWarningLevel(backupCodes.length),
        };
      }

      // バックアップコードを使用済みとしてマーク（削除）
      const updatedBackupCodes = [...backupCodes];
      updatedBackupCodes.splice(codeIndex, 1);

      // データベース更新
      await this.supabase
        .from('user_mfa_settings')
        .update({
          backup_codes: updatedBackupCodes,
          last_used_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      // 使用ログ記録
      await this.logBackupCodeEvent(userId, 'code_used', {
        code: normalizedCode.slice(0, 2) + '****',
        remainingCodes: updatedBackupCodes.length,
      });

      const warningLevel = this.getWarningLevel(updatedBackupCodes.length);

      // 残りコードが少ない場合の警告
      if (warningLevel !== 'none') {
        await this.logBackupCodeEvent(userId, 'low_codes_warning', {
          remainingCodes: updatedBackupCodes.length,
          warningLevel,
        });
      }

      return {
        isValid: true,
        remainingCodes: updatedBackupCodes.length,
        warningLevel,
      };

    } catch (error) {
      throw new Error(`バックアップコード検証エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコード使用状況取得
   */
  async getBackupCodeUsage(userId: string): Promise<BackupCodeUsage> {
    try {
      const { data: mfaSettings, error } = await this.supabase
        .from('user_mfa_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !mfaSettings) {
        throw new Error('MFA設定が見つかりません');
      }

      const backupCodes = (mfaSettings.backup_codes as string[]) || [];
      const remainingCount = backupCodes.length;
      const totalUsed = BACKUP_CODE_CONFIG.COUNT - remainingCount;

      return {
        totalGenerated: BACKUP_CODE_CONFIG.COUNT,
        totalUsed,
        remainingCount,
        lastUsed: mfaSettings.last_used_at ? new Date(mfaSettings.last_used_at) : undefined,
        generatedAt: new Date(mfaSettings.setup_completed_at || mfaSettings.created_at),
        warningLevel: this.getWarningLevel(remainingCount),
      };

    } catch (error) {
      throw new Error(`バックアップコード使用状況取得エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコード再生成
   * 既存のコードを全て無効化して新しいセットを生成
   */
  async regenerateBackupCodes(userId: string, adminUserId?: string): Promise<string[]> {
    try {
      // 新しいバックアップコード生成
      const newBackupCodes = this.generateBackupCodes();

      // データベース更新
      const { error } = await this.supabase
        .from('user_mfa_settings')
        .update({
          backup_codes: newBackupCodes,
          backup_codes_regenerated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_enabled', true);

      if (error) {
        throw new Error(`データベースエラー: ${error.message}`);
      }

      // 再生成ログ記録
      await this.logBackupCodeEvent(userId, 'codes_regenerated', {
        newCodeCount: newBackupCodes.length,
        regeneratedBy: adminUserId || userId,
        isAdminAction: !!adminUserId,
      });

      return newBackupCodes;

    } catch (error) {
      throw new Error(`バックアップコード再生成エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコード統計取得（管理者用）
   */
  async getBackupCodeStatistics(clinicId: string): Promise<{
    totalUsersWithMFA: number;
    usersWithBackupCodes: number;
    usersWithLowCodes: number;
    averageCodesRemaining: number;
    recentUsageCount: number;
  }> {
    try {
      // MFA有効ユーザー統計
      const { data: mfaUsers, error } = await this.supabase
        .from('user_mfa_settings')
        .select('backup_codes, last_used_at')
        .eq('clinic_id', clinicId)
        .eq('is_enabled', true);

      if (error) {
        throw new Error(`統計取得エラー: ${error.message}`);
      }

      const totalUsersWithMFA = mfaUsers.length;
      let usersWithBackupCodes = 0;
      let usersWithLowCodes = 0;
      let totalCodesRemaining = 0;

      for (const user of mfaUsers) {
        const codes = (user.backup_codes as string[]) || [];
        const remainingCount = codes.length;

        if (remainingCount > 0) {
          usersWithBackupCodes++;
          totalCodesRemaining += remainingCount;

          if (remainingCount <= BACKUP_CODE_CONFIG.MIN_REMAINING_WARNING) {
            usersWithLowCodes++;
          }
        }
      }

      const averageCodesRemaining = usersWithBackupCodes > 0 ? 
        Math.round((totalCodesRemaining / usersWithBackupCodes) * 100) / 100 : 0;

      // 最近のバックアップコード使用回数（直近7日間）
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { count: recentUsageCount } = await this.supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'mfa_backup_code_success')
        .gte('created_at', weekAgo.toISOString())
        .in('user_id', mfaUsers.map(u => u.user_id));

      return {
        totalUsersWithMFA,
        usersWithBackupCodes,
        usersWithLowCodes,
        averageCodesRemaining,
        recentUsageCount: recentUsageCount || 0,
      };

    } catch (error) {
      throw new Error(`バックアップコード統計取得エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコードのフォーマット（表示用）
   * 可読性を向上させるためにハイフンで区切る
   */
  formatBackupCodeForDisplay(code: string): string {
    if (code.length !== BACKUP_CODE_CONFIG.LENGTH) {
      return code;
    }

    // 4文字ずつハイフンで区切る
    return code.match(/.{1,4}/g)?.join('-') || code;
  }

  /**
   * バックアップコードの検証（フォーマット済み入力対応）
   */
  normalizeBackupCodeInput(input: string): string {
    // ハイフン、スペース、小文字を正規化
    return input
      .toUpperCase()
      .replace(/[-\s]/g, '')
      .trim();
  }

  /**
   * 暗号学的に安全な乱数生成
   */
  private getSecureRandomInt(min: number, max: number): number {
    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8);
    const maxValidValue = Math.floor(256 ** bytesNeeded / range) * range - 1;

    let randomValue: number;
    do {
      const randomBytes = new Uint8Array(bytesNeeded);
      
      // Node.js環境とブラウザ環境両対応
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
      } else if (typeof require !== 'undefined') {
        // Node.js環境
        const nodeCrypto = require('crypto');
        const randomBytesBuffer = nodeCrypto.randomBytes(bytesNeeded);
        for (let i = 0; i < bytesNeeded; i++) {
          randomBytes[i] = randomBytesBuffer[i];
        }
      } else {
        // フォールバック（非推奨）
        for (let i = 0; i < bytesNeeded; i++) {
          randomBytes[i] = Math.floor(Math.random() * 256);
        }
      }

      randomValue = randomBytes.reduce((acc, byte, index) => {
        return acc + byte * (256 ** index);
      }, 0);

    } while (randomValue > maxValidValue);

    return min + (randomValue % range);
  }

  /**
   * 警告レベル判定
   */
  private getWarningLevel(remainingCodes: number): 'none' | 'low' | 'critical' {
    if (remainingCodes === 0) {
      return 'critical';
    } else if (remainingCodes <= BACKUP_CODE_CONFIG.MIN_REMAINING_WARNING) {
      return 'low';
    } else {
      return 'none';
    }
  }

  /**
   * バックアップコードイベントログ記録
   */
  private async logBackupCodeEvent(
    userId: string,
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          event_type: `mfa_backup_${eventType}`,
          user_id: userId,
          event_details: details,
          ip_address: '', // ミドルウェアで設定される
          user_agent: '', // ミドルウェアで設定される
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      // ログ記録エラーは主機能を妨げない
      console.error('バックアップコードイベントログ記録エラー:', error);
    }
  }
}

// シングルトンインスタンス
export const backupCodeManager = new BackupCodeManager();
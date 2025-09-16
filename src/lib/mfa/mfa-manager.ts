/**
 * MFA（多要素認証）管理システム
 * Phase 3B: TOTP認証システム構築
 */

import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// MFA設定スキーマ
const MFAConfigSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDが必要です'),
  clinicId: z.string().min(1, 'クリニックIDが必要です'),
  secretKey: z.string().optional(),
  backupCodes: z.array(z.string()).optional(),
  isEnabled: z.boolean().default(false),
});

const MFAVerificationSchema = z.object({
  userId: z.string().min(1),
  token: z.string().length(6, 'TOTPトークンは6桁である必要があります'),
  window: z.number().min(1).max(4).default(1), // 時間窓（±30秒単位）
});

const BackupCodeSchema = z.object({
  userId: z.string().min(1),
  code: z.string().length(8, 'バックアップコードは8桁である必要があります'),
});

export type MFAConfig = z.infer<typeof MFAConfigSchema>;
export type MFAVerification = z.infer<typeof MFAVerificationSchema>;
export type BackupCodeVerification = z.infer<typeof BackupCodeSchema>;

export interface MFASetupResult {
  secretKey: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export interface MFAStatus {
  isEnabled: boolean;
  hasBackupCodes: boolean;
  lastUsed?: Date;
  setupCompletedAt?: Date;
}

/**
 * MFA管理クラス
 * TOTP（Time-based One-Time Password）認証の完全実装
 */
export class MFAManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * MFAセットアップ開始
   * 秘密鍵とQRコード、バックアップコードを生成
   */
  async initiateMFASetup(userId: string, clinicId: string): Promise<MFASetupResult> {
    try {
      // 入力値検証
      const validatedData = MFAConfigSchema.parse({ userId, clinicId });

      // 既存のMFA設定確認
      const existingMFA = await this.getMFAStatus(userId);
      if (existingMFA.isEnabled) {
        throw new Error('MFAは既に有効化されています');
      }

      // 秘密鍵生成（RFC 4648 Base32エンコード）
      const secret = speakeasy.generateSecret({
        name: `整骨院管理SaaS (${userId})`,
        issuer: '整骨院管理SaaS',
        length: 32, // 256ビット強度
      });

      if (!secret.base32) {
        throw new Error('秘密鍵の生成に失敗しました');
      }

      // QRコード生成
      const qrCodeUrl = await this.generateQRCode(secret.otpauth_url || '');

      // バックアップコード生成（10個）
      const backupCodes = this.generateBackupCodes();

      // データベースに一時保存（セットアップ完了まで）
      await this.supabase
        .from('mfa_setup_sessions')
        .insert({
          user_id: validatedData.userId,
          clinic_id: validatedData.clinicId,
          secret_key: secret.base32,
          backup_codes: backupCodes,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15分有効
          created_at: new Date().toISOString(),
        });

      return {
        secretKey: secret.base32,
        qrCodeUrl,
        backupCodes,
        manualEntryKey: this.formatSecretForManualEntry(secret.base32),
      };

    } catch (error) {
      throw new Error(`MFAセットアップ開始エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * MFAセットアップ完了
   * ユーザーがTOTPトークンを入力してセットアップを確認
   */
  async completeMFASetup(userId: string, token: string): Promise<boolean> {
    try {
      // 入力値検証
      const validatedVerification = MFAVerificationSchema.parse({ userId, token });

      // セットアップセッション取得
      const { data: setupSession, error } = await this.supabase
        .from('mfa_setup_sessions')
        .select('*')
        .eq('user_id', validatedVerification.userId)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !setupSession) {
        throw new Error('MFAセットアップセッションが見つからないか期限切れです');
      }

      // TOTPトークン検証
      const isValidToken = speakeasy.totp.verify({
        secret: setupSession.secret_key,
        encoding: 'base32',
        token: validatedVerification.token,
        window: 2, // セットアップ時は少し寛容に
      });

      if (!isValidToken) {
        throw new Error('無効なTOTPトークンです');
      }

      // MFA設定を正式に有効化
      await this.supabase
        .from('user_mfa_settings')
        .upsert({
          user_id: validatedVerification.userId,
          clinic_id: setupSession.clinic_id,
          secret_key: setupSession.secret_key,
          backup_codes: setupSession.backup_codes,
          is_enabled: true,
          setup_completed_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      // セットアップセッション削除
      await this.supabase
        .from('mfa_setup_sessions')
        .delete()
        .eq('id', setupSession.id);

      return true;

    } catch (error) {
      throw new Error(`MFAセットアップ完了エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * TOTP認証検証
   * ログイン時やセンシティブな操作時の認証
   */
  async verifyTOTP(userId: string, token: string, window: number = 1): Promise<boolean> {
    try {
      // 入力値検証
      const validatedVerification = MFAVerificationSchema.parse({ userId, token, window });

      // MFA設定取得
      const { data: mfaSettings, error } = await this.supabase
        .from('user_mfa_settings')
        .select('*')
        .eq('user_id', validatedVerification.userId)
        .eq('is_enabled', true)
        .single();

      if (error || !mfaSettings) {
        throw new Error('MFA設定が見つかりません');
      }

      // TOTP検証
      const isValid = speakeasy.totp.verify({
        secret: mfaSettings.secret_key,
        encoding: 'base32',
        token: validatedVerification.token,
        window: validatedVerification.window,
      });

      if (isValid) {
        // 最終使用日時更新
        await this.supabase
          .from('user_mfa_settings')
          .update({ last_used_at: new Date().toISOString() })
          .eq('user_id', validatedVerification.userId);

        // 成功ログ記録
        await this.logMFAEvent({
          userId: validatedVerification.userId,
          eventType: 'totp_success',
          details: { window: validatedVerification.window },
        });

        return true;
      } else {
        // 失敗ログ記録
        await this.logMFAEvent({
          userId: validatedVerification.userId,
          eventType: 'totp_failed',
          details: { token: token.slice(0, 2) + '****' }, // 部分的なトークンのみログ
        });

        return false;
      }

    } catch (error) {
      throw new Error(`TOTP検証エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコード検証
   * TOTPが利用できない場合の緊急アクセス
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      // 入力値検証
      const validatedCode = BackupCodeSchema.parse({ userId, code: code.toUpperCase() });

      // MFA設定取得
      const { data: mfaSettings, error } = await this.supabase
        .from('user_mfa_settings')
        .select('*')
        .eq('user_id', validatedCode.userId)
        .eq('is_enabled', true)
        .single();

      if (error || !mfaSettings) {
        throw new Error('MFA設定が見つかりません');
      }

      const backupCodes = mfaSettings.backup_codes || [];
      const codeIndex = backupCodes.indexOf(validatedCode.code);

      if (codeIndex === -1) {
        // 失敗ログ記録
        await this.logMFAEvent({
          userId: validatedCode.userId,
          eventType: 'backup_code_failed',
          details: { code: validatedCode.code.slice(0, 2) + '****' },
        });
        return false;
      }

      // バックアップコードを使用済みとしてマーク（削除）
      const updatedBackupCodes = [...backupCodes];
      updatedBackupCodes.splice(codeIndex, 1);

      await this.supabase
        .from('user_mfa_settings')
        .update({
          backup_codes: updatedBackupCodes,
          last_used_at: new Date().toISOString(),
        })
        .eq('user_id', validatedCode.userId);

      // 成功ログ記録
      await this.logMFAEvent({
        userId: validatedCode.userId,
        eventType: 'backup_code_success',
        details: {
          code: validatedCode.code.slice(0, 2) + '****',
          remainingCodes: updatedBackupCodes.length,
        },
      });

      // バックアップコードが少なくなった場合の警告
      if (updatedBackupCodes.length <= 2) {
        await this.logMFAEvent({
          userId: validatedCode.userId,
          eventType: 'backup_codes_low',
          details: { remainingCodes: updatedBackupCodes.length },
        });
      }

      return true;

    } catch (error) {
      throw new Error(`バックアップコード検証エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * MFA状態取得
   */
  async getMFAStatus(userId: string): Promise<MFAStatus> {
    try {
      const { data: mfaSettings, error } = await this.supabase
        .from('user_mfa_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !mfaSettings) {
        return {
          isEnabled: false,
          hasBackupCodes: false,
        };
      }

      return {
        isEnabled: mfaSettings.is_enabled,
        hasBackupCodes: (mfaSettings.backup_codes || []).length > 0,
        lastUsed: mfaSettings.last_used_at ? new Date(mfaSettings.last_used_at) : undefined,
        setupCompletedAt: mfaSettings.setup_completed_at ? new Date(mfaSettings.setup_completed_at) : undefined,
      };

    } catch (error) {
      throw new Error(`MFA状態取得エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * MFA無効化
   * 管理者またはユーザー自身による無効化
   */
  async disableMFA(userId: string, adminUserId?: string): Promise<boolean> {
    try {
      // MFA設定を無効化
      const { error } = await this.supabase
        .from('user_mfa_settings')
        .update({
          is_enabled: false,
          disabled_at: new Date().toISOString(),
          disabled_by: adminUserId || userId,
        })
        .eq('user_id', userId);

      if (error) {
        throw new Error(`データベースエラー: ${error.message}`);
      }

      // 無効化ログ記録
      await this.logMFAEvent({
        userId,
        eventType: 'mfa_disabled',
        details: {
          disabledBy: adminUserId || userId,
          isAdminAction: !!adminUserId,
        },
      });

      return true;

    } catch (error) {
      throw new Error(`MFA無効化エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * バックアップコード再生成
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
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
      await this.logMFAEvent({
        userId,
        eventType: 'backup_codes_regenerated',
        details: { codeCount: newBackupCodes.length },
      });

      return newBackupCodes;

    } catch (error) {
      throw new Error(`バックアップコード再生成エラー: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * QRコード生成
   */
  private async generateQRCode(otpauthUrl: string): Promise<string> {
    try {
      return await qrcode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 256,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    } catch (error) {
      throw new Error('QRコード生成に失敗しました');
    }
  }

  /**
   * バックアップコード生成（10個）
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < 10; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    
    return codes;
  }

  /**
   * 手動入力用の秘密鍵フォーマット
   */
  private formatSecretForManualEntry(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }

  /**
   * MFAイベントログ記録
   */
  private async logMFAEvent(event: {
    userId: string;
    eventType: string;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.supabase
        .from('security_events')
        .insert({
          event_type: `mfa_${event.eventType}`,
          user_id: event.userId,
          event_details: event.details || {},
          ip_address: '', // ミドルウェアで設定される
          user_agent: '', // ミドルウェアで設定される
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      // ログ記録エラーは主機能を妨げない
      console.error('MFAイベントログ記録エラー:', error);
    }
  }
}

// シングルトンインスタンス
export const mfaManager = new MFAManager();
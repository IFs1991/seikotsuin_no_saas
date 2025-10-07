/**
 * ミドルウェアパフォーマンス最適化
 * 複数のDB問い合わせを並列化してレスポンスタイム改善
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase';
import { SessionManager } from '@/lib/session-manager';
import { SecurityMonitor } from '@/lib/security-monitor';
import { logger } from '@/lib/logger';

export interface OptimizedAuthData {
  user: unknown;
  profile: unknown;
  customSessionValidation?: unknown;
  securityThreats?: Array<{ severity?: string }>;
}

/**
 * ミドルウェア用最適化された認証・セキュリティチェック
 * 複数のDB問い合わせを並列実行してパフォーマンス向上
 */
export class MiddlewareOptimizer {
  private sessionManager: SessionManager;
  private securityMonitor: SecurityMonitor;

  constructor() {
    this.sessionManager = new SessionManager();
    this.securityMonitor = new SecurityMonitor();
  }

  /**
   * 並列化された認証・セキュリティチェック
   */
  async performOptimizedAuthCheck(
    request: NextRequest,
    isAdminRoute: boolean = false
  ): Promise<OptimizedAuthData | null> {
    const supabase = await createClient();
    const ipAddress = this.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    const customSessionToken = request.cookies.get('session-token')?.value;

    try {
      // 並列実行するPromiseを準備
      const promises: Promise<any>[] = [
        // 1. Supabaseユーザー取得
        supabase.auth.getUser(),
      ];

      // 2. カスタムセッション検証（トークンがある場合）
      if (customSessionToken) {
        promises.push(this.sessionManager.validateSession(customSessionToken));
      } else {
        promises.push(Promise.resolve(null));
      }

      // 基本チェックを並列実行
      const [userResult, customSessionValidation] = await Promise.all(promises);

      const {
        data: { user },
        error: userError,
      } = userResult;

      // 未認証の場合は早期リターン
      if (userError || !user) {
        return null;
      }

      // ユーザー認証成功後の追加チェックを並列実行
      const additionalPromises: Promise<any>[] = [
        // 3. ユーザープロファイル取得
        supabase
          .from('profiles')
          .select('role, clinic_id, is_active, full_name')
          .eq('user_id', user.id)
          .single(),
      ];

      // 4. セキュリティ分析（カスタムセッションが有効な場合）
      if (customSessionValidation?.isValid && customSessionValidation.session) {
        additionalPromises.push(
          this.securityMonitor.analyzeSessionActivity(
            customSessionValidation.session,
            { ipAddress, userAgent }
          )
        );
      } else {
        additionalPromises.push(Promise.resolve([]));
      }

      // 追加チェックを並列実行
      const [profileResult, securityThreats] =
        await Promise.all(additionalPromises);

      return {
        user,
        profile: profileResult.data,
        customSessionValidation,
        securityThreats: securityThreats || [],
      };
    } catch (error) {
      logger.error('最適化認証チェックエラー:', error);
      throw error;
    }
  }

  /**
   * セキュリティ脅威の批判的評価
   * 高リスクの脅威のみをフィルタリング
   */
  evaluateCriticalThreats(
    threats: Array<{ severity?: string }>
  ): Array<{ severity?: string }> {
    return threats.filter(
      threat => threat.severity === 'high' || threat.severity === 'critical'
    );
  }

  /**
   * セッション情報の非同期更新
   * レスポンスタイムに影響しないように背景で実行
   */
  async updateSessionInBackground(
    sessionToken: string,
    ipAddress: string,
    userId: string,
    clinicId?: string
  ): Promise<void> {
    // 非同期でセッション情報を更新（レスポンスをブロックしない）
    setImmediate(async () => {
      try {
        await this.sessionManager.refreshSession(sessionToken, ipAddress);

        // セキュリティイベントの記録も非同期
        await this.securityMonitor.logSecurityEvent({
          eventType: 'session_activity',
          userId,
          clinicId: clinicId || 'unknown',
          ipAddress,
          userAgent: 'middleware',
          details: {
            action: 'session_refresh',
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error('Background session update failed:', error);
      }
    });
  }

  /**
   * 管理者権限チェックの最適化
   */
  validateAdminAccess(
    profile: any,
    requestPath: string
  ): {
    isAuthorized: boolean;
    reason?: string;
  } {
    if (!profile || !profile.is_active) {
      return {
        isAuthorized: false,
        reason: 'inactive_profile',
      };
    }

    const adminRoles = ['admin', 'clinic_admin', 'manager'];
    if (!adminRoles.includes(profile.role)) {
      return {
        isAuthorized: false,
        reason: 'insufficient_privileges',
      };
    }

    return { isAuthorized: true };
  }

  /**
   * キャッシュ対応のクライアントIP取得
   */
  private getClientIP(request: NextRequest): string {
    // x-forwarded-for ヘッダーを優先
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // x-real-ip ヘッダーをチェック
    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
      return realIp;
    }

    // CF-Connecting-IP（Cloudflare）をチェック
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) {
      return cfIp;
    }

    return request.ip || 'unknown';
  }
}

/**
 * セッションキャッシュ管理
 * 短期間のキャッシュでDB問い合わせを削減
 */
export class SessionCache {
  private static cache = new Map<
    string,
    {
      data: any;
      expires: number;
    }
  >();

  static set(key: string, data: unknown, ttlSeconds: number = 60): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  static get(key: string): unknown | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  static clear(): void {
    this.cache.clear();
  }

  /**
   * 定期的なキャッシュクリーンアップ
   */
  static startPeriodicCleanup(): void {
    setInterval(
      () => {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
          if (now > value.expires) {
            this.cache.delete(key);
          }
        }
      },
      5 * 60 * 1000
    ); // 5分ごと
  }
}

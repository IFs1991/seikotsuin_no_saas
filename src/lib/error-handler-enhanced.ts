/**
 * 強化されたエラーハンドリングシステム
 * セキュリティ・セッション管理用の包括的エラー処理
 */

import { SecurityMonitor } from '@/lib/security-monitor';
import { logger } from '@/lib/logger';

export interface ErrorContext {
  userId?: string;
  clinicId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  sessionId?: string;
  timestamp: Date;
}

export interface SecurityError extends Error {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: ErrorContext;
  shouldLogout?: boolean;
  shouldAlert?: boolean;
}

/**
 * エラー分類とセキュリティリスク評価
 */
export class SecurityErrorHandler {
  private securityMonitor: SecurityMonitor;

  constructor() {
    this.securityMonitor = new SecurityMonitor();
  }

  /**
   * セキュリティ関連エラーの包括的処理
   */
  async handleSecurityError(
    error: Error | SecurityError,
    context: ErrorContext
  ): Promise<{
    shouldTerminate: boolean;
    userMessage: string;
    logLevel: 'info' | 'warn' | 'error' | 'critical';
  }> {
    const errorData = await this.analyzeError(error, context);

    // セキュリティイベントとして記録
    await this.logSecurityEvent(error, context, errorData);

    return this.determineResponseAction(errorData);
  }

  /**
   * エラー分析とリスク評価
   */
  private async analyzeError(
    error: Error | SecurityError,
    context: ErrorContext
  ): Promise<{
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    shouldTerminate: boolean;
    isSecurityThreat: boolean;
  }> {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack || '';

    // セキュリティ関連エラーパターンの検出
    const securityPatterns = [
      {
        pattern: /invalid.*(token|session)/i,
        category: 'authentication',
        severity: 'medium' as const,
      },
      {
        pattern: /unauthorized|forbidden/i,
        category: 'authorization',
        severity: 'high' as const,
      },
      {
        pattern: /sql.*injection/i,
        category: 'injection',
        severity: 'critical' as const,
      },
      {
        pattern: /xss|script.*injection/i,
        category: 'xss',
        severity: 'high' as const,
      },
      {
        pattern: /csrf|cross.*site/i,
        category: 'csrf',
        severity: 'high' as const,
      },
      {
        pattern: /brute.*force|too.*many.*attempts/i,
        category: 'brute_force',
        severity: 'high' as const,
      },
      {
        pattern: /session.*hijack/i,
        category: 'session_hijacking',
        severity: 'critical' as const,
      },
      {
        pattern: /rate.*limit/i,
        category: 'rate_limiting',
        severity: 'medium' as const,
      },
    ];

    const detectedPattern = securityPatterns.find(p =>
      p.pattern.test(errorMessage)
    );

    // デフォルト値
    let category = 'general';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let isSecurityThreat = false;

    if (detectedPattern) {
      category = detectedPattern.category;
      severity = detectedPattern.severity;
      isSecurityThreat = true;
    }

    // SecurityErrorインターface対応
    if ('code' in error && 'severity' in error) {
      severity = error.severity;
      isSecurityThreat = true;
    }

    // リスクスコア計算
    const riskScore = this.calculateRiskScore(
      severity,
      context,
      isSecurityThreat
    );

    return {
      category,
      severity,
      riskScore,
      shouldTerminate: severity === 'critical' || riskScore > 80,
      isSecurityThreat,
    };
  }

  /**
   * リスクスコア計算（0-100）
   */
  private calculateRiskScore(
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: ErrorContext,
    isSecurityThreat: boolean
  ): number {
    let score = 0;

    // 基本重要度スコア
    const severityScores = {
      low: 20,
      medium: 40,
      high: 70,
      critical: 90,
    };
    score += severityScores[severity];

    // セキュリティ脅威加算
    if (isSecurityThreat) {
      score += 20;
    }

    // 管理者ルートでのエラー加算
    if (context.requestPath?.startsWith('/admin')) {
      score += 15;
    }

    // 時間帯による調整（営業時間外のアクティビティ）
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * セキュリティイベントログ記録
   */
  private async logSecurityEvent(
    error: Error | SecurityError,
    context: ErrorContext,
    errorData: any
  ): Promise<void> {
    try {
      await this.securityMonitor.logSecurityEvent({
        eventType: 'system_error',
        userId: context.userId || 'anonymous',
        clinicId: context.clinicId || 'unknown',
        ipAddress: context.ipAddress || 'unknown',
        userAgent: context.userAgent || 'unknown',
        details: {
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 1000), // スタックトレースを1000文字に制限
          errorCategory: errorData.category,
          severity: errorData.severity,
          riskScore: errorData.riskScore,
          requestPath: context.requestPath,
          sessionId: context.sessionId,
          timestamp: context.timestamp.toISOString(),
          isSecurityThreat: errorData.isSecurityThreat,
        },
      });
    } catch (logError) {
      logger.error('セキュリティイベントログ記録失敗:', logError);
    }
  }

  /**
   * レスポンスアクション決定
   */
  private determineResponseAction(errorData: any): {
    shouldTerminate: boolean;
    userMessage: string;
    logLevel: 'info' | 'warn' | 'error' | 'critical';
  } {
    const { severity, category, shouldTerminate } = errorData;

    // カテゴリ別メッセージ
    const categoryMessages = {
      authentication:
        'セッションの認証に問題が発生しました。再ログインしてください。',
      authorization: '権限が不足しているか、アクセス権限に問題があります。',
      injection:
        'セキュリティ上の問題が検出されました。管理者に連絡してください。',
      xss: 'スクリプトの実行が検出されました。セキュリティのためセッションを終了します。',
      csrf: 'リクエストの検証に失敗しました。ページを再読み込みしてください。',
      brute_force:
        '不正なアクセス試行が検出されました。一時的にアクセスを制限します。',
      session_hijacking:
        'セッションに異常が検出されました。セキュリティのため強制ログアウトします。',
      rate_limiting:
        'アクセス頻度が高すぎます。しばらく待ってから再試行してください。',
      general:
        'システムエラーが発生しました。しばらく待ってから再試行してください。',
    };

    const userMessage =
      categoryMessages[category as keyof typeof categoryMessages] ||
      categoryMessages.general;

    // ログレベル決定
    let logLevel: 'info' | 'warn' | 'error' | 'critical' = 'error';
    if (severity === 'critical') {
      logLevel = 'critical';
    } else if (severity === 'high') {
      logLevel = 'error';
    } else if (severity === 'medium') {
      logLevel = 'warn';
    } else {
      logLevel = 'info';
    }

    return {
      shouldTerminate,
      userMessage,
      logLevel,
    };
  }

  /**
   * 開発環境用の詳細エラー表示
   */
  getDevelopmentErrorDetails(
    error: Error,
    context: ErrorContext
  ): {
    error: string;
    stack: string;
    context: ErrorContext;
    suggestions: string[];
  } {
    const suggestions = this.generateDebuggingSuggestions(error);

    return {
      error: error.message,
      stack: error.stack || 'No stack trace available',
      context,
      suggestions,
    };
  }

  /**
   * デバッグ用の改善提案生成
   */
  private generateDebuggingSuggestions(error: Error): string[] {
    const suggestions: string[] = [];
    const message = error.message.toLowerCase();

    if (message.includes('database') || message.includes('supabase')) {
      suggestions.push('データベース接続を確認してください');
      suggestions.push(
        'Supabase環境変数が正しく設定されているか確認してください'
      );
    }

    if (message.includes('session') || message.includes('token')) {
      suggestions.push('セッション管理システムのログを確認してください');
      suggestions.push(
        'カスタムセッションテーブルが正しく作成されているか確認してください'
      );
    }

    if (message.includes('permission') || message.includes('unauthorized')) {
      suggestions.push('RLS（Row Level Security）設定を確認してください');
      suggestions.push('ユーザーのロールと権限を確認してください');
    }

    if (suggestions.length === 0) {
      suggestions.push('ログファイルで詳細なエラー情報を確認してください');
      suggestions.push(
        '開発ツールのネットワークタブでAPIレスポンスを確認してください'
      );
    }

    return suggestions;
  }
}

/**
 * グローバルエラーハンドラー
 * アプリケーション全体のエラーを一元管理
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private securityErrorHandler: SecurityErrorHandler;

  private constructor() {
    this.securityErrorHandler = new SecurityErrorHandler();
  }

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  /**
   * Next.jsアプリケーション用のエラーハンドラー設定
   */
  setupGlobalHandlers(): void {
    // 未処理のPromise拒否をキャッチ
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);

      if (reason instanceof Error) {
        this.handleError(reason, {
          timestamp: new Date(),
          requestPath: 'unhandled_rejection',
        });
      }
    });

    // 未処理の例外をキャッチ
    process.on('uncaughtException', error => {
      console.error('Uncaught Exception:', error);

      this.handleError(error, {
        timestamp: new Date(),
        requestPath: 'uncaught_exception',
      });
    });
  }

  /**
   * エラー処理のエントリーポイント
   */
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    try {
      const result = await this.securityErrorHandler.handleSecurityError(
        error,
        context
      );

      // ログレベルに応じたログ出力
      switch (result.logLevel) {
        case 'critical':
          console.error('🚨 CRITICAL ERROR:', error.message, context);
          break;
        case 'error':
          console.error('❌ ERROR:', error.message, context);
          break;
        case 'warn':
          console.warn('⚠️ WARNING:', error.message, context);
          break;
        case 'info':
          console.info('ℹ️ INFO:', error.message, context);
          break;
      }

      // 重要なエラーの場合はアラート通知（将来的に）
      if (result.logLevel === 'critical') {
        // TODO: Slack, Email, SMS等でのアラート通知
        console.log('📧 Critical error alert would be sent here');
      }
    } catch (handlingError) {
      console.error('Error in error handler:', handlingError);
    }
  }
}

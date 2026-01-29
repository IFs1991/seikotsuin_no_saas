/**
 * セキュリティアラート通知システム
 * Phase 3B Refactoring: 高重要度CSP違反の通知機能
 */

import { createClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface SecurityAlert {
  type: 'csp_violation' | 'rate_limit' | 'authentication' | 'data_breach';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  details?: Record<string, any>;
  clientIP?: string;
  userAgent?: string;
  timestamp: string;
  source: string;
}

export interface CSPViolationAlert extends SecurityAlert {
  type: 'csp_violation';
  violatedDirective: string;
  blockedUri: string;
  documentUri: string;
  threatScore: number;
}

export interface NotificationResult {
  success: boolean;
  channels: string[];
  errors?: string[];
}

/**
 * セキュリティアラート通知システム
 */
export class SecurityNotificationManager {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * CSP違反の高重要度通知
   */
  async notifyCSPViolation(violation: {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    violated_directive: string;
    blocked_uri: string;
    document_uri: string;
    threat_score: number;
    client_ip: string;
    user_agent?: string;
    created_at: string;
  }): Promise<NotificationResult> {
    const alert: CSPViolationAlert = {
      type: 'csp_violation',
      severity: violation.severity,
      title: `CSP違反検出: ${violation.violated_directive}`,
      message: this.generateCSPAlertMessage(violation),
      details: {
        violationId: violation.id,
        violatedDirective: violation.violated_directive,
        blockedUri: violation.blocked_uri,
        documentUri: violation.document_uri,
        threatScore: violation.threat_score,
      },
      violatedDirective: violation.violated_directive,
      blockedUri: violation.blocked_uri,
      documentUri: violation.document_uri,
      threatScore: violation.threat_score,
      clientIP: violation.client_ip,
      userAgent: violation.user_agent,
      timestamp: violation.created_at,
      source: 'csp-monitor',
    };

    return this.sendAlert(alert);
  }

  /**
   * レート制限超過の通知
   */
  async notifyRateLimitExceeded(data: {
    clientIP: string;
    userAgent?: string;
    requestCount: number;
    timeWindow: string;
    endpoint: string;
  }): Promise<NotificationResult> {
    const alert: SecurityAlert = {
      type: 'rate_limit',
      severity: 'medium',
      title: 'レート制限超過検出',
      message: `IP ${data.clientIP} から ${data.endpoint} に ${data.timeWindow} で ${data.requestCount} リクエスト`,
      details: {
        clientIP: data.clientIP,
        userAgent: data.userAgent,
        requestCount: data.requestCount,
        timeWindow: data.timeWindow,
        endpoint: data.endpoint,
      },
      clientIP: data.clientIP,
      userAgent: data.userAgent,
      timestamp: new Date().toISOString(),
      source: 'rate-limiter',
    };

    return this.sendAlert(alert);
  }

  /**
   * 通知の送信処理
   */
  private async sendAlert(alert: SecurityAlert): Promise<NotificationResult> {
    const channels: string[] = [];
    const errors: string[] = [];

    try {
      // 重要度に応じた通知チャンネルの決定
      const notificationChannels = this.getNotificationChannels(alert.severity);

      // Console logging（即時確認用）
      if (notificationChannels.includes('console')) {
        this.logToConsole(alert);
        channels.push('console');
      }

      // データベース記録（監査ログ用）
      if (notificationChannels.includes('database')) {
        await this.saveToDatabase(alert);
        channels.push('database');
      }

      // Supabase Edge Functions経由での通知（メール・Slack等）
      if (notificationChannels.includes('external')) {
        try {
          await this.sendExternalNotification(alert);
          channels.push('external');
        } catch (error) {
          errors.push(`External notification failed: ${error}`);
        }
      }

      // リアルタイムダッシュボード更新
      if (notificationChannels.includes('realtime')) {
        try {
          await this.sendRealtimeUpdate(alert);
          channels.push('realtime');
        } catch (error) {
          errors.push(`Realtime update failed: ${error}`);
        }
      }

      return {
        success: channels.length > 0,
        channels,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error('Security notification failed:', error);
      return {
        success: false,
        channels: [],
        errors: [`Notification system failure: ${error}`],
      };
    }
  }

  /**
   * 重要度別通知チャンネルの決定
   */
  private getNotificationChannels(severity: string): string[] {
    const baseChannels = ['console', 'database'];

    switch (severity) {
      case 'critical':
        return [...baseChannels, 'external', 'realtime'];
      case 'high':
        return [...baseChannels, 'external', 'realtime'];
      case 'medium':
        return [...baseChannels, 'realtime'];
      case 'low':
        return baseChannels;
      default:
        return baseChannels;
    }
  }

  /**
   * コンソールログ出力
   */
  private logToConsole(alert: SecurityAlert): void {
    const logLevel =
      alert.severity === 'critical' || alert.severity === 'high'
        ? 'error'
        : alert.severity === 'medium'
          ? 'warn'
          : 'info';

    const logMessage = {
      separatorTop: '='.repeat(60),
      title: `${alert.severity.toUpperCase()}: ${alert.title}`,
      message: alert.message,
      details: alert.details,
      timestamp: alert.timestamp,
      source: alert.source,
      separatorBottom: '='.repeat(60),
    };

    // Use type assertion for dynamic log level access
    (logger as Record<string, (msg: string, data: unknown) => void>)[logLevel](
      'Security Alert:',
      logMessage
    );
  }

  /**
   * データベース記録
   */
  private async saveToDatabase(alert: SecurityAlert): Promise<void> {
    await this.supabase.from('security_alerts').insert({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      details: alert.details,
      client_ip: alert.clientIP,
      user_agent: alert.userAgent,
      source: alert.source,
      created_at: alert.timestamp,
    });
  }

  /**
   * 外部通知（Supabase Edge Functions経由）
   */
  private async sendExternalNotification(alert: SecurityAlert): Promise<void> {
    // Supabase Edge Functions呼び出し
    const { data, error } = await this.supabase.functions.invoke(
      'security-alert-notify',
      {
        body: {
          alert,
          channels: this.getExternalChannels(alert.severity),
        },
      }
    );

    if (error) {
      throw new Error(`Edge function error: ${error.message}`);
    }
  }

  /**
   * リアルタイムダッシュボード更新
   */
  private async sendRealtimeUpdate(alert: SecurityAlert): Promise<void> {
    // Supabase Realtimeで管理者ダッシュボードに通知
    const channel = this.supabase.channel('security-alerts');

    await channel.send({
      type: 'broadcast',
      event: 'new-alert',
      payload: alert,
    });
  }

  /**
   * 重要度別外部通知チャンネル
   */
  private getExternalChannels(severity: string): string[] {
    switch (severity) {
      case 'critical':
        return ['email', 'slack', 'sms']; // 全チャンネル
      case 'high':
        return ['email', 'slack'];
      case 'medium':
        return ['slack'];
      default:
        return [];
    }
  }

  /**
   * CSP違反アラートメッセージ生成
   */
  private generateCSPAlertMessage(violation: {
    severity: string;
    violated_directive: string;
    blocked_uri: string;
    document_uri: string;
    threat_score: number;
    client_ip: string;
  }): string {
    const messages = {
      critical:
        '🚨 極めて危険なCSP違反が検出されました。即座の対応が必要です。',
      high: '⚠️ 高リスクなCSP違反が発生しました。調査・対応をお願いします。',
      medium: '📋 CSP違反が記録されました。定期確認時にご確認ください。',
      low: 'ℹ️ 軽微なCSP違反が記録されました。',
    };

    const baseMessage =
      messages[violation.severity as keyof typeof messages] || messages.low;

    return `${baseMessage}

【違反詳細】
• ディレクティブ: ${violation.violated_directive}
• ブロックURI: ${violation.blocked_uri}
• 発生ページ: ${violation.document_uri}
• 脅威スコア: ${violation.threat_score}/100
• 発生元IP: ${violation.client_ip}

【推奨対応】
${this.getRecommendedAction(violation)}`;
  }

  /**
   * 推奨対応の生成
   */
  private getRecommendedAction(violation: {
    severity: string;
    violated_directive: string;
    blocked_uri: string;
    threat_score: number;
  }): string {
    if (violation.severity === 'critical' || violation.threat_score >= 80) {
      return `
1. 即座にCSPダッシュボードで詳細を確認
2. 攻撃元IPの調査・必要に応じてブロック
3. 同様のパターンの違反が継続していないか監視
4. セキュリティインシデント対応手順の実行を検討`;
    }

    if (violation.severity === 'high' || violation.threat_score >= 50) {
      return `
1. CSPダッシュボードで違反パターンを確認
2. 正当なリクエストか攻撃かの判別
3. 必要に応じてCSPポリシーの調整を検討`;
    }

    return `
1. 定期メンテナンス時にCSPダッシュボードで確認
2. 違反パターンが継続する場合は調査を検討`;
  }

  /**
   * 通知頻度制限チェック（スパム防止）
   */
  async shouldNotify(
    alertType: string,
    clientIP: string,
    timeWindowMinutes: number = 5
  ): Promise<boolean> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - timeWindowMinutes);

    const { count } = await this.supabase
      .from('security_alerts')
      .select('*', { count: 'exact' })
      .eq('type', alertType)
      .eq('client_ip', clientIP)
      .gte('created_at', windowStart.toISOString());

    // 5分間で同じIPから同じタイプのアラートが3回未満の場合のみ通知
    return (count || 0) < 3;
  }
}

// シングルトンインスタンス
export const securityNotificationManager = new SecurityNotificationManager();

/**
 * セキュリティ監視システム
 * Phase 3A: 異常検知・セキュリティイベント監視機能
 */

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  SessionManager,
  type UserSession,
  type DeviceInfo,
} from './session-manager';

// ================================================================
// 型定義
// ================================================================

export interface SecurityThreat {
  threatType:
    | 'suspicious_login'
    | 'multiple_devices'
    | 'location_anomaly'
    | 'session_hijack'
    | 'brute_force';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: unknown;
  userId?: string;
  clinicId?: string;
  ipAddress?: string;
  timestamp: Date;
}

export interface LoginAttempt {
  userId?: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  timestamp: Date;
  clinicId?: string;
}

export interface SecurityAlert {
  id: string;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  userId?: string;
  clinicId?: string;
  isResolved: boolean;
  createdAt: Date;
  resolvedAt?: Date;
  actionsTaken: string[];
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  confidence: number; // 0-1
  reasons: string[];
  recommendedActions: string[];
}

// ================================================================
// セキュリティ監視クラス
// ================================================================

export class SecurityMonitor {
  private supabase;
  private sessionManager: SessionManager;

  constructor() {
    this.supabase = createClient();
    this.sessionManager = new SessionManager();
  }

  /**
   * ログイン試行の分析
   */
  async analyzeLoginAttempt(attempt: LoginAttempt): Promise<SecurityThreat[]> {
    const threats: SecurityThreat[] = [];

    // 1. ブルートフォース攻撃の検出
    const bruteForceCheck = await this.detectBruteForce(attempt);
    if (bruteForceCheck.isAnomalous) {
      threats.push({
        threatType: 'brute_force',
        severity: bruteForceCheck.confidence > 0.8 ? 'high' : 'medium',
        description: `同一IPアドレスからの連続ログイン失敗: ${attempt.ipAddress}`,
        evidence: {
          ipAddress: attempt.ipAddress,
          confidence: bruteForceCheck.confidence,
          reasons: bruteForceCheck.reasons,
        },
        userId: attempt.userId,
        clinicId: attempt.clinicId,
        ipAddress: attempt.ipAddress,
        timestamp: attempt.timestamp,
      });
    }

    // 2. 異常な位置からのアクセス検出
    if (attempt.userId) {
      const locationCheck = await this.detectLocationAnomaly(
        attempt.userId,
        attempt.ipAddress
      );
      if (locationCheck.isAnomalous) {
        threats.push({
          threatType: 'location_anomaly',
          severity: locationCheck.confidence > 0.7 ? 'medium' : 'low',
          description: `通常とは異なる地域からのアクセス: ${attempt.ipAddress}`,
          evidence: {
            ipAddress: attempt.ipAddress,
            confidence: locationCheck.confidence,
            reasons: locationCheck.reasons,
          },
          userId: attempt.userId,
          clinicId: attempt.clinicId,
          ipAddress: attempt.ipAddress,
          timestamp: attempt.timestamp,
        });
      }
    }

    // 3. 短時間での複数デバイスログイン検出
    if (attempt.success && attempt.userId) {
      const multiDeviceCheck = await this.detectMultipleDeviceLogins(
        attempt.userId,
        attempt.userAgent
      );
      if (multiDeviceCheck.isAnomalous) {
        threats.push({
          threatType: 'multiple_devices',
          severity: 'medium',
          description: '短時間内での複数デバイスからのログイン',
          evidence: {
            userId: attempt.userId,
            userAgent: attempt.userAgent,
            confidence: multiDeviceCheck.confidence,
            reasons: multiDeviceCheck.reasons,
          },
          userId: attempt.userId,
          clinicId: attempt.clinicId,
          ipAddress: attempt.ipAddress,
          timestamp: attempt.timestamp,
        });
      }
    }

    return threats;
  }

  /**
   * セッション異常検知
   */
  async analyzeSessionActivity(
    session: UserSession,
    currentActivity: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<SecurityThreat[]> {
    const threats: SecurityThreat[] = [];

    // セッション乗っ取りの検出
    const hijackCheck = await this.detectSessionHijack(
      session,
      currentActivity
    );
    if (hijackCheck.isAnomalous) {
      threats.push({
        threatType: 'session_hijack',
        severity: hijackCheck.confidence > 0.8 ? 'high' : 'medium',
        description: 'セッション乗っ取りの疑いがあります',
        evidence: {
          sessionId: session.id,
          originalIp: session.ip_address,
          currentIp: currentActivity.ipAddress,
          confidence: hijackCheck.confidence,
          reasons: hijackCheck.reasons,
        },
        userId: session.user_id,
        clinicId: session.clinic_id,
        ipAddress: currentActivity.ipAddress,
        timestamp: new Date(),
      });
    }

    return threats;
  }

  /**
   * セキュリティ脅威への対応処理
   */
  async handleSecurityThreat(threat: SecurityThreat): Promise<void> {
    try {
      // セキュリティイベントをログに記録
      await this.logSecurityEvent({
        user_id: threat.userId,
        clinic_id: threat.clinicId,
        event_type: `threat_detected_${threat.threatType}`,
        event_category: 'security_violation',
        severity_level:
          threat.severity === 'critical'
            ? 'critical'
            : threat.severity === 'high'
              ? 'error'
              : 'warning',
        event_description: threat.description,
        event_data: {
          threat_type: threat.threatType,
          evidence: threat.evidence,
        },
        ip_address: threat.ipAddress,
        source_component: 'security_monitor',
      });

      // 脅威レベルに応じた自動対応
      await this.executeAutomaticResponse(threat);

      // クリティカルな脅威の場合は管理者に通知
      if (threat.severity === 'critical' || threat.severity === 'high') {
        await this.notifyAdministrators(threat);
      }
    } catch (error) {
      logger.error('セキュリティ脅威処理エラー:', error);
    }
  }

  /**
   * セキュリティアラート取得
   */
  async getSecurityAlerts(
    clinicId: string,
    limit: number = 50
  ): Promise<SecurityAlert[]> {
    const { data: events, error } = await this.supabase
      .from('security_events')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('event_category', 'security_violation')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !events) {
      logger.error('セキュリティアラート取得エラー:', error);
      return [];
    }

    return events.map(event => ({
      id: event.id,
      threatType: event.event_type,
      severity: this.mapSeverityLevel(event.severity_level),
      title: this.generateAlertTitle(event.event_type),
      description: event.event_description,
      userId: event.user_id,
      clinicId: event.clinic_id,
      isResolved: false, // TODO: 解決状態の管理を追加
      createdAt: new Date(event.created_at),
      actionsTaken: [], // TODO: 実行されたアクションの記録を追加
    }));
  }

  /**
   * セキュリティダッシュボード用統計データ取得
   */
  async getSecurityStatistics(
    clinicId: string,
    days: number = 30
  ): Promise<{
    totalEvents: number;
    criticalThreats: number;
    blockedIps: number;
    suspiciousLogins: number;
    eventsByType: Record<string, number>;
    eventsByDay: Array<{ date: string; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: events, error } = await this.supabase
      .from('security_events')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('created_at', startDate.toISOString());

    if (error || !events) {
      logger.error('セキュリティ統計取得エラー:', error);
      return {
        totalEvents: 0,
        criticalThreats: 0,
        blockedIps: 0,
        suspiciousLogins: 0,
        eventsByType: {},
        eventsByDay: [],
      };
    }

    // 統計データの計算
    const eventsByType: Record<string, number> = {};
    const eventsByDay: Record<string, number> = {};
    let criticalThreats = 0;
    let suspiciousLogins = 0;

    events.forEach(event => {
      // タイプ別集計
      eventsByType[event.event_type] =
        (eventsByType[event.event_type] || 0) + 1;

      // 日別集計
      const date = new Date(event.created_at).toISOString().split('T')[0];
      eventsByDay[date] = (eventsByDay[date] || 0) + 1;

      // 重要度別集計
      if (
        event.severity_level === 'critical' ||
        event.severity_level === 'error'
      ) {
        criticalThreats++;
      }

      if (
        event.event_type.includes('suspicious_login') ||
        event.event_type.includes('brute_force')
      ) {
        suspiciousLogins++;
      }
    });

    // 日別データを配列に変換
    const eventsByDayArray = Object.entries(eventsByDay).map(
      ([date, count]) => ({ date, count })
    );

    return {
      totalEvents: events.length,
      criticalThreats,
      blockedIps: 0, // TODO: IPブロック機能実装時に追加
      suspiciousLogins,
      eventsByType,
      eventsByDay: eventsByDayArray,
    };
  }

  // ================================================================
  // プライベートメソッド - 異常検知
  // ================================================================

  /**
   * ブルートフォース攻撃検出
   */
  private async detectBruteForce(
    attempt: LoginAttempt
  ): Promise<AnomalyDetectionResult> {
    const timeWindow = 15 * 60 * 1000; // 15分
    const maxAttempts = 5;

    const { count, error } = await this.supabase
      .from('security_events')
      .select('*', { count: 'exact' })
      .eq('ip_address', attempt.ipAddress)
      .in('event_type', ['login_failed', 'authentication_failed'])
      .gte(
        'created_at',
        new Date(attempt.timestamp.getTime() - timeWindow).toISOString()
      );

    if (error) {
      return {
        isAnomalous: false,
        confidence: 0,
        reasons: [],
        recommendedActions: [],
      };
    }

    const attemptCount = (count || 0) + (!attempt.success ? 1 : 0);
    const confidence = Math.min(attemptCount / maxAttempts, 1);

    return {
      isAnomalous: attemptCount >= maxAttempts,
      confidence,
      reasons: [`${attemptCount}回の連続ログイン失敗 (閾値: ${maxAttempts})`],
      recommendedActions: [
        'IPアドレスの一時ブロック',
        '管理者への通知',
        'ユーザーアカウントの確認',
      ],
    };
  }

  /**
   * 位置異常検出
   */
  private async detectLocationAnomaly(
    userId: string,
    ipAddress: string
  ): Promise<AnomalyDetectionResult> {
    // 過去30日間の正常なログイン場所を取得
    const { data: recentSessions, error } = await this.supabase
      .from('user_sessions')
      .select('ip_address, geolocation')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte(
        'created_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );

    if (error || !recentSessions || recentSessions.length === 0) {
      return {
        isAnomalous: false,
        confidence: 0,
        reasons: [],
        recommendedActions: [],
      };
    }

    // 簡易的な位置判定（実際の実装では地理的距離を計算）
    const knownIps = new Set(recentSessions.map(s => s.ip_address));
    const isKnownLocation = knownIps.has(ipAddress);

    if (!isKnownLocation && recentSessions.length >= 3) {
      return {
        isAnomalous: true,
        confidence: 0.6,
        reasons: ['過去30日間に使用されていないIPアドレス'],
        recommendedActions: ['ユーザーへの確認', 'セッションの追加監視'],
      };
    }

    return {
      isAnomalous: false,
      confidence: 0,
      reasons: [],
      recommendedActions: [],
    };
  }

  /**
   * 複数デバイスログイン検出
   */
  private async detectMultipleDeviceLogins(
    userId: string,
    userAgent: string
  ): Promise<AnomalyDetectionResult> {
    const timeWindow = 30 * 60 * 1000; // 30分
    const startTime = new Date(Date.now() - timeWindow);

    const { data: recentSessions, error } = await this.supabase
      .from('user_sessions')
      .select('user_agent, device_info, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('created_at', startTime.toISOString());

    if (error || !recentSessions) {
      return {
        isAnomalous: false,
        confidence: 0,
        reasons: [],
        recommendedActions: [],
      };
    }

    // 異なるデバイスタイプの数を計算
    const deviceTypes = new Set(
      recentSessions.map(s => s.device_info?.device || 'unknown')
    );

    if (deviceTypes.size >= 3) {
      return {
        isAnomalous: true,
        confidence: 0.7,
        reasons: [`30分以内に${deviceTypes.size}種類のデバイスからログイン`],
        recommendedActions: ['ユーザーへの確認通知', 'セッションレビュー'],
      };
    }

    return {
      isAnomalous: false,
      confidence: 0,
      reasons: [],
      recommendedActions: [],
    };
  }

  /**
   * セッション乗っ取り検出
   */
  private async detectSessionHijack(
    session: UserSession,
    currentActivity: { ipAddress?: string; userAgent?: string }
  ): Promise<AnomalyDetectionResult> {
    const reasons: string[] = [];
    let confidence = 0;

    // IPアドレス変更の検出（単独でも検知に到達する重み）
    if (
      session.ip_address &&
      currentActivity.ipAddress &&
      session.ip_address !== currentActivity.ipAddress
    ) {
      reasons.push('IPアドレスの変更');
      confidence += 0.6;
    }

    // User-Agent変更の検出
    if (currentActivity.userAgent) {
      // 明らかに怪しいUAの検出
      if (
        /(automated|headless|bot|crawler|spider)/i.test(
          currentActivity.userAgent
        )
      ) {
        reasons.push('疑わしいUser-Agent（自動化/ボットの可能性）');
        confidence += 0.6;
      }
      if (session.user_agent) {
        if (session.user_agent !== currentActivity.userAgent) {
          reasons.push('User-Agentの変更');
          confidence += 0.3;
        }
      } else if (session.device_info?.browser) {
        // UA未保存の場合はデバイス情報と大まかに比較
        const uaLower = currentActivity.userAgent.toLowerCase();
        const browserLower = String(
          session.device_info.browser || ''
        ).toLowerCase();
        if (browserLower && !uaLower.includes(browserLower)) {
          reasons.push('User-Agentの不一致（保存ブラウザと異なる）');
          confidence += 0.6;
        }
      }
    }

    // セッション作成から大幅に時間が経過している
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    const maxAge = (session.max_session_hours || 8) * 60 * 60 * 1000;
    if (sessionAge > maxAge * 0.9) {
      reasons.push('セッション期限が近い');
      confidence += 0.2;
    }

    return {
      isAnomalous: confidence > 0.5,
      confidence,
      reasons,
      recommendedActions:
        confidence > 0.7
          ? ['セッションの強制終了', 'ユーザーへの緊急通知', '再認証の要求']
          : ['セッションの監視強化', 'ログの詳細記録'],
    };
  }

  // ================================================================
  // プライベートメソッド - 対応処理
  // ================================================================

  /**
   * 自動対応の実行
   */
  private async executeAutomaticResponse(
    threat: SecurityThreat
  ): Promise<void> {
    switch (threat.threatType) {
      case 'brute_force':
        if (threat.severity === 'high' || threat.severity === 'critical') {
          // TODO: IPアドレスの一時ブロック
          console.log(`ブルートフォース攻撃IPをブロック: ${threat.ipAddress}`);
        }
        break;

      case 'session_hijack':
        if (threat.userId && threat.severity === 'high') {
          // 疑わしいセッションを強制終了
          const sessions = await this.sessionManager.getUserSessions(
            threat.userId,
            threat.clinicId!
          );
          for (const session of sessions) {
            if (session.ip_address === threat.ipAddress) {
              await this.sessionManager.revokeSession(
                session.id,
                'security_violation'
              );
            }
          }
        }
        break;

      case 'multiple_devices':
        // 追加監視の設定
        console.log(`複数デバイスログインの監視強化: ${threat.userId}`);
        break;
    }
  }

  /**
   * 管理者への通知
   */
  private async notifyAdministrators(threat: SecurityThreat): Promise<void> {
    // TODO: 実際の通知システム実装
    console.log('管理者通知:', {
      type: threat.threatType,
      severity: threat.severity,
      description: threat.description,
    });
  }

  /**
   * セキュリティイベントログ記録
   */
  private async logSecurityEvent(event: {
    user_id?: string;
    clinic_id?: string;
    session_id?: string;
    event_type: string;
    event_category: string;
    severity_level: string;
    event_description: string;
    event_data?: any;
    ip_address?: string;
    user_agent?: string;
    source_component: string;
  }): Promise<void> {
    try {
      await this.supabase.from('security_events').insert({
        ...event,
        event_data: event.event_data || {},
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('セキュリティイベントログエラー:', error);
    }
  }

  /**
   * 重要度マッピング
   */
  private mapSeverityLevel(
    level: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    switch (level) {
      case 'critical':
        return 'critical';
      case 'error':
        return 'high';
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * アラートタイトル生成
   */
  private generateAlertTitle(eventType: string): string {
    const titleMap: Record<string, string> = {
      threat_detected_brute_force: 'ブルートフォース攻撃の検出',
      threat_detected_session_hijack: 'セッション乗っ取りの疑い',
      threat_detected_location_anomaly: '異常な位置からのアクセス',
      threat_detected_multiple_devices: '複数デバイスからの同時ログイン',
      threat_detected_suspicious_login: '疑わしいログイン試行',
    };

    return titleMap[eventType] || 'セキュリティイベント';
  }
}

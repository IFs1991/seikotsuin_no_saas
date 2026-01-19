/**
 * 複数デバイス制御システム
 * Phase 3A: セッション管理強化の一環としての複数デバイス管理
 */

import { createClient } from '@/lib/supabase';
import { createBrowserClient } from '@supabase/ssr';
import {
  SessionManager,
  type UserSession,
  type DeviceInfo,
} from './session-manager';
import { SecurityMonitor } from './security-monitor';
import { logger } from '@/lib/logger';

// ================================================================
// 型定義
// ================================================================

export interface DeviceSession {
  sessionId: string;
  deviceInfo: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  lastActivity: Date;
  createdAt: Date;
  isCurrentDevice: boolean;
  isTrusted: boolean;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

export interface MultiDeviceConfig {
  maxConcurrentDevices: number;
  requireDeviceTrust: boolean;
  allowDifferentIPs: boolean;
  notifyNewDevice: boolean;
  autoRevokeOldSessions: boolean;
  trustNewDeviceAfterDays: number;
}

export interface DeviceManagementAction {
  action: 'trust' | 'block' | 'revoke_session' | 'revoke_all_other';
  deviceId?: string;
  sessionId?: string;
  reason?: string;
}

export interface DeviceSecurityAlert {
  type:
  | 'new_device'
  | 'suspicious_activity'
  | 'concurrent_limit'
  | 'location_change';
  severity: 'low' | 'medium' | 'high';
  message: string;
  deviceInfo: DeviceInfo;
  timestamp: Date;
  actionRequired: boolean;
}

// ================================================================
// 複数デバイス管理クラス
// ================================================================

export class MultiDeviceManager {
  private readonly supabasePromise;
  private sessionManager: SessionManager;
  private securityMonitor: SecurityMonitor;

  constructor() {
    this.supabasePromise = createClient();
    this.sessionManager = new SessionManager();
    this.securityMonitor = new SecurityMonitor();
  }

  private async getSupabase() {
    return await this.supabasePromise;
  }

  /**
   * デバイス信頼判定（公開API）
   * 指紋(JSON文字列)で登録済みかつ信頼済みかを判定
   */
  async isDeviceTrusted(
    userId: string,
    deviceFingerprint: string
  ): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();
      const query = supabase
        .from('registered_devices')
        .select('is_trusted, trust_score, trust_level, device_fingerprint')
        .eq('user_id', userId)
        .eq('device_fingerprint', deviceFingerprint)
        .limit(1);

      let { data, error } = await query.single();

      // single() が未設定（thenableのみ）の場合にも対応
      if (error || !data) {
        try {
          const res = await query;
          // Supabase builder may return thenable without strict typing
          data = res && res.data ? res.data : null;
        } catch (_) {
          // ignore
        }
      }

      if (!data) return false;

      const record = Array.isArray(data) ? data[0] || null : data;
      if (!record) return false;

      // 一致検証（クエリ結果が他指紋の可能性に備える）
      if (
        typeof record.device_fingerprint === 'string' &&
        record.device_fingerprint !== deviceFingerprint
      ) {
        return false;
      }

      return Boolean(
        record.is_trusted === true ||
        record.trust_level === 'trusted' ||
        (typeof record.trust_score === 'number' && record.trust_score >= 80)
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * ユーザーのアクティブデバイス一覧取得
   */
  async getUserDevices(
    userId: string,
    clinicId: string
  ): Promise<DeviceSession[]> {
    try {
      const supabase = await this.getSupabase();
      const { data: sessions, error } = await supabase
        .from('user_sessions')
        .select(
          `
          id,
          device_info,
          ip_address,
          user_agent,
          last_activity,
          created_at,
          is_active,
          geolocation
        `
        )
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .eq('is_revoked', false)
        .order('last_activity', { ascending: false });

      if (error || !sessions) {
        logger.error('デバイス一覧取得エラー:', error);
        return [];
      }

      // 現在のセッションを特定するためのトークンを取得（実装は環境に依存）
      const currentSessionToken = this.getCurrentSessionToken();

      return sessions.map(session => ({
        sessionId: session.id,
        deviceInfo: session.device_info || {
          device: 'unknown',
          os: 'unknown',
          browser: 'unknown',
        },
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        lastActivity: new Date(session.last_activity),
        createdAt: new Date(session.created_at),
        isCurrentDevice: session.session_token === currentSessionToken,
        isTrusted: this.isDeviceTrustedByAge(
          session.device_info,
          session.created_at
        ),
        location: session.geolocation || undefined,
      }));
    } catch (error) {
      logger.error('getUserDevices エラー:', error);
      return [];
    }
  }

  /**
   * 新デバイス登録時の検証
   */
  async validateNewDevice(
    userId: string,
    clinicId: string,
    deviceInfo: DeviceInfo,
    ipAddress?: string
  ): Promise<{
    isAllowed: boolean;
    alerts: DeviceSecurityAlert[];
    config: MultiDeviceConfig;
  }> {
    const config = await this.getMultiDeviceConfig(clinicId);
    const alerts: DeviceSecurityAlert[] = [];

    // 既存のアクティブデバイス数をチェック
    const activeDeviceCount = await this.sessionManager.getActiveSessionCount(
      userId,
      clinicId
    );

    if (activeDeviceCount >= config.maxConcurrentDevices) {
      alerts.push({
        type: 'concurrent_limit',
        severity: 'high',
        message: `デバイス数上限（${config.maxConcurrentDevices}台）に達しています`,
        deviceInfo,
        timestamp: new Date(),
        actionRequired: true,
      });

      if (!config.autoRevokeOldSessions) {
        return { isAllowed: false, alerts, config };
      }
    }

    // 新デバイスの検出
    const isNewDevice = await this.isNewDevice(userId, deviceInfo);
    if (isNewDevice) {
      alerts.push({
        type: 'new_device',
        severity: config.notifyNewDevice ? 'medium' : 'low',
        message: '新しいデバイスからのアクセスです',
        deviceInfo,
        timestamp: new Date(),
        actionRequired: config.requireDeviceTrust,
      });
    }

    // 異なるIPアドレスからのアクセス
    if (ipAddress) {
      const locationChange = await this.detectLocationChange(userId, ipAddress);
      if (locationChange) {
        alerts.push({
          type: 'location_change',
          severity: 'medium',
          message: '通常とは異なる地域からのアクセスです',
          deviceInfo,
          timestamp: new Date(),
          actionRequired: false,
        });
      }
    }

    return { isAllowed: true, alerts, config };
  }

  /**
   * デバイス管理アクション実行
   */
  async executeDeviceAction(
    action: DeviceManagementAction,
    userId: string,
    clinicId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      switch (action.action) {
        case 'trust':
          return await this.trustDevice(action.deviceId!, userId, clinicId);

        case 'block':
          return await this.blockDevice(
            action.deviceId!,
            userId,
            clinicId,
            action.reason
          );

        case 'revoke_session':
          return await this.revokeDeviceSession(
            action.sessionId!,
            action.reason || 'manual'
          );

        case 'revoke_all_other':
          return await this.revokeAllOtherSessions(
            userId,
            clinicId,
            action.sessionId
          );

        default:
          return { success: false, message: '不明なアクションです' };
      }
    } catch (error) {
      logger.error('Device action execution error:', error);
      return {
        success: false,
        message: 'アクション実行中にエラーが発生しました',
      };
    }
  }

  /**
   * デバイス同期状態の確認
   */
  async checkDeviceSyncStatus(
    userId: string,
    clinicId: string
  ): Promise<{
    totalDevices: number;
    activeDevices: number;
    trustedDevices: number;
    suspiciousDevices: number;
    lastSyncAt?: Date;
  }> {
    const devices = await this.getUserDevices(userId, clinicId);

    const activeDevices = devices.filter(
      d => d.lastActivity > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    const trustedDevices = devices.filter(d => d.isTrusted);
    const suspiciousDevices = devices.filter(
      d => !d.isTrusted && activeDevices.includes(d)
    );

    return {
      totalDevices: devices.length,
      activeDevices: activeDevices.length,
      trustedDevices: trustedDevices.length,
      suspiciousDevices: suspiciousDevices.length,
      lastSyncAt: devices.length > 0 ? devices[0].lastActivity : undefined,
    };
  }

  /**
   * セキュリティ推奨事項の生成
   */
  async generateSecurityRecommendations(
    userId: string,
    clinicId: string
  ): Promise<
    Array<{
      type: 'action' | 'warning' | 'info';
      title: string;
      description: string;
      actionLabel?: string;
      actionData?: any;
    }>
  > {
    const devices = await this.getUserDevices(userId, clinicId);
    const config = await this.getMultiDeviceConfig(clinicId);
    const recommendations = [];

    // 古いセッションの検出
    const oldSessions = devices.filter(
      d => d.lastActivity < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    if (oldSessions.length > 0) {
      recommendations.push({
        type: 'action' as const,
        title: '古いセッションの整理',
        description: `${oldSessions.length}個の古いセッションがあります`,
        actionLabel: '古いセッションを削除',
        actionData: {
          action: 'revoke_old_sessions',
          sessionIds: oldSessions.map(s => s.sessionId),
        },
      });
    }

    // 信頼されていないデバイスの検出
    const untrustedDevices = devices.filter(d => !d.isTrusted);
    if (untrustedDevices.length > 0) {
      recommendations.push({
        type: 'warning' as const,
        title: '信頼されていないデバイス',
        description: `${untrustedDevices.length}台のデバイスが信頼済みリストにありません`,
      });
    }

    // デバイス数上限の警告
    if (devices.length >= config.maxConcurrentDevices * 0.8) {
      recommendations.push({
        type: 'warning' as const,
        title: 'デバイス数上限に近づいています',
        description: `現在${devices.length}/${config.maxConcurrentDevices}台のデバイスが登録されています`,
      });
    }

    return recommendations;
  }

  // ================================================================
  // プライベートメソッド
  // ================================================================

  /**
   * 複数デバイス設定取得
   */
  private async getMultiDeviceConfig(
    clinicId: string
  ): Promise<MultiDeviceConfig> {
    const supabase = await this.getSupabase();
    const { data: policy } = await supabase
      .from('session_policies')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    if (!policy) {
      // デフォルト設定
      return {
        maxConcurrentDevices: 3,
        requireDeviceTrust: false,
        allowDifferentIPs: true,
        notifyNewDevice: true,
        autoRevokeOldSessions: true,
        trustNewDeviceAfterDays: 7,
      };
    }

    return {
      maxConcurrentDevices: policy.max_devices_per_user || 3,
      requireDeviceTrust: policy.require_device_registration || false,
      allowDifferentIPs: !policy.block_concurrent_different_ips,
      notifyNewDevice: policy.notify_new_device_login,
      autoRevokeOldSessions: true,
      trustNewDeviceAfterDays: policy.remember_device_days || 7,
    };
  }

  /**
   * 新デバイス判定
   */
  private async isNewDevice(
    userId: string,
    deviceInfo: DeviceInfo
  ): Promise<boolean> {
    const supabase = await this.getSupabase();
    const { count } = await supabase
      .from('user_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .contains('device_info', {
        device: deviceInfo.device,
        os: deviceInfo.os,
      });

    return (count || 0) === 0;
  }

  /**
   * 位置変更の検出
   */
  private async detectLocationChange(
    userId: string,
    currentIP: string
  ): Promise<boolean> {
    const supabase = await this.getSupabase();
    const { data: recentSessions } = await supabase
      .from('user_sessions')
      .select('ip_address, geolocation')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('ip_address', currentIP)
      .limit(5);

    if (!recentSessions || recentSessions.length === 0) {
      return false;
    }

    // 簡易的な位置判定
    const knownIPs = recentSessions.map(s => s.ip_address);
    return !knownIPs.some(ip => this.isSimilarIP(currentIP, ip));
  }

  /**
   * IP類似性判定
   */
  private isSimilarIP(ip1: string, ip2: string): boolean {
    if (!ip1 || !ip2) return false;

    // 同じサブネット（/24）かチェック
    const parts1 = ip1.split('.');
    const parts2 = ip2.split('.');

    if (parts1.length !== 4 || parts2.length !== 4) return false;

    return parts1.slice(0, 3).join('.') === parts2.slice(0, 3).join('.');
  }

  /**
   * デバイス信頼性判定
   */
  private isDeviceTrustedByAge(
    deviceInfo: DeviceInfo,
    createdAt: string
  ): boolean {
    const createdDate = new Date(createdAt);
    const daysSinceCreated =
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

    // 7日以上使用されているデバイスは信頼済みとみなす
    return daysSinceCreated >= 7;
  }

  /**
   * デバイス信頼設定
   */
  private async trustDevice(
    deviceId: string,
    userId: string,
    clinicId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // registered_devicesテーブルに登録
    const supabase = await this.getSupabase();
    const { error } = await supabase.from('registered_devices').upsert({
      user_id: userId,
      clinic_id: clinicId,
      device_fingerprint: deviceId,
      trust_level: 'trusted',
      trusted_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, message: 'デバイスの信頼設定に失敗しました' };
    }

    return { success: true, message: 'デバイスを信頼済みに設定しました' };
  }

  /**
   * デバイスブロック
   */
  private async blockDevice(
    deviceId: string,
    userId: string,
    clinicId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from('registered_devices').upsert({
      user_id: userId,
      clinic_id: clinicId,
      device_fingerprint: deviceId,
      trust_level: 'blocked',
      blocked_at: new Date().toISOString(),
      blocked_reason: reason,
    });

    if (error) {
      return {
        success: false,
        message: 'デバイスのブロック設定に失敗しました',
      };
    }

    // 該当デバイスのセッションを無効化
    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_reason: 'device_blocked',
      })
      .eq('user_id', userId)
      .eq('clinic_id', clinicId)
      .contains('device_info', { device: deviceId });

    return { success: true, message: 'デバイスをブロックしました' };
  }

  /**
   * セッション無効化
   */
  private async revokeDeviceSession(
    sessionId: string,
    reason: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const success = await this.sessionManager.revokeSession(
      sessionId,
      reason as any
    );

    return {
      success,
      message: success
        ? 'セッションを無効化しました'
        : 'セッション無効化に失敗しました',
    };
  }

  /**
   * 他の全セッション無効化
   */
  private async revokeAllOtherSessions(
    userId: string,
    clinicId: string,
    keepSessionId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = await this.getSupabase();
      const { data: sessions } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .eq('is_revoked', false)
        .neq('id', keepSessionId || '');

      if (!sessions || sessions.length === 0) {
        return {
          success: true,
          message: '無効化するセッションがありませんでした',
        };
      }

      let revokedCount = 0;
      for (const session of sessions) {
        const success = await this.sessionManager.revokeSession(
          session.id,
          'manual_logout'
        );
        if (success) revokedCount++;
      }

      return {
        success: revokedCount > 0,
        message: `${revokedCount}個のセッションを無効化しました`,
      };
    } catch (error) {
      console.error('revokeAllOtherSessions error:', error);
      return { success: false, message: 'セッション無効化に失敗しました' };
    }
  }

  /**
   * 現在のセッショントークン取得
   */
  private getCurrentSessionToken(): string | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(cookie =>
      cookie.trim().startsWith('session-token=')
    );

    return sessionCookie ? sessionCookie.split('=')[1] : null;
  }
}

// ================================================================
// React Hook
// ================================================================

import { useEffect, useState } from 'react';

export function useMultiDeviceManager(userId?: string, clinicId?: string) {
  const [manager] = useState(() => new MultiDeviceManager());
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = async () => {
    if (!userId || !clinicId) return;

    setLoading(true);
    setError(null);

    try {
      const deviceList = await manager.getUserDevices(userId, clinicId);
      setDevices(deviceList);
    } catch (err) {
      setError('デバイス情報の取得に失敗しました');
      console.error('Device refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (action: DeviceManagementAction) => {
    if (!userId || !clinicId)
      return { success: false, message: 'ユーザー情報が不足しています' };

    const result = await manager.executeDeviceAction(action, userId, clinicId);

    if (result.success) {
      await refreshDevices();
    }

    return result;
  };

  useEffect(() => {
    if (userId && clinicId) {
      refreshDevices();
    }
  }, [userId, clinicId]);

  return {
    devices,
    loading,
    error,
    refreshDevices,
    executeAction,
    manager,
  };
}

/**
 * セッションタイムアウト管理
 * Phase 3A: クライアント側セッションタイムアウト機能
 */

import { createBrowserClient } from '@supabase/ssr';

// ================================================================
// 型定義
// ================================================================

export interface SessionTimeoutConfig {
  idleMinutes: number;
  warningMinutes: number;
  checkIntervalSeconds: number;
  showWarningDialog: boolean;
  autoLogout: boolean;
}

export interface SessionTimeoutState {
  isActive: boolean;
  lastActivity: Date;
  idleTime: number; // minutes
  timeUntilTimeout: number; // minutes
  isWarningShown: boolean;
  isTimedOut: boolean;
}

export type SessionTimeoutCallback = (state: SessionTimeoutState) => void;
export type TimeoutWarningCallback = (remainingMinutes: number) => void;
export type TimeoutCallback = () => void;

// ================================================================
// セッションタイムアウト管理クラス
// ================================================================

export class SessionTimeoutManager {
  private config: SessionTimeoutConfig;
  private state: SessionTimeoutState;
  private intervalId: number | null = null;
  private warningTimeoutId: number | null = null;
  private logoutTimeoutId: number | null = null;
  
  // コールバック
  private onStateChange?: SessionTimeoutCallback;
  private onWarning?: TimeoutWarningCallback;
  private onTimeout?: TimeoutCallback;

  // イベントリスナー
  private activityEventTypes = [
    'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'
  ];

  constructor(config: Partial<SessionTimeoutConfig> = {}) {
    this.config = {
      idleMinutes: 30,
      warningMinutes: 5,
      checkIntervalSeconds: 30,
      showWarningDialog: true,
      autoLogout: true,
      ...config,
    };

    this.state = {
      isActive: false,
      lastActivity: new Date(),
      idleTime: 0,
      timeUntilTimeout: this.config.idleMinutes,
      isWarningShown: false,
      isTimedOut: false,
    };
  }

  /**
   * タイムアウト監視開始
   */
  start(): void {
    if (this.state.isActive) {
      return;
    }

    this.state.isActive = true;
    this.state.lastActivity = new Date();
    this.resetWarning();

    // アクティビティイベントリスナーを追加
    this.addActivityListeners();

    // 定期チェック開始
    this.intervalId = window.setInterval(() => {
      this.checkTimeout();
    }, this.config.checkIntervalSeconds * 1000);

    console.log('Session timeout monitoring started');
  }

  /**
   * タイムアウト監視停止
   */
  stop(): void {
    if (!this.state.isActive) {
      return;
    }

    this.state.isActive = false;
    this.removeActivityListeners();
    this.clearTimeouts();

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('Session timeout monitoring stopped');
  }

  /**
   * アクティビティの記録
   */
  recordActivity(): void {
    if (!this.state.isActive) {
      return;
    }

    this.state.lastActivity = new Date();
    this.state.idleTime = 0;
    this.state.timeUntilTimeout = this.config.idleMinutes;

    // 警告状態をリセット
    if (this.state.isWarningShown) {
      this.resetWarning();
    }

    this.notifyStateChange();
  }

  /**
   * セッション延長
   */
  extendSession(additionalMinutes: number = 30): void {
    this.recordActivity();
    this.config.idleMinutes += additionalMinutes;
    this.state.timeUntilTimeout = this.config.idleMinutes;
    
    console.log(`Session extended by ${additionalMinutes} minutes`);
    this.notifyStateChange();
  }

  /**
   * 手動ログアウト
   */
  async logout(): Promise<void> {
    this.stop();
    this.state.isTimedOut = true;
    
    try {
      // Supabaseからログアウト
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      await supabase.auth.signOut();
      
      // セッションクッキーをクリア
      this.clearSessionCookies();
      
      // ログアウトページにリダイレクト
      window.location.href = '/admin/login?message=セッションがタイムアウトしました';
      
    } catch (error) {
      console.error('Logout error:', error);
      // エラーでもリダイレクト
      window.location.href = '/admin/login?error=logout_failed';
    }
  }

  /**
   * コールバック設定
   */
  onStateChange(callback: SessionTimeoutCallback): void {
    this.onStateChange = callback;
  }

  onWarning(callback: TimeoutWarningCallback): void {
    this.onWarning = callback;
  }

  onTimeout(callback: TimeoutCallback): void {
    this.onTimeout = callback;
  }

  /**
   * 現在の状態取得
   */
  getState(): SessionTimeoutState {
    return { ...this.state };
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<SessionTimeoutConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // アクティブな場合は監視を再開
    if (this.state.isActive) {
      this.stop();
      this.start();
    }
  }

  // ================================================================
  // プライベートメソッド
  // ================================================================

  /**
   * タイムアウトチェック
   */
  private checkTimeout(): void {
    const now = new Date();
    const timeSinceLastActivity = (now.getTime() - this.state.lastActivity.getTime()) / 1000 / 60; // minutes
    
    this.state.idleTime = timeSinceLastActivity;
    this.state.timeUntilTimeout = Math.max(0, this.config.idleMinutes - timeSinceLastActivity);

    // 警告表示のタイミング
    const warningThreshold = this.config.idleMinutes - this.config.warningMinutes;
    if (timeSinceLastActivity >= warningThreshold && !this.state.isWarningShown) {
      this.showWarning();
    }

    // タイムアウト
    if (timeSinceLastActivity >= this.config.idleMinutes) {
      this.handleTimeout();
      return;
    }

    this.notifyStateChange();
  }

  /**
   * 警告表示
   */
  private showWarning(): void {
    if (this.state.isWarningShown) {
      return;
    }

    this.state.isWarningShown = true;
    const remainingMinutes = Math.ceil(this.state.timeUntilTimeout);

    if (this.onWarning) {
      this.onWarning(remainingMinutes);
    }

    // 警告ダイアログ表示（設定が有効な場合）
    if (this.config.showWarningDialog) {
      this.showWarningDialog(remainingMinutes);
    }

    console.log(`Session timeout warning: ${remainingMinutes} minutes remaining`);
    this.notifyStateChange();
  }

  /**
   * タイムアウト処理
   */
  private handleTimeout(): void {
    this.state.isTimedOut = true;
    this.stop();

    if (this.onTimeout) {
      this.onTimeout();
    }

    if (this.config.autoLogout) {
      this.logout();
    }

    console.log('Session timed out');
  }

  /**
   * 警告ダイアログ表示
   */
  private showWarningDialog(remainingMinutes: number): void {
    const message = `セッションがあと${remainingMinutes}分でタイムアウトします。\n\n続行しますか？`;
    
    if (confirm(message)) {
      this.extendSession();
    } else {
      this.logout();
    }
  }

  /**
   * 警告状態リセット
   */
  private resetWarning(): void {
    this.state.isWarningShown = false;
    this.clearTimeouts();
  }

  /**
   * タイムアウトクリア
   */
  private clearTimeouts(): void {
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
    
    if (this.logoutTimeoutId) {
      clearTimeout(this.logoutTimeoutId);
      this.logoutTimeoutId = null;
    }
  }

  /**
   * アクティビティリスナー追加
   */
  private addActivityListeners(): void {
    this.activityEventTypes.forEach(eventType => {
      document.addEventListener(eventType, this.handleActivity, true);
    });
  }

  /**
   * アクティビティリスナー削除
   */
  private removeActivityListeners(): void {
    this.activityEventTypes.forEach(eventType => {
      document.removeEventListener(eventType, this.handleActivity, true);
    });
  }

  /**
   * アクティビティハンドラー
   */
  private handleActivity = (): void => {
    this.recordActivity();
  };

  /**
   * 状態変更通知
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * セッションクッキークリア
   */
  private clearSessionCookies(): void {
    // カスタムセッションクッキーをクリア
    document.cookie = 'session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    // Supabaseセッションクッキーをクリア
    const supabaseCookies = [
      'supabase-auth-token',
      'supabase.auth.token',
      'sb-auth-token'
    ];
    
    supabaseCookies.forEach(cookieName => {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
  }
}

// ================================================================
// React Hook
// ================================================================

import { useEffect, useState } from 'react';

export function useSessionTimeout(config: Partial<SessionTimeoutConfig> = {}) {
  const [timeoutManager] = useState(() => new SessionTimeoutManager(config));
  const [state, setState] = useState<SessionTimeoutState>(timeoutManager.getState());

  useEffect(() => {
    // コールバック設定
    timeoutManager.onStateChange(setState);
    
    // タイムアウト監視開始
    timeoutManager.start();

    // クリーンアップ
    return () => {
      timeoutManager.stop();
    };
  }, [timeoutManager]);

  const extendSession = (minutes?: number) => {
    timeoutManager.extendSession(minutes);
  };

  const logout = () => {
    timeoutManager.logout();
  };

  const recordActivity = () => {
    timeoutManager.recordActivity();
  };

  return {
    state,
    extendSession,
    logout,
    recordActivity,
    manager: timeoutManager,
  };
}

// ================================================================
// ユーティリティ関数
// ================================================================

/**
 * 時間フォーマット関数
 */
export function formatTimeRemaining(minutes: number): string {
  if (minutes < 1) {
    return '1分未満';
  }
  
  if (minutes < 60) {
    return `${Math.ceil(minutes)}分`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.ceil(minutes % 60);
  
  if (remainingMinutes === 0) {
    return `${hours}時間`;
  }
  
  return `${hours}時間${remainingMinutes}分`;
}

/**
 * デフォルト設定取得
 */
export function getDefaultSessionTimeoutConfig(userRole?: string): SessionTimeoutConfig {
  // 管理者は長めのタイムアウト
  if (userRole === 'admin' || userRole === 'clinic_admin') {
    return {
      idleMinutes: 60,
      warningMinutes: 10,
      checkIntervalSeconds: 30,
      showWarningDialog: true,
      autoLogout: true,
    };
  }
  
  // 一般スタッフは標準的なタイムアウト
  return {
    idleMinutes: 30,
    warningMinutes: 5,
    checkIntervalSeconds: 30,
    showWarningDialog: true,
    autoLogout: true,
  };
}
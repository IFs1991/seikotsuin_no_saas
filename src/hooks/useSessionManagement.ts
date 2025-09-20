/**
 * セッション管理統合フック
 * ログインプロセスとセッション管理機能を統合
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  SessionManager,
  parseUserAgent,
  getGeolocationFromIP,
} from '@/lib/session-manager';
import { useSessionTimeout } from '@/lib/session-timeout';

interface SessionManagementConfig {
  enableCustomSession: boolean;
  enableTimeout: boolean;
  enableDeviceTracking: boolean;
  timeoutMinutes?: number;
}

interface SessionInfo {
  isAuthenticated: boolean;
  userId?: string;
  clinicId?: string;
  customSessionId?: string;
  supabaseSession?: any;
}

export function useSessionManagement(
  config: SessionManagementConfig = {
    enableCustomSession: true,
    enableTimeout: true,
    enableDeviceTracking: true,
    timeoutMinutes: 30,
  }
) {
  const router = useRouter();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Session Manager インスタンス
  const [sessionManager] = useState(() => new SessionManager());

  // Supabase クライアント
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  // セッションタイムアウト（設定に応じて）
  const sessionTimeout = useSessionTimeout({
    idleMinutes: config.timeoutMinutes || 30,
    warningMinutes: 5,
  });

  // 初期化とセッション確認
  useEffect(() => {
    initializeSession();
  }, []);

  // Supabaseセッション変更の監視
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_IN' && session) {
        await handleLogin(session);
      } else if (event === 'SIGNED_OUT') {
        await handleLogout();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  /**
   * セッション初期化
   */
  const initializeSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Supabaseセッションの確認
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Session check error:', error);
        setError('セッションの確認に失敗しました');
        return;
      }

      if (session?.user) {
        await handleLogin(session);
      } else {
        setSessionInfo({ isAuthenticated: false });
      }
    } catch (err) {
      console.error('Session initialization error:', err);
      setError('セッションの初期化に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ログイン処理
   */
  const handleLogin = async (session: any) => {
    try {
      const user = session.user;

      // プロファイル情報の取得
      const { data: profile } = await supabase
        .from('profiles')
        .select('clinic_id, role')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        throw new Error('プロファイル情報が見つかりません');
      }

      // カスタムセッションの作成（設定が有効な場合）
      let customSessionId;
      if (config.enableCustomSession) {
        customSessionId = await createCustomSession(user.id, profile.clinic_id);
      }

      // セッション情報の更新
      setSessionInfo({
        isAuthenticated: true,
        userId: user.id,
        clinicId: profile.clinic_id,
        customSessionId,
        supabaseSession: session,
      });

      // セッションタイムアウト開始（設定が有効な場合）
      if (config.enableTimeout) {
        sessionTimeout.manager.start();
      }
    } catch (err) {
      console.error('Login handling error:', err);
      setError(err instanceof Error ? err.message : 'ログイン処理エラー');
    }
  };

  /**
   * ログアウト処理
   */
  const handleLogout = async () => {
    try {
      // セッションタイムアウト停止
      if (config.enableTimeout) {
        sessionTimeout.manager.stop();
      }

      // カスタムセッションの無効化
      if (sessionInfo.customSessionId) {
        await sessionManager.revokeSession(
          sessionInfo.customSessionId,
          'manual_logout'
        );
      }

      // カスタムセッションクッキーのクリア
      document.cookie =
        'session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

      // セッション情報のリセット
      setSessionInfo({ isAuthenticated: false });
    } catch (err) {
      console.error('Logout handling error:', err);
    }
  };

  /**
   * カスタムセッション作成
   */
  const createCustomSession = async (
    userId: string,
    clinicId: string
  ): Promise<string> => {
    try {
      // デバイス情報の取得
      const userAgent = navigator.userAgent;
      const deviceInfo = parseUserAgent(userAgent);

      // IP情報の取得（簡易版）
      const ipAddress = await getCurrentUserIP();

      // セッション作成
      const { session, token } = await sessionManager.createSession(
        userId,
        clinicId,
        {
          deviceInfo,
          ipAddress,
          userAgent,
          rememberDevice: false, // 必要に応じて設定
        }
      );

      // セッショントークンをクッキーに保存
      const expires = new Date(session.expires_at);
      document.cookie = `session-token=${token}; expires=${expires.toUTCString()}; path=/; secure; samesite=strict`;

      return session.id;
    } catch (error) {
      console.error('Custom session creation error:', error);
      throw new Error('カスタムセッションの作成に失敗しました');
    }
  };

  /**
   * 手動ログアウト
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      await handleLogout();
      router.push('/admin/login');
    } catch (err) {
      console.error('Manual logout error:', err);
      setError('ログアウトに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * セッション延長
   */
  const extendSession = async (minutes: number = 30) => {
    try {
      if (config.enableTimeout) {
        sessionTimeout.extendSession(minutes);
      }

      // カスタムセッションも延長
      if (sessionInfo.customSessionId && config.enableCustomSession) {
        // カスタムセッション延長のロジックを実装
        console.log('Extending custom session:', minutes);
      }
    } catch (err) {
      console.error('Session extension error:', err);
      setError('セッション延長に失敗しました');
    }
  };

  /**
   * セッション情報の更新
   */
  const refreshSession = async () => {
    try {
      await initializeSession();
    } catch (err) {
      console.error('Session refresh error:', err);
      setError('セッション更新に失敗しました');
    }
  };

  return {
    // セッション状態
    sessionInfo,
    isLoading,
    error,

    // タイムアウト情報
    timeoutState: config.enableTimeout ? sessionTimeout.state : null,

    // アクション
    logout,
    extendSession,
    refreshSession,

    // ユーティリティ
    clearError: () => setError(null),
  };
}

/**
 * 現在のユーザーIPアドレスを取得（簡易版）
 */
async function getCurrentUserIP(): Promise<string | undefined> {
  try {
    // 実際の実装では外部APIまたはサーバーサイドで取得
    return 'unknown';
  } catch (error) {
    console.error('IP address fetch error:', error);
    return undefined;
  }
}

/**
 * ページレベルでのセッション保護フック
 */
export function useSessionProtection(requiredRole?: string) {
  const sessionManagement = useSessionManagement();
  const router = useRouter();

  useEffect(() => {
    if (!sessionManagement.isLoading) {
      if (!sessionManagement.sessionInfo.isAuthenticated) {
        router.push('/admin/login');
        return;
      }

      // 役割チェック（実装する場合）
      if (requiredRole) {
        // TODO: 役割チェックロジックを追加
      }
    }
  }, [
    sessionManagement.isLoading,
    sessionManagement.sessionInfo.isAuthenticated,
    requiredRole,
    router,
  ]);

  return sessionManagement;
}

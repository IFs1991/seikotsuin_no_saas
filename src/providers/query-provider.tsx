'use client';

// =================================================================
// React Query Provider - データフェッチング・キャッシング管理
// =================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // データの自動再取得設定
        staleTime: 5 * 60 * 1000, // 5分間はfreshとみなす
        gcTime: 10 * 60 * 1000, // 10分間キャッシュを保持（旧cacheTime）
        retry: (failureCount, error: any) => {
          // 認証エラーや権限エラーは再試行しない
          if (error?.status === 401 || error?.status === 403) {
            return false;
          }
          // 3回まで再試行
          return failureCount < 3;
        },
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        // ウィンドウフォーカス時の再取得を有効化
        refetchOnWindowFocus: true,
        // ネットワーク再接続時の再取得を有効化
        refetchOnReconnect: true,
      },
      mutations: {
        // ミューテーション失敗時の再試行設定
        retry: (failureCount, error: any) => {
          // クライアントエラー（4xx）は再試行しない
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          // サーバーエラーは2回まで再試行
          return failureCount < 2;
        },
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* 開発環境でのみDevToolsを表示 */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          buttonPosition="bottom-right"
        />
      )}
    </QueryClientProvider>
  );
}

// React Queryのキー管理
export const queryKeys = {
  // システム設定関連
  systemSettings: {
    all: ['systemSettings'] as const,
    lists: () => [...queryKeys.systemSettings.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => 
      [...queryKeys.systemSettings.lists(), filters] as const,
    detail: (id: string) => 
      [...queryKeys.systemSettings.all, 'detail', id] as const,
  },
  
  // テーブル管理関連
  tables: {
    all: ['tables'] as const,
    lists: () => [...queryKeys.tables.all, 'list'] as const,
    list: (tableName: string, filters: Record<string, unknown>) => 
      [...queryKeys.tables.lists(), tableName, filters] as const,
    detail: (tableName: string, id: string) => 
      [...queryKeys.tables.all, 'detail', tableName, id] as const,
    config: (tableName: string) => 
      [...queryKeys.tables.all, 'config', tableName] as const,
  },
} as const;
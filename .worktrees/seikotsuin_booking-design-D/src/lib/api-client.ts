// =================================================================
// API Client Utilities - APIクライアントユーティリティ
// =================================================================

import { ApiResponse, ApiError } from '../types/api';
import {
  normalizeError,
  getErrorCodeFromStatus,
  logError,
  AppError,
  ERROR_CODES,
} from './error-handler';

/**
 * APIクライアント設定
 */
export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: Required<ApiClientConfig> = {
  baseUrl: '',
  timeout: 30000, // 30秒
  headers: {
    'Content-Type': 'application/json',
  },
  retryCount: 3,
  retryDelay: 1000, // 1秒
};

/**
 * APIクライアントクラス
 */
export class ApiClient {
  private config: Required<ApiClientConfig>;

  constructor(config: ApiClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * GETリクエスト
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, params);
    return this.request<T>('GET', url);
  }

  /**
   * POSTリクエスト
   */
  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, data);
  }

  /**
   * PUTリクエスト
   */
  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('PUT', url, data);
  }

  /**
   * PATCHリクエスト
   */
  async patch<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('PATCH', url, data);
  }

  /**
   * DELETEリクエスト
   */
  async delete<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, params);
    return this.request<T>('DELETE', url);
  }

  /**
   * URLを構築する
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean>
  ): string {
    let url = `${this.config.baseUrl}${path}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * HTTPリクエストを実行する
   */
  private async request<T>(
    method: string,
    url: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    let attempt = 0;

    while (attempt < this.config.retryCount) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const options: RequestInit = {
          method,
          headers: this.config.headers,
          signal: controller.signal,
        };

        if (
          data !== undefined &&
          (method === 'POST' || method === 'PUT' || method === 'PATCH')
        ) {
          options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        // レスポンスのパース
        const result = await this.parseResponse<T>(response, url);

        // 成功またはクライアントエラー（リトライしない）の場合は結果を返す
        if (response.ok || response.status < 500) {
          return result;
        }

        // サーバーエラーの場合はリトライ
        throw new AppError(
          getErrorCodeFromStatus(response.status),
          `Server error: ${response.status}`,
          response.status
        );
      } catch (error) {
        attempt++;

        // AbortError (タイムアウト) の場合
        if (error instanceof Error && error.name === 'AbortError') {
          const apiError = normalizeError(new Error('Request timeout'), url);
          logError(error, { url, method, attempt });

          if (attempt >= this.config.retryCount) {
            return { success: false, error: apiError };
          }

          await this.delay(this.config.retryDelay * attempt);
          continue;
        }

        // AppError の場合
        if (error instanceof AppError) {
          logError(error, { url, method, attempt });

          // クライアントエラーの場合はリトライしない
          if (error.statusCode < 500) {
            return { success: false, error: error.toApiError(url) };
          }

          // サーバーエラーの場合はリトライ
          if (attempt >= this.config.retryCount) {
            return { success: false, error: error.toApiError(url) };
          }

          await this.delay(this.config.retryDelay * attempt);
          continue;
        }

        // その他のエラー
        const apiError = normalizeError(error, url);
        logError(error instanceof Error ? error : new Error(String(error)), {
          url,
          method,
          attempt,
        });

        if (attempt >= this.config.retryCount) {
          return { success: false, error: apiError };
        }

        await this.delay(this.config.retryDelay * attempt);
      }
    }

    // ここに到達することはないが、TypeScriptの型チェックのため
    return {
      success: false,
      error: normalizeError(new Error('Maximum retry attempts exceeded'), url),
    };
  }

  /**
   * レスポンスをパースする
   */
  private async parseResponse<T>(
    response: Response,
    url: string
  ): Promise<ApiResponse<T>> {
    try {
      const text = await response.text();

      if (!text) {
        if (response.ok) {
          return { success: true };
        } else {
          return {
            success: false,
            error: {
              code: getErrorCodeFromStatus(response.status),
              message: `HTTP ${response.status}: ${response.statusText}`,
              timestamp: new Date().toISOString(),
              path: url,
            },
          };
        }
      }

      const data = JSON.parse(text);

      // APIレスポンス形式のチェック
      if (typeof data === 'object' && data !== null && 'success' in data) {
        return data as ApiResponse<T>;
      }

      // APIレスポンス形式でない場合、成功時はdataとして扱う
      if (response.ok) {
        return { success: true, data: data as T };
      } else {
        // エラー時はエラーメッセージとして扱う
        return {
          success: false,
          error: {
            code: getErrorCodeFromStatus(response.status),
            message: typeof data === 'string' ? data : JSON.stringify(data),
            timestamp: new Date().toISOString(),
            path: url,
          },
        };
      }
    } catch (parseError) {
      logError(
        parseError instanceof Error
          ? parseError
          : new Error(String(parseError)),
        { url, response: response.status }
      );

      return {
        success: false,
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: response.ok
            ? 'Failed to parse response'
            : `HTTP ${response.status}: ${response.statusText}`,
          details: {
            parseError:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          },
          timestamp: new Date().toISOString(),
          path: url,
        },
      };
    }
  }

  /**
   * 指定時間待機する
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// デフォルトのAPIクライアントインスタンス
export const apiClient = new ApiClient();

/**
 * 型安全なAPI呼び出し関数群
 */
export const api = {
  // ダッシュボード
  dashboard: {
    get: (clinicId: string) =>
      apiClient.get('/api/dashboard', { clinic_id: clinicId }),
  },

  // 患者分析
  patients: {
    getAnalysis: (clinicId: string) =>
      apiClient.get('/api/patients', { clinic_id: clinicId }),
    create: (data: any) => apiClient.post('/api/patients', data),
  },

  // 収益分析
  revenue: {
    getAnalysis: (clinicId: string, period?: string) =>
      apiClient.get('/api/revenue', {
        clinic_id: clinicId,
        ...(period && { period }),
      }),
    create: (data: any) => apiClient.post('/api/revenue', data),
  },

  // スタッフ分析
  staff: {
    getAnalysis: (clinicId: string) =>
      apiClient.get('/api/staff', { clinic_id: clinicId }),
    create: (data: any) => apiClient.post('/api/staff', data),
  },

  // 日報
  dailyReports: {
    get: (clinicId: string, startDate?: string, endDate?: string) =>
      apiClient.get('/api/daily-reports', {
        clinic_id: clinicId,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      }),
    create: (data: any) => apiClient.post('/api/daily-reports', data),
    delete: (id: string) => apiClient.delete('/api/daily-reports', { id }),
  },

  // チャット
  chat: {
    getHistory: (userId: string, sessionId?: string) =>
      apiClient.get('/api/chat', {
        user_id: userId,
        ...(sessionId && { session_id: sessionId }),
      }),
    sendMessage: (data: any) => apiClient.post('/api/chat', data),
  },

  // AIコメント
  aiComments: {
    get: (clinicId: string, date?: string) =>
      apiClient.get('/api/ai-comments', {
        clinic_id: clinicId,
        ...(date && { date }),
      }),
    generate: (data: any) => apiClient.post('/api/ai-comments', data),
  },
} as const;

/**
 * レスポンスのタイプガード
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: false; error: ApiError } {
  return response.success === false && response.error !== undefined;
}

/**
 * APIエラーハンドリングヘルパー
 */
export function handleApiError(
  error: ApiError,
  defaultMessage = '処理中にエラーが発生しました'
): string {
  return error.message || defaultMessage;
}

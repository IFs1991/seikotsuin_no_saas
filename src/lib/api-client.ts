// =================================================================
// API Client Utilities - APIクライアントユーティリティ
// =================================================================

import {
  type ApiResponse,
  type ApiError,
  type AICommentResponse,
  type ChatSession,
  type PatientAnalysisData,
  type RevenueAnalysisData,
  type StaffAnalysisData,
  type RevenueEstimateDetailsResponse,
} from '../types/api';
import type {
  CustomerInsertDTO,
  CustomerUpdateDTO,
} from '@/app/api/customers/schema';
import type { StaffInsertDTO } from '@/app/api/staff/schema';
import type { DailyReportPayload } from '@/lib/daily-reports/schema';
import type {
  ManagerDailyReportsOverview,
  ManagerDailyReportsOverviewQuery,
} from './manager-daily-reports';
import type {
  ManagerPatientAnalysisTarget,
  ManagerPatientAnalysisPeriodType,
  ManagerPatientAnalysisResponse,
} from './manager-patient-analysis';
import type {
  ManagerRevenueAnalysisPeriodType,
  ManagerRevenueAnalysisResponse,
  ManagerRevenueAnalysisTarget,
  ManagerRevenueCompareMode,
} from './manager-revenue-analysis';
import type { ManagerDashboardResponse } from '@/types/manager-dashboard';
import type { ManagerAssignedClinicsResponse } from '@/types/manager-assigned-clinics';
import type {
  ManagerClinicComparisonCompareMode,
  ManagerClinicComparisonResponse,
} from '@/types/manager-clinic-comparison';
import type {
  ManagerRosterAssignRequest,
  ManagerRosterAssignResponse,
  ManagerRosterCandidatesQuery,
  ManagerRosterCandidatesResponse,
  ManagerRostersQuery,
  ManagerRostersResponse,
} from '@/types/manager-rosters';
import type { ManagerStaffListResponse } from '@/types/manager-staff-list';
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

interface RevenueCreateRequest {
  clinic_id: string;
  patient_id?: string | null;
  visit_id?: string | null;
  amount: number;
  insurance_revenue?: number;
  private_revenue?: number;
  menu_id?: string | null;
  payment_method_id?: string | null;
}

type CustomerApiItem = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  customAttributes?: Record<string, unknown>;
  lineUserId?: string;
  consentMarketing?: boolean;
  consentReminder?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerListQuery = {
  q?: string;
  limit?: number;
  cursor?: string;
};

type CustomerListApiPage = {
  items: CustomerApiItem[];
  nextCursor: string | null;
};

type ChatSendRequest = {
  message: string;
  clinic_id?: string | null;
  session_id?: string | null;
  user_id?: string;
};

type ChatSendResponse = {
  session_id: string;
  user_message: {
    id: string;
    sender: string;
    message_text: string;
  };
  ai_message: {
    id: string;
    sender: string;
    message_text: string;
    response_data?: Record<string, unknown>;
  };
};

type AICommentGenerateRequest = {
  clinic_id: string;
  date?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isApiErrorPayload(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.details === undefined || isRecord(value.details)) &&
    (value.timestamp === undefined || typeof value.timestamp === 'string') &&
    (value.path === undefined || typeof value.path === 'string')
  );
}

export type ManagerPatientAnalysisQuery = {
  clinicId?: string | null;
  target?: ManagerPatientAnalysisTarget;
  period?: ManagerPatientAnalysisPeriodType;
  startDate?: string | null;
  endDate?: string | null;
};

export type ManagerRevenueAnalysisQuery = {
  clinicId?: string | null;
  target?: ManagerRevenueAnalysisTarget;
  period?: ManagerRevenueAnalysisPeriodType;
  startDate?: string | null;
  endDate?: string | null;
  compare?: ManagerRevenueCompareMode;
};

export type DailyReportsListData = {
  reports: Array<{
    id: string;
    reportDate: string;
    staffName: string;
    totalPatients: number | null;
    newPatients: number | null;
    totalRevenue: number;
    insuranceRevenue: number;
    privateRevenue: number;
    reportText: string | null;
    createdAt: string | null;
  }>;
  summary: {
    totalReports: number;
    averagePatients: number;
    averageRevenue: number;
    totalRevenue: number;
  };
  monthlyTrends: Array<{
    month: string;
    reports: number;
    totalPatients: number;
    totalRevenue: number;
  }>;
};

export type DashboardBootstrapData = {
  profile: {
    id: string;
    email: string | null;
    role: string | null;
    clinicId: string | null;
    clinicName: string | null;
    isActive: boolean;
    isAdmin: boolean;
  };
  dailyReports: DailyReportsListData;
};

export type DashboardBootstrapQuery = {
  clinicId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type ManagerStaffListQuery = {
  clinicId?: string | null;
};

export type ManagerClinicComparisonQuery = {
  period?: ManagerRevenueAnalysisPeriodType;
  startDate?: string | null;
  endDate?: string | null;
  compare?: ManagerClinicComparisonCompareMode;
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

      const data: unknown = JSON.parse(text);

      // APIレスポンス形式のチェック
      if (isRecord(data) && typeof data.success === 'boolean') {
        if (data.success === true) {
          return {
            success: true,
            data: data.data as T | undefined,
            message:
              typeof data.message === 'string' ? data.message : undefined,
          };
        }

        return {
          success: false,
          error: isApiErrorPayload(data.error)
            ? data.error
            : {
                code: getErrorCodeFromStatus(response.status),
                message:
                  typeof data.message === 'string'
                    ? data.message
                    : stringifyUnknown(data.error ?? data),
                timestamp: new Date().toISOString(),
                path: url,
              },
          message: typeof data.message === 'string' ? data.message : undefined,
        };
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
            message: stringifyUnknown(data),
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
  clinics: {
    getAccessible: () =>
      apiClient.get<{
        clinics: Array<{ id: string; name: string }>;
        currentClinicId: string | null;
      }>('/api/clinics/accessible'),
  },

  system: {
    getStatus: () =>
      apiClient.get<{
        activeClinicCount: number;
        systemStatus: 'operational' | 'degraded' | 'maintenance';
        aiAnalysisStatus: 'active' | 'inactive';
        lastUpdated: string;
      }>('/api/system/status'),
  },

  // ダッシュボード
  dashboard: {
    get: (clinicId: string) =>
      apiClient.get('/api/dashboard', { clinic_id: clinicId }),
  },

  // 患者分析（読み取り専用 - レガシー）
  // @deprecated Use api.customers instead for write operations
  patients: {
    /** @deprecated Use api.customers.getAnalysis instead */
    getAnalysis: (clinicId: string) =>
      apiClient.get<PatientAnalysisData>('/api/patients', {
        clinic_id: clinicId,
      }),
    /**
     * @deprecated Use api.customers.create instead.
     * POST /api/patients is disabled. This redirects to /api/customers.
     */
    create: (data: CustomerInsertDTO) => apiClient.post('/api/customers', data),
  },

  // 顧客（SSOT - Single Source of Truth）
  customers: {
    getAnalysis: (clinicId: string) =>
      apiClient.get<PatientAnalysisData>('/api/customers/analysis', {
        clinic_id: clinicId,
      }),
    getList: (clinicId: string, query: string | CustomerListQuery = {}) => {
      const normalizedQuery = typeof query === 'string' ? { q: query } : query;
      return apiClient.get<CustomerListApiPage>('/api/customers', {
        clinic_id: clinicId,
        ...(normalizedQuery.q ? { q: normalizedQuery.q } : {}),
        ...(normalizedQuery.limit ? { limit: normalizedQuery.limit } : {}),
        ...(normalizedQuery.cursor ? { cursor: normalizedQuery.cursor } : {}),
      });
    },
    getById: (clinicId: string, id: string) =>
      apiClient.get<CustomerApiItem>('/api/customers', {
        clinic_id: clinicId,
        id,
      }),
    create: (data: CustomerInsertDTO) =>
      apiClient.post<CustomerApiItem>('/api/customers', data),
    update: (data: CustomerUpdateDTO) =>
      apiClient.patch<CustomerApiItem>('/api/customers', data),
  },

  // 収益分析
  revenue: {
    getAnalysis: (clinicId: string, period?: string) =>
      apiClient.get<RevenueAnalysisData>('/api/revenue', {
        clinic_id: clinicId,
        ...(period && { period }),
      }),
    create: (data: RevenueCreateRequest) =>
      apiClient.post('/api/revenue', data),
  },

  revenueEstimates: {
    getDetails: (clinicId: string, period?: string) =>
      apiClient.get<RevenueEstimateDetailsResponse>(
        '/api/revenue-estimates/details',
        {
          clinic_id: clinicId,
          ...(period && { period }),
        }
      ),
  },

  // スタッフ分析
  staff: {
    getAnalysis: (clinicId: string) =>
      apiClient.get<StaffAnalysisData>('/api/staff', { clinic_id: clinicId }),
    create: (data: StaffInsertDTO) => apiClient.post('/api/staff', data),
  },

  // 日報
  dailyReports: {
    get: (clinicId: string, startDate?: string, endDate?: string) =>
      apiClient.get<DailyReportsListData>('/api/daily-reports', {
        clinic_id: clinicId,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      }),
    create: (data: DailyReportPayload) =>
      apiClient.post('/api/daily-reports', data),
    delete: (id: string) => apiClient.delete('/api/daily-reports', { id }),
  },

  dashboardBootstrap: {
    get: (query: DashboardBootstrapQuery = {}) =>
      apiClient.get<DashboardBootstrapData>('/api/dashboard/bootstrap', {
        ...(query.clinicId ? { clinic_id: query.clinicId } : {}),
        ...(query.startDate ? { start_date: query.startDate } : {}),
        ...(query.endDate ? { end_date: query.endDate } : {}),
      }),
  },

  managerDailyReports: {
    getOverview: (query: ManagerDailyReportsOverviewQuery) =>
      apiClient.get<ManagerDailyReportsOverview>(
        '/api/manager/daily-reports/overview',
        {
          clinic_id: query.clinicId,
          start_date: query.startDate,
          end_date: query.endDate,
          ...(query.status ? { status: query.status } : {}),
        }
      ),
  },

  managerPatients: {
    getAnalysis: (query: ManagerPatientAnalysisQuery = {}) =>
      apiClient.get<ManagerPatientAnalysisResponse>(
        '/api/manager/patients/analysis',
        {
          ...(query.clinicId ? { clinic_id: query.clinicId } : {}),
          ...(query.target ? { target: query.target } : {}),
          ...(query.period ? { period: query.period } : {}),
          ...(query.startDate ? { start_date: query.startDate } : {}),
          ...(query.endDate ? { end_date: query.endDate } : {}),
        }
      ),
  },

  managerRevenue: {
    getAnalysis: (query: ManagerRevenueAnalysisQuery = {}) =>
      apiClient.get<ManagerRevenueAnalysisResponse>(
        '/api/manager/revenue/analysis',
        {
          ...(query.clinicId ? { clinic_id: query.clinicId } : {}),
          ...(query.target ? { target: query.target } : {}),
          ...(query.period ? { period: query.period } : {}),
          ...(query.startDate ? { start_date: query.startDate } : {}),
          ...(query.endDate ? { end_date: query.endDate } : {}),
          ...(query.compare ? { compare: query.compare } : {}),
        }
      ),
  },

  managerDashboard: {
    get: () =>
      apiClient.get<ManagerDashboardResponse>('/api/manager/dashboard'),
  },

  managerAssignedClinics: {
    get: () =>
      apiClient.get<ManagerAssignedClinicsResponse>(
        '/api/manager/assigned-clinics'
      ),
  },

  managerStaff: {
    get: (query: ManagerStaffListQuery = {}) =>
      apiClient.get<ManagerStaffListResponse>('/api/manager/staff', {
        ...(query.clinicId ? { clinic_id: query.clinicId } : {}),
      }),
  },

  managerRosters: {
    get: (query: ManagerRostersQuery) =>
      apiClient.get<ManagerRostersResponse>('/api/manager/rosters', {
        clinic_id: query.clinicId,
        start: query.start,
        end: query.end,
      }),
    getCandidates: (query: ManagerRosterCandidatesQuery) =>
      apiClient.get<ManagerRosterCandidatesResponse>(
        '/api/manager/rosters/candidates',
        {
          clinic_id: query.clinicId,
          date: query.date,
          ...(query.periodId ? { period_id: query.periodId } : {}),
        }
      ),
    assign: (request: ManagerRosterAssignRequest) =>
      apiClient.post<ManagerRosterAssignResponse>(
        '/api/manager/rosters/assign',
        request
      ),
  },

  managerClinicComparison: {
    get: (query: ManagerClinicComparisonQuery = {}) =>
      apiClient.get<ManagerClinicComparisonResponse>(
        '/api/manager/clinic-comparison',
        {
          ...(query.period ? { period: query.period } : {}),
          ...(query.startDate ? { start_date: query.startDate } : {}),
          ...(query.endDate ? { end_date: query.endDate } : {}),
          ...(query.compare ? { compare: query.compare } : {}),
        }
      ),
  },

  // チャット
  chat: {
    getHistory: (clinicId?: string | null, sessionId?: string) =>
      apiClient.get<ChatSession[]>('/api/chat', {
        ...(clinicId ? { clinic_id: clinicId } : {}),
        ...(sessionId && { session_id: sessionId }),
      }),
    sendMessage: (data: ChatSendRequest) =>
      apiClient.post<ChatSendResponse>('/api/chat', data),
  },

  // 通知
  notifications: {
    get: (params?: Record<string, string | number | boolean>) =>
      apiClient.get<{
        notifications: Array<{
          id: string;
          title: string;
          message: string;
          type: string;
          is_read: boolean;
          created_at: string;
        }>;
        unreadCount: number;
        total: number;
      }>('/api/notifications', params),
    getUnreadCount: () =>
      apiClient.get<{
        notifications: never[];
        unreadCount: number;
        total: number;
      }>('/api/notifications', { include_count: true, limit: 0 }),
  },

  // AIコメント
  aiComments: {
    get: (clinicId: string, date?: string) =>
      apiClient.get<AICommentResponse>('/api/ai-comments', {
        clinic_id: clinicId,
        ...(date && { date }),
      }),
    generate: (data: AICommentGenerateRequest) =>
      apiClient.post<AICommentResponse>('/api/ai-comments', data),
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

// =================================================================
// API Response Types - 統一されたAPIレスポンス型定義
// =================================================================

/**
 * 統一されたAPIレスポンス形式
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

/**
 * APIエラー情報
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
}

/**
 * バリデーションエラー
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

// =================================================================
// Database Entity Types - データベーステーブルに対応する型
// =================================================================

/**
 * 店舗情報
 */
export interface Clinic {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  opening_date: string | null; // ISO date string
  is_active: boolean;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * スタッフ情報
 */
export interface Staff {
  id: string;
  clinic_id: string;
  name: string;
  role: StaffRole;
  email: string;
  hire_date: string | null; // ISO date string
  is_therapist: boolean;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * 患者情報
 */
export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  gender: 'male' | 'female' | 'other' | null;
  date_of_birth: string | null; // ISO date string
  phone_number: string | null;
  address: string | null;
  registration_date: string; // ISO date string
  last_visit_date: string | null; // ISO date string
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * 来院記録
 */
export interface Visit {
  id: string;
  patient_id: string;
  clinic_id: string;
  visit_date: string; // ISO datetime string
  therapist_id: string | null;
  notes: string | null;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * 売上データ
 */
export interface Revenue {
  id: string;
  visit_id: string | null;
  clinic_id: string;
  patient_id: string | null;
  revenue_date: string; // ISO date string
  amount: number;
  insurance_revenue: number;
  private_revenue: number;
  payment_method_id: string | null;
  treatment_menu_id: string | null;
  patient_type_id: string | null;
  category_id: string | null;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * 日報データ
 */
export interface DailyReport {
  id: string;
  clinic_id: string;
  report_date: string; // ISO date string
  staff_id: string | null;
  total_patients: number;
  new_patients: number;
  total_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  report_text: string | null;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * AIコメント
 */
export interface AIComment {
  id: string;
  clinic_id: string;
  comment_date: string; // ISO date string
  summary: string | null;
  good_points: string | null;
  improvement_points: string | null;
  suggestion_for_tomorrow: string | null;
  raw_ai_response: Record<string, unknown> | null;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

// =================================================================
// Enum Types - 列挙型定義
// =================================================================

export type StaffRole = 'manager' | 'practitioner' | 'receptionist' | 'admin';
export type UserRole = 'admin' | 'manager' | 'staff' | 'practitioner';
export type DataAccessLevel = 'full' | 'limited' | 'readonly';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type TreatmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

// =================================================================
// API Request/Response Data Types - API固有のデータ型
// =================================================================

/**
 * ダッシュボードデータ
 */
export interface DashboardData {
  dailyData: {
    revenue: number;
    patients: number;
    insuranceRevenue: number;
    privateRevenue: number;
  };
  aiComment: AICommentResponse | null;
  revenueChartData: RevenueChartPoint[];
  heatmapData: HeatmapPoint[];
  alerts: string[];
}

/**
 * AIコメントレスポンス
 */
export interface AICommentResponse {
  id: string;
  summary: string;
  highlights: string[];
  improvements: string[];
  suggestions: string[];
  created_at: string;
}

/**
 * 収益チャートデータポイント
 */
export interface RevenueChartPoint {
  name: string; // 日付
  '総売上': number;
  '保険診療': number;
  '自費診療': number;
}

/**
 * ヒートマップデータポイント
 */
export interface HeatmapPoint {
  hour_of_day: number;
  day_of_week: number;
  visit_count: number;
  avg_revenue: number | null;
}

/**
 * 患者分析データ
 */
export interface PatientAnalysisData {
  conversionData: ConversionAnalysis;
  visitCounts: VisitCounts;
  riskScores: PatientRiskScore[];
  ltvRanking: PatientLTV[];
  segmentData: SegmentAnalysis;
  followUpList: FollowUpPatient[];
  totalPatients: number;
  activePatients: number;
}

/**
 * 転換率分析
 */
export interface ConversionAnalysis {
  newPatients: number;
  returnPatients: number;
  conversionRate: number;
  stages: ConversionStage[];
}

export interface ConversionStage {
  name: string;
  value: number;
}

/**
 * 来院回数統計
 */
export interface VisitCounts {
  average: number;
  monthlyChange: number;
}

/**
 * 患者離脱リスクスコア
 */
export interface PatientRiskScore {
  patient_id: string;
  name: string;
  riskScore: number;
  lastVisit: string | null;
  category: 'high' | 'medium' | 'low';
}

/**
 * 患者LTV
 */
export interface PatientLTV {
  patient_id: string;
  name: string;
  ltv: number;
  visit_count: number;
  total_revenue: number;
}

/**
 * セグメント分析
 */
export interface SegmentAnalysis {
  age?: SegmentItem[];
  visit?: SegmentItem[];
  symptom?: SegmentItem[];
}

export interface SegmentItem {
  label: string;
  value: number;
}

/**
 * フォローアップ対象患者
 */
export interface FollowUpPatient {
  patient_id: string;
  name: string;
  reason: string;
  lastVisit: string | null;
  action: string;
}

/**
 * 収益分析データ
 */
export interface RevenueAnalysisData {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  insuranceRevenue: number;
  selfPayRevenue: number;
  menuRanking: MenuRanking[];
  hourlyRevenue: HourlyRevenue[];
  revenueForecast: number;
  growthRate: string;
  revenueTrends: RevenueTrend[];
  costAnalysis: string;
  staffRevenueContribution: StaffRevenue[];
}

export interface MenuRanking {
  menu_id: string | null;
  menu_name: string;
  total_revenue: number;
  transaction_count: number;
}

export interface HourlyRevenue {
  hour_of_day: number;
  total_revenue: number;
  transaction_count: number;
  avg_transaction_amount: number;
}

export interface RevenueTrend {
  date: string;
  total_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  transaction_count: number;
}

export interface StaffRevenue {
  staff_id: string;
  name: string;
  revenue: number;
  patients: number;
  satisfaction: number;
}

/**
 * スタッフ分析データ
 */
export interface StaffAnalysisData {
  staffMetrics: StaffMetrics;
  revenueRanking: StaffRevenue[];
  satisfactionCorrelation: StaffSatisfaction[];
  performanceTrends: Record<string, PerformanceTrend[]>;
  skillMatrix: StaffSkill[];
  trainingHistory: TrainingRecord[];
  totalStaff: number;
  activeStaff: number;
}

export interface StaffMetrics {
  dailyPatients: number;
  totalRevenue: number;
  averageSatisfaction: number;
}

export interface StaffSatisfaction {
  name: string;
  satisfaction: number;
  revenue: number;
  patients: number;
}

export interface PerformanceTrend {
  date: string;
  revenue: number;
  patients: number;
  satisfaction: number;
}

export interface StaffSkill {
  id: string;
  name: string;
  skills: Skill[];
}

export interface Skill {
  name: string;
  level: number; // 1-5
}

export interface TrainingRecord {
  id: number | string;
  staff_id?: string;
  title: string;
  date: string;
  completed: boolean;
}

// =================================================================
// Form Data Types - フォームデータ型
// =================================================================

/**
 * 日報フォームデータ
 */
export interface DailyReportForm {
  clinic_id: string;
  staff_id?: string;
  report_date: string; // YYYY-MM-DD
  total_patients: number;
  new_patients: number;
  total_revenue: number;
  insurance_revenue: number;
  private_revenue: number;
  report_text?: string;
}

/**
 * 患者登録フォームデータ
 */
export interface PatientForm {
  clinic_id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  date_of_birth?: string; // YYYY-MM-DD
  phone_number?: string;
  address?: string;
}

/**
 * スタッフ登録フォームデータ
 */
export interface StaffForm {
  clinic_id: string;
  name: string;
  role: StaffRole;
  email: string;
  hire_date?: string; // YYYY-MM-DD
  is_therapist: boolean;
}

/**
 * 売上登録フォームデータ
 */
export interface RevenueForm {
  clinic_id: string;
  patient_id?: string;
  visit_id?: string;
  amount: number;
  insurance_revenue?: number;
  private_revenue?: number;
  treatment_menu_id?: string;
  payment_method_id?: string;
}

// =================================================================
// Chat Types - チャット機能関連型
// =================================================================

/**
 * チャットメッセージ
 */
export interface ChatMessage {
  id: string;
  session_id: string;
  sender: 'user' | 'ai';
  message_text: string;
  sent_at: string; // ISO datetime string
  response_data?: Record<string, unknown>;
  created_at: string; // ISO datetime string
}

/**
 * チャットセッション
 */
export interface ChatSession {
  id: string;
  user_id: string;
  clinic_id: string | null;
  session_start_time: string; // ISO datetime string
  session_end_time: string | null; // ISO datetime string
  context_data?: Record<string, unknown>;
  is_admin_session: boolean;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
  chat_messages?: ChatMessage[];
}

/**
 * チャットリクエスト
 */
export interface ChatRequest {
  user_id: string;
  clinic_id?: string;
  message: string;
  session_id?: string;
}

// =================================================================
// Utility Types - ユーティリティ型
// =================================================================

export type Optional<T> = {
  [P in keyof T]?: T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DateRange = {
  start: string; // ISO date string
  end: string; // ISO date string
};

/**
 * ページネーション
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ソート設定
 */
export interface Sort {
  field: string;
  order: 'asc' | 'desc';
}
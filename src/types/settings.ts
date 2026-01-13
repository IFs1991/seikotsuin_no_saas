/**
 * 管理設定の型定義
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 */

// 設定カテゴリ
export type SettingsCategory =
  | 'clinic_basic'
  | 'clinic_hours'
  | 'booking_calendar'
  | 'communication'
  | 'system_security'
  | 'system_backup'
  | 'services_pricing'
  | 'insurance_billing'
  | 'data_management';

// クリニック基本情報
export interface ClinicBasicSettings {
  name: string;
  zipCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  description: string;
  logoUrl: string | null;
}

// 診療時間
export interface TimeRange {
  start: string;
  end: string;
}

export interface DayHours {
  isOpen: boolean;
  timeRanges: TimeRange[];
}

export interface ClinicHoursSettings {
  hoursByDay: Record<string, DayHours>;
  holidays: string[];
  specialClosures: {
    date: string;
    reason: string;
  }[];
}

// 予約カレンダー設定
export interface BookingCalendarSettings {
  slotMinutes: number;
  maxConcurrent: number;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  allowOnlineBooking: boolean;
}

// コミュニケーション設定
export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: 'booking_confirmation' | 'reminder' | 'cancellation' | 'followup';
}

export interface CommunicationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  lineEnabled: boolean;
  pushEnabled: boolean;
  smtpSettings: SmtpSettings;
  templates: EmailTemplate[];
}

// システムセキュリティ設定
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

export interface SystemSecuritySettings {
  passwordPolicy: PasswordPolicy;
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginAttempts: number;
  lockoutDuration: number;
}

// バックアップ設定
export interface SystemBackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  retentionDays: number;
  cloudStorage: boolean;
  storageProvider: 'aws' | 'gcp' | 'azure';
}

// サービス・料金設定
export interface ServiceMenu {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  insuranceApplicable: boolean;
  isActive: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
  displayOrder: number;
}

export interface InsuranceOption {
  id: string;
  name: string;
  code: string;
  coPaymentRate: number;
}

export interface ServicesPricingSettings {
  menus: ServiceMenu[];
  categories: ServiceCategory[];
  insuranceOptions: InsuranceOption[];
}

// 保険・請求設定
export interface InsuranceType {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface ReceiptSettings {
  clinicCode: string;
  clinicName: string;
  doctorName: string;
  outputFormat: 'standard' | 'detailed';
}

export interface InsuranceBillingSettings {
  insuranceTypes: InsuranceType[];
  receiptSettings: ReceiptSettings;
  billingCycle: 'weekly' | 'biweekly' | 'monthly';
}

// データ管理設定
export interface DataManagementSettings {
  importMode: 'update' | 'replace' | 'merge';
  exportFormat: 'csv' | 'excel' | 'pdf' | 'json';
  retentionDays: number;
}

// 全設定の統合型
export interface AllSettings {
  clinic_basic: ClinicBasicSettings;
  clinic_hours: ClinicHoursSettings;
  booking_calendar: BookingCalendarSettings;
  communication: CommunicationSettings;
  system_security: SystemSecuritySettings;
  system_backup: SystemBackupSettings;
  services_pricing: ServicesPricingSettings;
  insurance_billing: InsuranceBillingSettings;
  data_management: DataManagementSettings;
}

// API レスポンス型
export interface SettingsApiResponse<T> {
  success: boolean;
  settings?: T;
  updated_at?: string | null;
  updated_by?: string | null;
  error?: string;
}

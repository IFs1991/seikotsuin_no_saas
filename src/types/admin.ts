// 管理画面の共通型定義

export interface BaseSettings {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  savedMessage: string;
}

// スタッフ関連
export type StaffRole = 'admin' | 'manager' | 'therapist' | 'receptionist';
export type StaffStatus = 'active' | 'inactive' | 'pending';

export interface Staff extends BaseSettings {
  email: string;
  role: StaffRole;
  status: StaffStatus;
  joinDate: string;
  permissions: string[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

// サービス関連
export type ServiceCategory =
  | 'treatment'
  | 'massage'
  | 'rehabilitation'
  | 'other';
export type ProductCategory =
  | 'supplement'
  | 'equipment'
  | 'accessory'
  | 'other';

export interface Service extends BaseSettings {
  description: string;
  duration: number;
  price: number;
  insuranceApplicable: boolean;
  category: ServiceCategory;
}

export interface Product extends BaseSettings {
  description: string;
  price: number;
  stock: number;
  category: ProductCategory;
}

export interface Package extends BaseSettings {
  description: string;
  sessions: number;
  originalPrice: number;
  discountedPrice: number;
  validityPeriod: number;
  services: string[];
}

// 保険関連
export interface InsuranceType extends BaseSettings {
  code: string;
  coPaymentRate: number;
  maxAmount?: number;
}

// 予約関連
export interface TimeSlot {
  start: string;
  end: string;
}

export interface DaySchedule {
  isOpen: boolean;
  timeSlots: TimeSlot[];
}

export interface WeekSchedule {
  [key: string]: DaySchedule;
}

export interface BookingSettings {
  slotDuration: number;
  maxAdvanceBooking: number;
  minAdvanceBooking: number;
  maxSimultaneousBookings: number;
  allowCancellation: boolean;
  cancellationDeadline: number;
  weekStartsOn: 0 | 1;
  defaultView: 'day' | 'week' | 'month';
}

// 通信関連
export type EmailTemplateType =
  | 'booking_confirmation'
  | 'reminder'
  | 'cancellation'
  | 'followup';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: EmailTemplateType;
}

// システム関連
export interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    expiryDays: number;
  };
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginAttempts: number;
  lockoutDuration: number;
}

export interface BackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  retentionDays: number;
  cloudStorage: boolean;
  storageProvider: 'aws' | 'gcp' | 'azure';
}

// データ管理関連
export interface ImportSettings {
  csvEncoding: string;
  dateFormat: string;
  allowDuplicates: boolean;
  validateData: boolean;
  skipFirstRow: boolean;
}

export interface ExportSettings {
  defaultFormat: 'csv' | 'excel' | 'pdf';
  includeHeaders: boolean;
  dateFormat: string;
  encoding: string;
  maxRecords: number;
}

export interface MasterData {
  id: string;
  type: string;
  name: string;
  items: number;
  lastUpdated: string;
}

// ========================================
// 新しい型定義（改善版）
// ========================================

// APIレスポンス型
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: ValidationError[];
}

// ページネーション型
export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// テーブル設定型
export interface TableColumn {
  type:
    | 'string'
    | 'integer'
    | 'decimal'
    | 'boolean'
    | 'text'
    | 'timestamp'
    | 'uuid'
    | 'json';
  label?: string;
  required?: boolean;
  readonly?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  precision?: number;
  foreign_key?: string;
  default?: unknown;
  nullable?: boolean;
}

export interface TableConfig {
  name: string;
  displayName?: string;
  columns: Record<string, TableColumn>;
}

// テーブルリスト項目型
export interface TableListItem {
  table_name: string;
  display_name: string;
  columns: number;
}

// 汎用テーブルデータ型
export interface TableData {
  id: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// マスターデータ詳細型
export interface MasterDataDetail {
  id: string;
  clinic_id: string | null;
  name: string;
  category: string;
  value: unknown;
  data_type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  description?: string;
  is_editable: boolean;
  is_public: boolean;
  display_order: number;
  updated_at?: string;
  updated_by?: string;
}

// フォーム関連型
export interface FormField {
  name: string;
  type: TableColumn['type'];
  label: string;
  required: boolean;
  readonly: boolean;
  value: unknown;
  error?: string;
}

export type FormMode = 'create' | 'edit';

export interface FormState {
  mode: FormMode;
  data: Record<string, unknown>;
  errors: Record<string, string>;
  isSubmitting: boolean;
}

// ソート関連型
export type SortOrder = 'asc' | 'desc';

export interface SortState {
  sortBy: string;
  sortOrder: SortOrder;
}

// フィルター関連型
export interface FilterState {
  search: string;
  category?: string;
  clinicId?: string;
  isPublic?: boolean;
}

// エラー型
export interface ValidationError {
  field?: string;
  message: string;
  code?: string;
  path?: string[];
}

export interface ApiError {
  message: string;
  details?: ValidationError[];
  status?: number;
}

// アクション型
export type TableAction = 'create' | 'update' | 'delete' | 'view';

// 権限関連型
export interface UserProfile {
  id: string;
  role: 'admin' | 'staff' | 'therapist';
  clinic_id?: string;
}

export interface AuthState {
  user: any; // Supabaseのユーザー型
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// コンポーネントProps型
export interface TableSelectorProps {
  tableList: TableListItem[];
  selectedTable: string;
  onTableSelect: (tableName: string) => void;
  loading: boolean;
}

export interface DataTableProps {
  data: TableData[];
  config: TableConfig | null;
  loading: boolean;
  pagination: PaginationState;
  sortState: SortState;
  onEdit: (item: TableData) => void;
  onDelete: (id: string, name: string) => void;
  onPageChange: (page: number) => void;
  onSort: (column: string) => void;
  onSearch: (term: string) => void;
}

export interface DataFormDialogProps {
  open: boolean;
  mode: FormMode;
  formData: Record<string, unknown>;
  config: TableConfig | null;
  loading: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  onClose: () => void;
  onFieldChange: (name: string, value: unknown) => void;
}

// フック戻り値型
export interface UseTableManagerReturn {
  // データ状態
  tableData: TableData[];
  tableList: TableListItem[];
  tableConfig: TableConfig | null;
  currentTable: string;

  // UI状態
  loading: boolean;
  error: string | null;
  pagination: PaginationState;
  sortState: SortState;
  filterState: FilterState;

  // アクション
  setCurrentTable: (tableName: string) => void;
  fetchTableList: () => Promise<void>;
  fetchTableData: (tableName?: string) => Promise<void>;
  createTableData: (data: Record<string, unknown>) => Promise<boolean>;
  updateTableData: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<boolean>;
  deleteTableData: (id: string) => Promise<boolean>;

  // フィルター・ソート
  setSearch: (term: string) => void;
  setSortState: (sortBy: string, sortOrder: SortOrder) => void;
  setPage: (page: number) => void;

  // リセット
  resetState: () => void;
}

export interface UseSystemSettingsReturn {
  // データ状態
  masterData: MasterDataDetail[];
  categories: string[];

  // UI状態
  loading: boolean;
  error: string | null;
  filterState: FilterState;

  // アクション
  fetchMasterData: (filters?: Partial<FilterState>) => Promise<void>;
  createMasterData: (data: Partial<MasterDataDetail>) => Promise<boolean>;
  updateMasterData: (
    id: string,
    data: Partial<MasterDataDetail>
  ) => Promise<boolean>;
  deleteMasterData: (id: string) => Promise<boolean>;

  // フィルター
  setFilter: (filter: Partial<FilterState>) => void;
  resetFilter: () => void;
}

// ユーティリティ型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireOnly<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export type TableDataWithoutMeta<T extends TableData> = Omit<
  T,
  'id' | 'created_at' | 'updated_at'
>;

// イベント型
export interface TableEvent<T = unknown> {
  type: TableAction;
  tableName: string;
  data: T;
  timestamp: Date;
}

export interface ErrorEvent {
  type: 'validation' | 'network' | 'server' | 'auth';
  message: string;
  details?: unknown;
  timestamp: Date;
}

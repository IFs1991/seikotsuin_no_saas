// Database Table Types
export interface Clinic {
  id: string;
  name: string;
  address: string;
  phone: string;
  manager_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Staff {
  id: string;
  clinic_id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  hire_date: Date;
  certifications: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  birth_date: Date;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email: string;
  address: string;
  medical_history: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Visit {
  id: string;
  clinic_id: string;
  patient_id: string;
  staff_id: string;
  visit_date: Date;
  treatment_menu_id: string;
  payment_method_id: string;
  amount: number;
  notes: string;
  created_at: Date;
}

export interface Revenue {
  id: string;
  clinic_id: string;
  date: Date;
  insurance_revenue: number;
  private_revenue: number;
  total_patients: number;
  created_at: Date;
  updated_at: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Component Props Types
export interface DashboardProps {
  clinicId: string;
  dateRange: DateRange;
  viewMode: 'daily' | 'weekly' | 'monthly';
}

export interface ChartProps {
  data: ChartData;
  options?: ChartOptions;
  height?: number;
  width?: number;
}

// User Permission Types
export type UserRole = 'admin' | 'manager' | 'staff' | 'practitioner';

export interface UserPermissions {
  role: UserRole;
  allowedActions: string[];
  clinicAccess: string[];
  dataAccess: DataAccessLevel;
}

export type DataAccessLevel = 'full' | 'limited' | 'readonly';

// Revenue Data Types
export interface RevenueData {
  id: string;
  clinic_id: string;
  date: string;
  amount: number;
  menu_id?: string;
  menu_name?: string;
  created_at: string;
}

export interface RevenueTrend {
  date: string;
  amount: number;
  trend: 'up' | 'down' | 'stable';
  change_percentage: number;
}

export interface MenuRevenue {
  menu_id: string;
  menu_name: string;
  total_revenue: number;
  transaction_count: number;
  average_price: number;
}

// Form Data Types
export interface DailyReportForm {
  date: Date;
  clinicId: string;
  staffId: string;
  treatments: TreatmentEntry[];
  totalRevenue: number;
  notes: string;
}

export interface TreatmentEntry {
  menuId: string;
  patientId: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
}

// Chart Data Types
export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface ChartScales {
  x?: unknown;
  y?: unknown;
}

export interface ChartPlugins {
  legend?: unknown;
  tooltip?: unknown;
}

export interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  scales?: ChartScales;
  plugins?: ChartPlugins;
}

// Error Types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface SystemError extends Error {
  code: string;
  severity: 'low' | 'medium' | 'high';
  context?: Record<string, unknown>;
}

// Utility Types
export type DateRange = {
  start: Date;
  end: Date;
};

export type Optional<T> = {
  [P in keyof T]?: T[P];
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type StaffRole = 'manager' | 'practitioner' | 'receptionist' | 'admin';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type TreatmentStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// AI Comment Types
export interface AIComment {
  id: string;
  clinic_id?: string;
  date: string;
  summary: string;
  highlights: string[];
  improvements: string[];
  suggestions: string[];
  created_at: string;
}

export interface AICommentCardProps {
  comment: AIComment;
  className?: string;
}

// Filter and Settings Types
export interface FilterState {
  search: string;
  category: string;
  clinicId: string;
  isPublic: boolean;
}

export interface MasterData {
  id: string;
  clinic_id?: string | null;
  name: string;
  category: string;
  value: unknown;
  data_type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  description?: string;
  is_editable: boolean;
  is_public: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface MasterDataDetail extends MasterData {
  // Additional fields specific to detailed view
}

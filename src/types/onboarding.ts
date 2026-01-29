/**
 * オンボーディング機能の型定義
 */

// オンボーディングステップ
export type OnboardingStep =
  | 'profile'
  | 'clinic'
  | 'invites'
  | 'seed'
  | 'completed';

// オンボーディング状態
export interface OnboardingState {
  id: string;
  user_id: string;
  clinic_id: string | null;
  current_step: OnboardingStep;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ステップ情報（UI用）
export interface StepInfo {
  key: OnboardingStep;
  title: string;
  description: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

// APIレスポンス型
export interface OnboardingStatusResponse {
  success: boolean;
  data?: {
    current_step: OnboardingStep;
    completed: boolean;
    clinic_id?: string | null;
  };
  error?: string;
}

export interface ProfileUpdateResponse {
  success: boolean;
  data?: {
    next_step: OnboardingStep;
  };
  error?: string;
  details?: unknown;
}

export interface ClinicCreateResponse {
  success: boolean;
  data?: {
    clinic_id: string;
    next_step: OnboardingStep;
  };
  error?: string;
  details?: unknown;
}

export interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
}

export interface InvitesResponse {
  success: boolean;
  data?: {
    results: InviteResult[];
    next_step: OnboardingStep;
  };
  error?: string;
  details?: unknown;
}

export interface SeedResponse {
  success: boolean;
  data?: {
    completed: boolean;
  };
  error?: string;
  details?: unknown;
}

// フォーム入力型
export interface ProfileFormData {
  full_name: string;
  phone_number?: string;
}

export interface ClinicFormData {
  name: string;
  address?: string;
  phone_number?: string;
  opening_date?: string;
}

// ロール定義（スキーマと一致）
export type StaffRole =
  | 'admin'
  | 'clinic_admin'
  | 'therapist'
  | 'staff'
  | 'manager';

// ロール表示名マッピング
export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '管理者',
  clinic_admin: 'クリニック管理者',
  therapist: '施術者',
  staff: 'スタッフ',
  manager: 'マネージャー',
};

export interface StaffInvite {
  email: string;
  role: StaffRole;
}

export interface InvitesFormData {
  invites: StaffInvite[];
}

export interface TreatmentMenu {
  name: string;
  price: number;
  description?: string;
}

export interface SeedFormData {
  treatment_menus: TreatmentMenu[];
  payment_methods: string[];
  patient_types: string[];
}

// フック戻り値型
export interface UseOnboardingReturn {
  // 状態
  status: OnboardingStatusResponse['data'] | null;
  isLoading: boolean;
  error: string | null;

  // アクション
  fetchStatus: () => Promise<void>;
  updateProfile: (data: ProfileFormData) => Promise<ProfileUpdateResponse>;
  createClinic: (data: ClinicFormData) => Promise<ClinicCreateResponse>;
  inviteStaff: (data: InvitesFormData) => Promise<InvitesResponse>;
  seedMaster: (data: SeedFormData) => Promise<SeedResponse>;

  // ナビゲーション
  goToStep: (step: OnboardingStep) => void;
  skipCurrentStep: () => Promise<void>;
}

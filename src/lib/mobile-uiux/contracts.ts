import type { AdminUserRole } from '@/lib/constants/roles';
import type { DashboardData, PatientAnalysisData } from '@/types/api';
import type { SettingsCategory } from '@/lib/admin-settings/defaults';
import type { DailyReportsReadModel } from '@/lib/daily-reports/read-model';
import type { ReservationListItem } from '@/lib/reservations/read-model';
import type { Menu } from '@/types/reservation';

export type MobileUiuxDisplayMode = 'desktop' | 'mobile' | 'system';

export type MobileUiuxApiSuccess<T> = {
  success: true;
  data: T;
  generatedAt: string;
};

export type MobileUiuxApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type MobileUiuxPublicFlags = {
  enabled: boolean;
  realDataEnabled: boolean;
  writeEnabled: boolean;
  reservationWriteEnabled: boolean;
  dailyReportWriteEnabled: boolean;
  settingsWriteEnabled: boolean;
};

export type MobileUiuxContextResponse = {
  role: {
    canonical: AdminUserRole;
    label: string;
  };
  defaultClinicId: string;
  accessibleClinicIds: string[];
  displayMode: MobileUiuxDisplayMode;
  flags: MobileUiuxPublicFlags;
};

export type MobileUiuxHomeResponse = {
  clinicId: string;
  date: string;
  timezone: 'Asia/Tokyo';
  dashboard: DashboardData;
};

export type MobileUiuxReservationsResponse = {
  clinicId: string;
  date: string;
  timezone: 'Asia/Tokyo';
  reservations: ReservationListItem[];
};

export type MobileUiuxPatientAnalysisResponse = {
  clinicId: string;
  analysis: PatientAnalysisData;
};

export type MobileUiuxDailyReportsResponse = {
  clinicId: string;
  startDate: string | null;
  endDate: string | null;
  dailyReports: DailyReportsReadModel;
};

export type MobileUiuxSettingsResponse = {
  clinicId: string;
  category: SettingsCategory;
  settings: Record<string, unknown>;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type MobileUiuxSettingsWriteResponse = {
  clinicId: string;
  category: SettingsCategory;
  settings: Record<string, unknown>;
  updatedAt: string | null;
  message: string;
};

export type MobileUiuxSettingsDetailResource = {
  id: string;
  name: string;
  type: string;
  workingHours: Record<string, unknown>;
  supportedMenus: string[];
  maxConcurrent: number;
  nominationFee: number;
  isActive: boolean;
  isBookable: boolean;
};

export type MobileUiuxSettingsDetailResponse = {
  clinicId: string;
  clinic: {
    id: string;
    name: string;
    address: string | null;
    phoneNumber: string | null;
  } | null;
  menus: Menu[];
  resources: MobileUiuxSettingsDetailResource[];
};

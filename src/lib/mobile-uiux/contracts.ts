import type { AdminUserRole } from '@/lib/constants/roles';

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

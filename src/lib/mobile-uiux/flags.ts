import {
  ADMIN_USER_ROLE_VALUES,
  isAdminUserRole,
  type Role,
} from '@/lib/constants/roles';

export type MobileUiuxFlags = {
  enabled: boolean;
  useDbEntitlements: boolean;
  realDataEnabled: boolean;
  writeEnabled: boolean;
  reservationWriteEnabled: boolean;
  dailyReportWriteEnabled: boolean;
  settingsWriteEnabled: boolean;
  allowedClinicIds: string[];
  allowedRoles: Role[];
};

export type MobileUiuxWriteTarget = 'reservation' | 'dailyReport' | 'settings';

export type MobileUiuxEntitlementFlags = {
  enabled: boolean;
  realDataEnabled: boolean;
  writeEnabled: boolean;
  reservationWriteEnabled: boolean;
  dailyReportWriteEnabled: boolean;
  settingsWriteEnabled: boolean;
};

const DEFAULT_ALLOWED_ROLES: Role[] = [...ADMIN_USER_ROLE_VALUES];

function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

function parseAllowedRoles(value: string | undefined): Role[] {
  const parsedRoles = parseCsv(value).filter(isAdminUserRole);
  return value === undefined ? DEFAULT_ALLOWED_ROLES : parsedRoles;
}

export function getMobileUiuxFlags(): MobileUiuxFlags {
  return {
    enabled: isEnabled(process.env.MOBILE_UIUX_ENABLED),
    useDbEntitlements: isEnabled(process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS),
    realDataEnabled: isEnabled(process.env.MOBILE_UIUX_REAL_DATA_ENABLED),
    writeEnabled: isEnabled(process.env.MOBILE_UIUX_WRITE_ENABLED),
    reservationWriteEnabled: isEnabled(
      process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED
    ),
    dailyReportWriteEnabled: isEnabled(
      process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED
    ),
    settingsWriteEnabled: isEnabled(
      process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED
    ),
    allowedClinicIds: parseCsv(process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS),
    allowedRoles: parseAllowedRoles(process.env.MOBILE_UIUX_ALLOWED_ROLES),
  };
}

export function areMobileUiuxWritesEnabled(
  flags: MobileUiuxFlags,
  target: MobileUiuxWriteTarget,
  entitlement?: MobileUiuxEntitlementFlags | null
): boolean {
  if (
    !flags.writeEnabled ||
    !isMobileUiuxEntitlementWriteEnabled(entitlement)
  ) {
    return false;
  }

  switch (target) {
    case 'reservation':
      return (
        flags.reservationWriteEnabled &&
        isMobileUiuxTargetEntitlementEnabled(
          entitlement,
          'reservationWriteEnabled'
        )
      );
    case 'dailyReport':
      return (
        flags.dailyReportWriteEnabled &&
        isMobileUiuxTargetEntitlementEnabled(
          entitlement,
          'dailyReportWriteEnabled'
        )
      );
    case 'settings':
      return (
        flags.settingsWriteEnabled &&
        isMobileUiuxTargetEntitlementEnabled(
          entitlement,
          'settingsWriteEnabled'
        )
      );
  }
}

export function areMobileUiuxRealDataReadsEnabled(
  flags: MobileUiuxFlags,
  entitlement?: MobileUiuxEntitlementFlags | null
): boolean {
  return (
    flags.enabled &&
    flags.realDataEnabled &&
    isMobileUiuxEntitlementReadEnabled(entitlement)
  );
}

function isMobileUiuxEntitlementReadEnabled(
  entitlement: MobileUiuxEntitlementFlags | null | undefined
): boolean {
  return entitlement === undefined
    ? true
    : entitlement !== null &&
        entitlement.enabled &&
        entitlement.realDataEnabled;
}

function isMobileUiuxEntitlementWriteEnabled(
  entitlement: MobileUiuxEntitlementFlags | null | undefined
): boolean {
  return entitlement === undefined
    ? true
    : entitlement !== null &&
        entitlement.enabled &&
        entitlement.realDataEnabled &&
        entitlement.writeEnabled;
}

function isMobileUiuxTargetEntitlementEnabled(
  entitlement: MobileUiuxEntitlementFlags | null | undefined,
  key: keyof Pick<
    MobileUiuxEntitlementFlags,
    | 'reservationWriteEnabled'
    | 'dailyReportWriteEnabled'
    | 'settingsWriteEnabled'
  >
): boolean {
  return entitlement === undefined ? true : entitlement[key];
}

import { normalizeRole } from '@/lib/constants/roles';

export const MOBILE_UIUX_ENTRY_PATHS = {
  home: '/mobile-uiux/screens/home',
  reservations: '/mobile-uiux/screens/reservations',
} as const;

export const MOBILE_UIUX_NAV_PATH_BY_TARGET = {
  home: '/mobile-uiux/screens/home',
  reservations: '/mobile-uiux/screens/reservations',
  patients: '/mobile-uiux/screens/patients',
  'daily-reports': '/mobile-uiux/screens/daily-reports',
  settings: '/mobile-uiux/screens/settings',
} as const;

export type MobileUiuxNavTarget = keyof typeof MOBILE_UIUX_NAV_PATH_BY_TARGET;

const MANAGER_SIDE_ROLES = ['admin', 'clinic_admin', 'manager'] as const;
const STAFF_SIDE_ROLES = ['therapist', 'staff'] as const;

export const MOBILE_UIUX_SCREEN_TARGETS_BY_ROLE = {
  admin: [
    'home',
    'reservations',
    'patients',
    'daily-reports',
    'settings',
    'settings-detail',
  ],
  clinic_admin: [
    'home',
    'reservations',
    'patients',
    'daily-reports',
    'settings',
    'settings-detail',
  ],
  manager: [
    'home',
    'reservations',
    'patients',
    'daily-reports',
    'settings',
    'settings-detail',
  ],
  therapist: ['reservations', 'patients', 'daily-reports', 'settings'],
  staff: ['reservations', 'patients', 'daily-reports', 'settings'],
} as const satisfies Record<string, readonly string[]>;

export const MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE = {
  admin: ['home', 'reservations', 'patients', 'daily-reports', 'settings'],
  clinic_admin: [
    'home',
    'reservations',
    'patients',
    'daily-reports',
    'settings',
  ],
  manager: ['home', 'reservations', 'patients', 'daily-reports', 'settings'],
  therapist: ['reservations', 'patients', 'daily-reports', 'settings'],
  staff: ['reservations', 'patients', 'daily-reports', 'settings'],
} as const satisfies Record<string, readonly MobileUiuxNavTarget[]>;

export function resolveMobileUiuxEntryPath(
  role: string | null | undefined
): string | null {
  const normalizedRole = normalizeRole(role);

  if (MANAGER_SIDE_ROLES.some(candidate => candidate === normalizedRole)) {
    return MOBILE_UIUX_ENTRY_PATHS.home;
  }

  if (STAFF_SIDE_ROLES.some(candidate => candidate === normalizedRole)) {
    return MOBILE_UIUX_ENTRY_PATHS.reservations;
  }

  return null;
}

export function canRoleAccessMobileUiuxScreen(
  role: string | null | undefined,
  screen: string
): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }

  const allowedScreens = MOBILE_UIUX_SCREEN_TARGETS_BY_ROLE[normalizedRole];
  return Boolean(allowedScreens?.includes(screen));
}

export function canRoleNavigateToMobileUiuxTarget(
  role: string | null | undefined,
  target: MobileUiuxNavTarget
): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    return false;
  }

  const allowedTargets = MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE[normalizedRole];
  return Boolean(allowedTargets?.includes(target));
}

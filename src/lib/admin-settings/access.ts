import { normalizeRole } from '@/lib/constants/roles';
import type { SettingsCategory } from '@/lib/admin-settings/defaults';

export const AREA_MANAGER_SETTINGS_CATEGORIES = [
  'clinic_basic',
  'clinic_hours',
  'booking_calendar',
  'communication',
  'services_pricing',
  'insurance_billing',
] as const satisfies readonly SettingsCategory[];

const AREA_MANAGER_SETTINGS_CATEGORY_SET: ReadonlySet<SettingsCategory> =
  new Set(AREA_MANAGER_SETTINGS_CATEGORIES);

export function isAreaManagerSettingsCategory(
  category: SettingsCategory
): boolean {
  return AREA_MANAGER_SETTINGS_CATEGORY_SET.has(category);
}

export function canReadAdminSettingsCategory(
  role: string | null | undefined,
  category: SettingsCategory
): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'manager'
    ? isAreaManagerSettingsCategory(category)
    : true;
}

export function canManageAdminSettingsCategory(
  role: string | null | undefined,
  category: SettingsCategory
): boolean {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin' || normalizedRole === 'clinic_admin') {
    return true;
  }

  return (
    normalizedRole === 'manager' && isAreaManagerSettingsCategory(category)
  );
}

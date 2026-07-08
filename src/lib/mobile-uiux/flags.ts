import 'server-only';

const DEFAULT_ALLOWED_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
] as const;

export interface MobileUiuxFlags {
  enabled: boolean;
  allowedClinicIds: readonly string[];
  allowedRoles: readonly string[];
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0)
    )
  );
}

export function getMobileUiuxFlags(
  env: NodeJS.ProcessEnv = process.env
): MobileUiuxFlags {
  const configuredRoles = parseCsvList(env.MOBILE_UIUX_ALLOWED_ROLES);

  return {
    enabled: parseBooleanFlag(env.MOBILE_UIUX_ENABLED),
    allowedClinicIds: parseCsvList(env.MOBILE_UIUX_ALLOWED_CLINIC_IDS),
    allowedRoles:
      configuredRoles.length > 0
        ? configuredRoles
        : Array.from(DEFAULT_ALLOWED_ROLES),
  };
}

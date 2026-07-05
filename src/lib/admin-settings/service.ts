import { AuditLogger } from '@/lib/audit-logger';
import {
  CLINIC_ADMIN_ROLES,
  normalizeRole,
  type Role,
} from '@/lib/constants/roles';
import type { SupabaseServerClient } from '@/lib/supabase';
import {
  DEFAULT_SETTINGS,
  VALID_CATEGORIES,
  type SettingsCategory,
} from '@/lib/admin-settings/defaults';
import { CATEGORY_SCHEMAS } from '@/lib/admin-settings/schemas';
import { normalizeCommunicationSettings } from '@/lib/admin-settings/normalize';
import { normalizeBookingCalendarReminders } from '@/lib/booking-calendar/settings';
import { normalizeBookingFormSettings } from '@/lib/booking-form/settings';
import type { Json } from '@/types/supabase';

export const ADMIN_SETTINGS_MUTATION_ROLES: readonly Role[] =
  Array.from(CLINIC_ADMIN_ROLES);

export type AdminSettingsMutationPayload = {
  clinic_id: string;
  category: SettingsCategory;
  settings: Record<string, unknown>;
};

export type AdminSettingsMutationEnvelope = {
  clinic_id: string;
  category: SettingsCategory;
  settings: Record<string, unknown>;
};

export type AdminSettingsReadModel = {
  settings: Record<string, unknown>;
  updated_at: string | null;
  updated_by: string | null;
};

type AdminSettingsMutationValidationResult =
  | {
      success: true;
      payload: AdminSettingsMutationEnvelope;
    }
  | {
      success: false;
      status: 400;
      message: string;
      details?: unknown;
    };

type AdminSettingsPersistenceResult =
  | {
      success: true;
    }
  | {
      success: false;
      message: string;
    };

type AdminSettingsReadResult =
  | {
      success: true;
      data: AdminSettingsReadModel;
    }
  | {
      success: false;
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Json {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item));
  }

  if (isRecord(value)) {
    return toJsonObject(value);
  }

  return null;
}

function toJsonObject(value: Record<string, unknown>): {
  [key: string]: Json | undefined;
} {
  const output: { [key: string]: Json | undefined } = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = toJsonValue(item);
  }
  return output;
}

export function isSettingsCategory(value: string): value is SettingsCategory {
  return VALID_CATEGORIES.some(category => category === value);
}

export function readClinicIdFromAdminSettingsBody(
  body: unknown
): string | null {
  if (!isRecord(body)) {
    return null;
  }

  return typeof body.clinic_id === 'string' ? body.clinic_id : null;
}

function isMissingRowError(error: unknown): boolean {
  return isRecord(error) && error.code === 'PGRST116';
}

function normalizeSettings(
  category: SettingsCategory,
  settings: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (category === 'communication') {
    return normalizeCommunicationSettings(
      settings ?? DEFAULT_SETTINGS.communication
    );
  }

  if (category === 'booking_form') {
    return normalizeBookingFormSettings(
      settings ?? DEFAULT_SETTINGS.booking_form
    );
  }

  if (category === 'booking_calendar') {
    const base = settings ?? DEFAULT_SETTINGS.booking_calendar;
    return {
      ...DEFAULT_SETTINGS.booking_calendar,
      ...base,
      reminders: normalizeBookingCalendarReminders(base.reminders),
    };
  }

  return settings ?? DEFAULT_SETTINGS[category];
}

function isClinicSettingsReadRow(
  value: unknown
): value is AdminSettingsReadModel {
  return (
    isRecord(value) &&
    (isRecord(value.settings) || value.settings === null) &&
    (typeof value.updated_at === 'string' || value.updated_at === null) &&
    (typeof value.updated_by === 'string' || value.updated_by === null)
  );
}

export function validateAdminSettingsMutationBody(
  body: unknown
): AdminSettingsMutationValidationResult {
  if (!isRecord(body)) {
    return {
      success: false,
      status: 400,
      message: 'clinic_idは必須です',
    };
  }

  const clinicId = body.clinic_id;
  if (typeof clinicId !== 'string' || clinicId.length === 0) {
    return {
      success: false,
      status: 400,
      message: 'clinic_idは必須です',
    };
  }

  const category = body.category;
  if (typeof category !== 'string' || category.length === 0) {
    return {
      success: false,
      status: 400,
      message: 'categoryは必須です',
    };
  }

  if (!isSettingsCategory(category)) {
    return {
      success: false,
      status: 400,
      message: `不正なcategoryです。有効な値: ${VALID_CATEGORIES.join(', ')}`,
    };
  }

  const rawSettings = body.settings;
  if (!isRecord(rawSettings)) {
    return {
      success: false,
      status: 400,
      message: 'settingsは必須です',
    };
  }

  return {
    success: true,
    payload: {
      clinic_id: clinicId,
      category,
      settings: rawSettings,
    },
  };
}

export function validateAdminSettingsMutationSettings(
  envelope: AdminSettingsMutationEnvelope
): AdminSettingsMutationValidationResult {
  const { category, settings } = envelope;
  const schema = CATEGORY_SCHEMAS[category];
  const candidateSettings =
    category === 'communication'
      ? normalizeCommunicationSettings(settings)
      : settings;
  const parseResult = schema.safeParse(candidateSettings);

  if (!parseResult.success) {
    const errors = parseResult.error.flatten();
    const firstError =
      Object.values(errors.fieldErrors)[0]?.[0] ??
      errors.formErrors[0] ??
      '入力値にエラーがあります';
    return {
      success: false,
      status: 400,
      message: firstError,
      details: errors,
    };
  }

  const parsedSettings: unknown = parseResult.data;
  if (!isRecord(parsedSettings)) {
    return {
      success: false,
      status: 400,
      message: 'settingsは必須です',
    };
  }

  return {
    success: true,
    payload: {
      clinic_id: envelope.clinic_id,
      category,
      settings: parsedSettings,
    },
  };
}

export async function upsertAdminSettings(
  supabase: SupabaseServerClient,
  payload: AdminSettingsMutationPayload,
  updatedBy: string
): Promise<AdminSettingsPersistenceResult> {
  const { error } = await supabase.from('clinic_settings').upsert(
    {
      clinic_id: payload.clinic_id,
      category: payload.category,
      settings: toJsonObject(payload.settings),
      updated_by: updatedBy,
    },
    { onConflict: 'clinic_id,category' }
  );

  if (error) {
    return {
      success: false,
      message: '設定の保存に失敗しました',
    };
  }

  return { success: true };
}

export async function fetchAdminSettingsReadModel(
  supabase: SupabaseServerClient,
  clinicId: string,
  category: SettingsCategory
): Promise<AdminSettingsReadResult> {
  const { data, error } = await supabase
    .from('clinic_settings')
    .select('settings, updated_at, updated_by')
    .eq('clinic_id', clinicId)
    .eq('category', category)
    .single();

  if (error && !isMissingRowError(error)) {
    return {
      success: false,
      message: '設定の取得に失敗しました',
    };
  }

  const row = isClinicSettingsReadRow(data) ? data : null;

  return {
    success: true,
    data: {
      settings: normalizeSettings(category, row?.settings),
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    },
  };
}

export function logAdminSettingsMutation(params: {
  userId: string;
  userEmail: string;
  role: string | null | undefined;
  clinicId: string;
  category: SettingsCategory;
}) {
  void AuditLogger.logAdminAction(
    params.userId,
    params.userEmail,
    normalizeRole(params.role) === 'manager'
      ? 'manager_settings_update'
      : 'update_settings',
    undefined,
    {
      actor_role: normalizeRole(params.role),
      category: params.category,
      clinic_id: params.clinicId,
      settingsUpdated: true,
    }
  );
}

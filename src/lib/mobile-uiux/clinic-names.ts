import type { SupabaseClient } from '@supabase/supabase-js';

export type MobileUiuxClinicName = {
  id: string;
  name: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClinicNameRow(value: unknown): value is MobileUiuxClinicName {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

/**
 * Fetches clinic id/name pairs for the given clinic ids, preserving the
 * order of clinicIds where possible. Only active clinics are returned,
 * matching the PC accessible-clinics endpoint. Ids without a matching row
 * are omitted. Fail-closed: empty input or any error resolves to [].
 */
export async function fetchClinicNames(
  supabase: SupabaseClient,
  clinicIds: string[]
): Promise<MobileUiuxClinicName[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('id,name')
      .in('id', clinicIds)
      .eq('is_active', true);

    if (error || !data) {
      return [];
    }

    const rows = (data as unknown[]).filter(isClinicNameRow);
    const rowsById = new Map(rows.map(row => [row.id, row]));

    return clinicIds
      .map(id => rowsById.get(id))
      .filter((row): row is MobileUiuxClinicName => row !== undefined);
  } catch {
    return [];
  }
}

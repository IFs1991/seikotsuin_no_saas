import type { SupabaseClient } from '@supabase/supabase-js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolves the display name for the authenticated user from staff_profiles.
 * Fail-closed: any missing row, inactive row, query error, or thrown
 * exception resolves to null. Never falls back to email or any other PII.
 */
export async function resolveStaffDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('display_name,is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    if (!isRecord(data)) {
      return null;
    }

    const displayName = data.display_name;
    return typeof displayName === 'string' && displayName.length > 0
      ? displayName
      : null;
  } catch {
    return null;
  }
}

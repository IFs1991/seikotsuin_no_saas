import {
  AppError,
  ERROR_CODES,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import type { SupabaseServerClient } from '@/lib/supabase';

type SupabaseLike = {
  from: SupabaseServerClient['from'];
};

interface ClinicRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface TemplateOwnerScope {
  targetClinicId: string;
  targetClinicName: string;
  ownerClinicId: string;
  ownerClinicName: string;
  isOwnerClinic: boolean;
}

async function fetchClinic(
  supabase: SupabaseLike,
  clinicId: string,
  path: string
): Promise<ClinicRow> {
  const { data, error } = await supabase
    .from('clinics')
    .select('id, name, parent_id')
    .eq('id', clinicId)
    .single();

  if (error) throw normalizeSupabaseError(error, path);
  if (!data) {
    throw new AppError(
      ERROR_CODES.CLINIC_NOT_FOUND,
      'クリニックが見つかりません',
      404
    );
  }

  return data as ClinicRow;
}

export async function resolveTemplateOwnerScope(
  supabase: SupabaseLike,
  targetClinicId: string,
  path: string
): Promise<TemplateOwnerScope> {
  const targetClinic = await fetchClinic(supabase, targetClinicId, path);
  const ownerClinicId = targetClinic.parent_id ?? targetClinic.id;

  if (ownerClinicId === targetClinic.id) {
    return {
      targetClinicId: targetClinic.id,
      targetClinicName: targetClinic.name,
      ownerClinicId,
      ownerClinicName: targetClinic.name,
      isOwnerClinic: true,
    };
  }

  const ownerClinic = await fetchClinic(supabase, ownerClinicId, path);

  return {
    targetClinicId: targetClinic.id,
    targetClinicName: targetClinic.name,
    ownerClinicId,
    ownerClinicName: ownerClinic.name,
    isOwnerClinic: false,
  };
}

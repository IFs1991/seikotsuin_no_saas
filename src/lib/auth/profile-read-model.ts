import 'server-only';

import type { User } from '@supabase/supabase-js';

import {
  createAdminClient,
  type SupabaseServerClient,
  type UserAccessContext,
} from '@/lib/supabase';

export interface ProfileResponse {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  clinicName: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

async function fetchClinicNameFromClient(
  supabase: SupabaseServerClient,
  clinicId: string | null
): Promise<string | null> {
  if (!clinicId) {
    return null;
  }

  const { data, error } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', clinicId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch profile clinic name', error);
    return null;
  }

  return typeof data?.name === 'string' ? data.name : null;
}

export async function fetchClinicNameWithClient(
  supabase: SupabaseServerClient,
  clinicId: string | null
): Promise<string | null> {
  return await fetchClinicNameFromClient(supabase, clinicId);
}

export async function fetchClinicName(
  clinicId: string | null
): Promise<string | null> {
  return await fetchClinicNameFromClient(createAdminClient(), clinicId);
}

export function buildProfileResponse(params: {
  user: Pick<User, 'id' | 'email'>;
  accessContext: UserAccessContext;
  clinicName: string | null;
}): ProfileResponse {
  return {
    id: params.user.id,
    email: params.user.email ?? null,
    role: params.accessContext.normalizedRole,
    clinicId: params.accessContext.clinicId,
    clinicName: params.clinicName,
    isActive: params.accessContext.isActive,
    isAdmin: params.accessContext.isAdmin,
  };
}

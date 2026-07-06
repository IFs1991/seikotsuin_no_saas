import { verifyLineIdTokenForClinic } from '@/lib/line/id-token';
import type { SupabaseServerClient } from '@/lib/supabase';

export type PublicLineMyPageAuthResult =
  | {
      ok: true;
      lineUserId: string;
      displayName: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

export function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization');
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
}

export async function verifyPublicLineMyPageAuth(params: {
  headers: Headers;
  supabase: Pick<SupabaseServerClient, 'from'>;
  clinicId: string;
}): Promise<PublicLineMyPageAuthResult> {
  const idToken = readBearerToken(params.headers);
  if (!idToken) {
    return { ok: false, reason: 'missing_line_id_token' };
  }

  const verification = await verifyLineIdTokenForClinic({
    supabase: params.supabase,
    clinicId: params.clinicId,
    idToken,
  });

  if (verification.ok === false) {
    return { ok: false, reason: verification.reason };
  }

  return {
    ok: true,
    lineUserId: verification.lineUserId,
    displayName: verification.displayName,
  };
}

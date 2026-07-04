import { NextRequest } from 'next/server';

import { ROLE_LABELS, normalizeRole } from '@/lib/constants/roles';
import { evaluateMobileUiuxPrincipal } from '@/lib/mobile-uiux/access';
import { resolveMobileUiuxRolloutWithEntitlements } from '@/lib/mobile-uiux/entitlements';
import {
  type MobileUiuxContextResponse,
  type MobileUiuxDisplayMode,
} from '@/lib/mobile-uiux/contracts';
import { getMobileUiuxFlags } from '@/lib/mobile-uiux/flags';
import { resolveStaffDisplayName } from '@/lib/mobile-uiux/identity';
import { fetchClinicNames } from '@/lib/mobile-uiux/clinic-names';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  logMobileUiuxDeniedAccess,
  mapMobileUiuxPrincipalDeniedReason,
  mapMobileUiuxRolloutDeniedReason,
} from '@/lib/mobile-uiux/route-utils';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISPLAY_MODE_COOKIE = 'mobile_uiux_display_mode';

function resolveDisplayMode(request: NextRequest): MobileUiuxDisplayMode {
  const mode = request.cookies.get(DISPLAY_MODE_COOKIE)?.value;

  if (mode === 'desktop' || mode === 'mobile' || mode === 'system') {
    return mode;
  }

  return 'system';
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled) {
    logMobileUiuxDeniedAccess({
      reasonCode: 'flag_disabled',
      role: null,
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount: 0,
      writeTarget: 'context',
      featureFlagEnabled: false,
    });
    return buildMobileUiuxFailure(
      403,
      'FORBIDDEN',
      'モバイル UI/UX は無効です'
    );
  }

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    return buildMobileUiuxFailure(401, 'UNAUTHORIZED', '認証が必要です');
  }

  const accessContext = await getUserAccessContext(user.id, supabase, {
    user,
  });
  const principalDecision = evaluateMobileUiuxPrincipal(
    accessContext.permissions,
    flags
  );

  if (principalDecision.allowed === false) {
    logMobileUiuxDeniedAccess({
      reasonCode: mapMobileUiuxPrincipalDeniedReason(principalDecision.reason),
      role: normalizeRole(accessContext.permissions?.role),
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount:
        resolveScopedClinicIds(accessContext.permissions)?.length ?? 0,
      writeTarget: 'context',
      featureFlagEnabled: flags.enabled,
    });
    return buildMobileUiuxFailure(
      principalDecision.status,
      'FORBIDDEN',
      'このモバイル UI/UX へのアクセス権限がありません'
    );
  }

  const rolloutDecision = await resolveMobileUiuxRolloutWithEntitlements({
    supabase,
    principal: principalDecision,
    flags,
  });

  if (rolloutDecision.allowed === false) {
    logMobileUiuxDeniedAccess({
      reasonCode: mapMobileUiuxRolloutDeniedReason(rolloutDecision.reason),
      role: normalizeRole(accessContext.permissions?.role),
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount:
        resolveScopedClinicIds(accessContext.permissions)?.length ?? 0,
      writeTarget: 'context',
      featureFlagEnabled: rolloutDecision.publicFlags.enabled,
    });
    return buildMobileUiuxFailure(
      rolloutDecision.status,
      'FORBIDDEN',
      'このモバイル UI/UX へのアクセス権限がありません'
    );
  }

  const contextClinicId = accessContext.clinicId;
  const defaultClinicId =
    contextClinicId && rolloutDecision.clinicIds.includes(contextClinicId)
      ? contextClinicId
      : rolloutDecision.clinicIds[0];

  const [displayName, accessibleClinics] = await Promise.all([
    resolveStaffDisplayName(supabase, user.id),
    fetchClinicNames(supabase, rolloutDecision.clinicIds),
  ]);

  const data: MobileUiuxContextResponse = {
    role: {
      canonical: rolloutDecision.role,
      label: ROLE_LABELS[rolloutDecision.role],
    },
    defaultClinicId,
    accessibleClinicIds: rolloutDecision.clinicIds,
    displayMode: resolveDisplayMode(request),
    flags: rolloutDecision.publicFlags,
    displayName,
    accessibleClinics,
  };

  return buildMobileUiuxSuccess(data);
}

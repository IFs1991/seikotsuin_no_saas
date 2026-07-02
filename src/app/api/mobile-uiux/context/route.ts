import { NextRequest } from 'next/server';

import { ROLE_LABELS, normalizeRole } from '@/lib/constants/roles';
import { evaluateMobileUiuxAccess } from '@/lib/mobile-uiux/access';
import {
  type MobileUiuxContextResponse,
  type MobileUiuxDisplayMode,
  type MobileUiuxPublicFlags,
} from '@/lib/mobile-uiux/contracts';
import {
  getMobileUiuxFlags,
  type MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  logMobileUiuxDeniedAccess,
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

function toPublicFlags(flags: MobileUiuxFlags): MobileUiuxPublicFlags {
  return {
    enabled: flags.enabled,
    realDataEnabled: flags.realDataEnabled,
    writeEnabled: flags.writeEnabled,
    reservationWriteEnabled: flags.reservationWriteEnabled,
    dailyReportWriteEnabled: flags.dailyReportWriteEnabled,
    settingsWriteEnabled: flags.settingsWriteEnabled,
  };
}

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
      reasonCode: 'feature_disabled',
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
  const accessDecision = evaluateMobileUiuxAccess(
    accessContext.permissions,
    flags
  );

  if (accessDecision.allowed === false) {
    logMobileUiuxDeniedAccess({
      reasonCode: accessDecision.reason,
      role: normalizeRole(accessContext.permissions?.role),
      allowedClinicCount: flags.allowedClinicIds.length,
      scopedClinicCount:
        resolveScopedClinicIds(accessContext.permissions)?.length ?? 0,
      writeTarget: 'context',
      featureFlagEnabled: flags.enabled,
    });
    return buildMobileUiuxFailure(
      accessDecision.status,
      'FORBIDDEN',
      'このモバイル UI/UX へのアクセス権限がありません'
    );
  }

  const data: MobileUiuxContextResponse = {
    role: {
      canonical: accessDecision.role,
      label: ROLE_LABELS[accessDecision.role],
    },
    defaultClinicId: accessContext.clinicId ?? accessDecision.clinicIds[0],
    accessibleClinicIds: accessDecision.clinicIds,
    displayMode: resolveDisplayMode(request),
    flags: toPublicFlags(flags),
  };

  return buildMobileUiuxSuccess(data);
}

import { NextRequest, NextResponse } from 'next/server';

import { ROLE_LABELS } from '@/lib/constants/roles';
import { evaluateMobileUiuxAccess } from '@/lib/mobile-uiux/access';
import {
  type MobileUiuxApiFailure,
  type MobileUiuxApiSuccess,
  type MobileUiuxContextResponse,
  type MobileUiuxDisplayMode,
  type MobileUiuxPublicFlags,
} from '@/lib/mobile-uiux/contracts';
import {
  getMobileUiuxFlags,
  type MobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISPLAY_MODE_COOKIE = 'mobile_uiux_display_mode';

function buildFailure(
  status: number,
  code: string,
  message: string
): NextResponse<MobileUiuxApiFailure> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

function buildSuccess<T>(data: T): NextResponse<MobileUiuxApiSuccess<T>> {
  return NextResponse.json({
    success: true,
    data,
    generatedAt: new Date().toISOString(),
  });
}

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
    return buildFailure(403, 'FORBIDDEN', 'モバイル UI/UX は無効です');
  }

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    return buildFailure(401, 'UNAUTHORIZED', '認証が必要です');
  }

  const accessContext = await getUserAccessContext(user.id, supabase, {
    user,
  });
  const accessDecision = evaluateMobileUiuxAccess(
    accessContext.permissions,
    flags
  );

  if (accessDecision.allowed === false) {
    return buildFailure(
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

  return buildSuccess(data);
}

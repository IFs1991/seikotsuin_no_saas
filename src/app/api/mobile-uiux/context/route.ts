import { NextRequest, NextResponse } from 'next/server';
import { checkMobileUiuxAccess } from '@/lib/mobile-uiux/access';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

export async function GET(request: NextRequest) {
  const accessResult = await checkMobileUiuxAccess(request, 'context');

  if (accessResult.allowed === false) {
    return NextResponse.json(
      {
        success: false,
        error: accessResult.message,
        reasonCode: accessResult.reasonCode,
      },
      {
        status: accessResult.status,
        headers: NO_STORE_HEADERS,
      }
    );
  }

  return NextResponse.json(
    {
      success: true,
      role: {
        canonical: accessResult.role,
      },
      clinicScope: {
        scopedClinicCount: accessResult.scopedClinicCount,
        allowedClinicCount: accessResult.allowedClinicCount,
      },
      publicFlags: {
        mobileUiuxEnabled: accessResult.featureFlagEnabled,
      },
      displayMode: request.cookies.get('displayMode')?.value ?? 'system',
    },
    {
      status: 200,
      headers: NO_STORE_HEADERS,
    }
  );
}

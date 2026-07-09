import { NextRequest } from 'next/server';

import { handleMobileUiuxScreenRequest } from '@/lib/mobile-uiux/screen-route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> }
) {
  return handleMobileUiuxScreenRequest(request, context, 'preview');
}

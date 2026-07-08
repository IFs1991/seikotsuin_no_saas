import { NextRequest, NextResponse } from 'next/server';
import { checkMobileUiuxAccess } from '@/lib/mobile-uiux/access';
import { loadMobileUiuxAsset } from '@/lib/mobile-uiux/assets';
import {
  createMobileUiuxAccessErrorResponse,
  createMobileUiuxErrorResponse,
  getMobileUiuxResourceKind,
} from '@/lib/mobile-uiux/responses';

type RouteContext = {
  params: Promise<{
    resource: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { resource } = await context.params;
  const resourceKind = getMobileUiuxResourceKind(resource);
  const accessResult = await checkMobileUiuxAccess(request, resource);

  if (accessResult.allowed === false) {
    return createMobileUiuxAccessErrorResponse(accessResult, resourceKind);
  }

  const asset = await loadMobileUiuxAsset(resource);
  if (!asset) {
    return createMobileUiuxErrorResponse({
      status: 404,
      reasonCode: 'resource_not_found',
      message: '指定されたモバイル画面が見つかりません',
      resourceKind,
    });
  }

  return new NextResponse(asset.content, {
    status: 200,
    headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

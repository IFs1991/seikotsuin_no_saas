import { NextRequest } from 'next/server';

import {
  AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE,
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';
import { buildAppBootstrap } from '@/lib/app-bootstrap/service';
import { ScopeNotConfiguredError } from '@/lib/supabase';
import { AppError } from '@/lib/error-handler';

const APP_BOOTSTRAP_ENDPOINT = '/api/app/bootstrap';
const PRIVATE_NO_STORE = 'private, no-store';

function withPrivateNoStore<TResponse extends Response>(
  response: TResponse
): TResponse {
  response.headers.set('Cache-Control', PRIVATE_NO_STORE);
  return response;
}

export async function GET(request: NextRequest) {
  const processResult = await processApiRequest(request, {
    allowedRoles: Array.from(STAFF_ROLES),
    requireClinicMatch: false,
  });

  if (!processResult.success) {
    return withPrivateNoStore(processResult.error);
  }

  try {
    const bootstrap = await buildAppBootstrap({
      subject: processResult.subject,
      accessContext: processResult.accessContext,
      supabase: processResult.supabase,
    });

    return withPrivateNoStore(createSuccessResponse(bootstrap));
  } catch (error) {
    logError(error, {
      endpoint: APP_BOOTSTRAP_ENDPOINT,
      method: 'GET',
      userId: processResult.auth.id,
    });

    if (error instanceof AppError && error.statusCode === 503) {
      return withPrivateNoStore(
        createErrorResponse(AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE, 503)
      );
    }

    if (error instanceof ScopeNotConfiguredError) {
      return withPrivateNoStore(
        createErrorResponse('アクセス権限がありません', 403)
      );
    }

    return withPrivateNoStore(
      createErrorResponse('アプリ初期情報の取得に失敗しました', 500)
    );
  }
}

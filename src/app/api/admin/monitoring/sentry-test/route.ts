import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';

import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import {
  createSentryTestEvent,
  isSentryEnabled,
} from '@/lib/monitoring/sentry';

export async function POST(request: NextRequest) {
  const processResult = await processApiRequest(request, {
    allowedRoles: Array.from(ADMIN_UI_ROLES),
  });

  if (!processResult.success) {
    return processResult.error;
  }

  if (!isSentryEnabled()) {
    return createErrorResponse('Sentry is not configured', 503);
  }

  const eventId = createSentryTestEvent(Sentry, processResult.auth.id);

  return createSuccessResponse(
    {
      eventId: eventId ?? null,
    },
    200,
    'Sentry test event captured'
  );
}

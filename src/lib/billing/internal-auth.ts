import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  isBillingEnabled,
  isBillingInternalRoutesEnabled,
  isBillingOverridesEnabled,
} from '@/lib/billing/config';
import { env } from '@/lib/env';

export type BillingInternalActor = {
  internalActor: string;
  requestId: string | null;
};

export type InternalSecretAuthorizationInput = {
  authorizationHeader: string | null;
  internalApiSecret: string;
  cronSecret: string;
};

export type InternalSecretAuthorizationResult =
  | {
      success: true;
      matchedSecret: 'internal_api_secret' | 'cron_secret';
    }
  | {
      success: false;
      reason: 'missing_secret_configuration' | 'missing_bearer' | 'invalid';
    };

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function authorizeInternalSecret(
  input: InternalSecretAuthorizationInput
): InternalSecretAuthorizationResult {
  const token = extractBearerToken(input.authorizationHeader);
  if (!token) {
    return { success: false, reason: 'missing_bearer' };
  }

  const hasInternalApiSecret = input.internalApiSecret.length > 0;
  const hasCronSecret = input.cronSecret.length > 0;
  if (!hasInternalApiSecret && !hasCronSecret) {
    return { success: false, reason: 'missing_secret_configuration' };
  }

  if (hasInternalApiSecret && token === input.internalApiSecret) {
    return { success: true, matchedSecret: 'internal_api_secret' };
  }

  if (hasCronSecret && token === input.cronSecret) {
    return { success: true, matchedSecret: 'cron_secret' };
  }

  return { success: false, reason: 'invalid' };
}

export function requireBillingInternalRequest(
  request: NextRequest,
  input: {
    internalActor: string;
    requireOverrides?: boolean;
  }
):
  | { success: true; actor: BillingInternalActor }
  | { success: false; response: NextResponse } {
  if (!isBillingEnabled() || !isBillingInternalRoutesEnabled()) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Billing internal routes are disabled' },
        { status: 404 }
      ),
    };
  }

  if (input.requireOverrides === true && !isBillingOverridesEnabled()) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Billing overrides are disabled' },
        { status: 404 }
      ),
    };
  }

  const authorization = authorizeInternalSecret({
    authorizationHeader: request.headers.get('authorization'),
    internalApiSecret: env.INTERNAL_API_SECRET,
    cronSecret: '',
  });

  if (!authorization.success) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    actor: {
      internalActor: input.internalActor,
      requestId: request.headers.get('x-request-id'),
    },
  };
}

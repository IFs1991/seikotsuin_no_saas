import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  STAFF_INVITE_ROLE_VALUES,
  type StaffInviteRole,
} from '@/lib/constants/roles';
import type { SupabaseServerClient } from '@/lib/supabase';

type InviteUserByEmail =
  SupabaseServerClient['auth']['admin']['inviteUserByEmail'];

export type StaffInviteEmailClient = {
  auth: {
    admin: {
      inviteUserByEmail: InviteUserByEmail;
    };
  };
};

export type StaffInviteAccountValidation =
  | { success: true; role: StaffInviteRole }
  | {
      success: false;
      reason: 'email_mismatch' | 'invalid_role';
    };

export class StaffInviteDeliveryTimeoutError extends Error {
  constructor() {
    super('Staff invite delivery timed out');
    this.name = 'StaffInviteDeliveryTimeoutError';
  }
}

export function normalizeStaffInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isStaffInviteRole(value: string): value is StaffInviteRole {
  return STAFF_INVITE_ROLE_VALUES.some(role => role === value);
}

export function validateStaffInviteAccount(input: {
  inviteEmail: string;
  inviteRole: string;
  accountEmail: string | null | undefined;
}): StaffInviteAccountValidation {
  if (!isStaffInviteRole(input.inviteRole)) {
    return { success: false, reason: 'invalid_role' };
  }

  if (
    !input.accountEmail ||
    normalizeStaffInviteEmail(input.accountEmail) !==
      normalizeStaffInviteEmail(input.inviteEmail)
  ) {
    return { success: false, reason: 'email_mismatch' };
  }

  return { success: true, role: input.inviteRole };
}

export function createStaffInviteToken(): string {
  return randomUUID();
}

export function buildStaffInviteRedirectUrl(
  appUrl: string,
  token: string
): string {
  const acceptanceUrl = new URL('/invite', appUrl);
  acceptanceUrl.searchParams.set('token', token);

  // Supabase Auth returns an authorization code to redirectTo. Route the
  // response through the existing server callback so it can exchange that
  // code for an HTTP-only session cookie before rendering the invite page.
  const callbackUrl = new URL('/admin/callback', appUrl);
  callbackUrl.searchParams.set(
    'next',
    `${acceptanceUrl.pathname}${acceptanceUrl.search}`
  );
  return callbackUrl.toString();
}

export async function sendStaffInviteEmail(input: {
  adminClient: StaffInviteEmailClient;
  appUrl: string;
  email: string;
  token: string;
  metadata?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}) {
  const redirectTo = buildStaffInviteRedirectUrl(input.appUrl, input.token);
  const timeoutMs = input.timeoutMs ?? 10_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new StaffInviteDeliveryTimeoutError());
    }, timeoutMs);
  });

  try {
    const invitePromise = input.adminClient.auth.admin.inviteUserByEmail(
      normalizeStaffInviteEmail(input.email),
      input.metadata
        ? { redirectTo, data: { ...input.metadata } }
        : { redirectTo }
    );

    return await Promise.race([invitePromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

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

export const ATOMIC_STAFF_INVITE_ERROR_CODES = [
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_INVALID_ROLE',
  'INVITE_EMAIL_MISMATCH',
  'INVITE_ACCOUNT_NOT_FOUND',
  'INVITE_ACCOUNT_EMAIL_MISMATCH',
  'INVITE_ALREADY_ACCEPTED',
  'INVITE_STATE_INVALID',
] as const;

export type AtomicStaffInviteErrorCode =
  (typeof ATOMIC_STAFF_INVITE_ERROR_CODES)[number];

export type AtomicStaffInviteResult =
  | {
      success: true;
      clinicId: string;
      role: StaffInviteRole;
      idempotent: boolean;
    }
  | {
      success: false;
      errorCode: AtomicStaffInviteErrorCode;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isAtomicStaffInviteErrorCode(
  value: unknown
): value is AtomicStaffInviteErrorCode {
  return ATOMIC_STAFF_INVITE_ERROR_CODES.some(code => code === value);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAtomicStaffInviteResult(
  value: unknown
): AtomicStaffInviteResult | null {
  if (!isUnknownRecord(value)) {
    return null;
  }

  const record = value;
  if (record.success === true) {
    const role = record.role;
    if (
      typeof record.clinic_id !== 'string' ||
      !UUID_PATTERN.test(record.clinic_id) ||
      typeof role !== 'string' ||
      !isStaffInviteRole(role) ||
      typeof record.idempotent !== 'boolean'
    ) {
      return null;
    }

    return {
      success: true,
      clinicId: record.clinic_id,
      role,
      idempotent: record.idempotent,
    };
  }

  if (
    record.success === false &&
    isAtomicStaffInviteErrorCode(record.error_code)
  ) {
    return {
      success: false,
      errorCode: record.error_code,
    };
  }

  return null;
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

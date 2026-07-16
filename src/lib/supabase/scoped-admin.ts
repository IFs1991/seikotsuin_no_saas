/**
 * Scoped admin client helpers for service role usage.
 *
 * All service role (createAdminClient) usage should go through these helpers
 * so that scope enforcement is centralized and auditable.
 *
 * Two patterns:
 * 1. createScopedAdminContext  — authenticated admin APIs (user has permissions)
 * 2. createPublicClinicContext — unauthenticated public APIs (clinic_id from request)
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-04)
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
 */

import { ScopeAccessError } from '@/lib/auth/manager-scope';
import {
  createAdminClient,
  resolveScopedClinicIds,
  type UserPermissions,
  type SupabaseServerClient,
} from './server';

export { ScopeAccessError };

// ──────────────────────────────────────────────
// Error types
// ──────────────────────────────────────────────

export class ScopeNotConfiguredError extends Error {
  constructor(message = 'クリニックスコープが設定されていません') {
    super(message);
    this.name = 'ScopeNotConfiguredError';
  }
}

export class ClinicNotFoundError extends Error {
  constructor(message = 'Clinic not found') {
    super(message);
    this.name = 'ClinicNotFoundError';
  }
}

export class ClinicInactiveError extends Error {
  constructor(message = 'Clinic is not active') {
    super(message);
    this.name = 'ClinicInactiveError';
  }
}

// ──────────────────────────────────────────────
// Authenticated admin context
// ──────────────────────────────────────────────

export interface ScopedAdminContext {
  client: SupabaseServerClient;
  scopedClinicIds: string[];
  /** Throws ScopeAccessError if clinicId is not in the user's scope. */
  assertClinicInScope(clinicId: string): void;
}

export async function resolveChildClinicInScope(
  context: ScopedAdminContext,
  childClinicId: string,
  expectedParentClinicId: string
): Promise<string> {
  context.assertClinicInScope(expectedParentClinicId);
  const { data, error } = await context.client
    .from('clinics')
    .select('id')
    .eq('id', childClinicId)
    .eq('parent_id', expectedParentClinicId)
    .single();
  if (error || !data || data.id !== childClinicId) {
    throw new ScopeAccessError();
  }
  return childClinicId;
}

/**
 * Create a scoped admin context for authenticated admin operations.
 *
 * Resolves the user's clinic scope upfront and provides an assertion helper.
 * All admin-route service-role usage should go through this function.
 *
 * @param permissions - User permissions with clinic scope
 * @param _client - Optional pre-built admin client (for testing)
 * @throws ScopeNotConfiguredError if user has no clinic scope
 */
export function createScopedAdminContext(
  permissions: UserPermissions,
  _client?: SupabaseServerClient
): ScopedAdminContext {
  const scopedClinicIds = resolveScopedClinicIds(permissions);
  if (!scopedClinicIds || scopedClinicIds.length === 0) {
    throw new ScopeNotConfiguredError();
  }

  const client = _client ?? createAdminClient();

  return {
    client,
    scopedClinicIds,
    assertClinicInScope(clinicId: string): void {
      if (!scopedClinicIds.includes(clinicId)) {
        throw new ScopeAccessError();
      }
    },
  };
}

// ──────────────────────────────────────────────
// Public clinic context
// ──────────────────────────────────────────────

export interface PublicClinicContext {
  client: SupabaseServerClient;
  clinicId: string;
  clinic: { id: string; name: string; is_active: boolean };
}

/**
 * Create a public admin context with validated clinic access.
 *
 * Validates that the clinic exists and is active before returning the client.
 * All public-route service-role usage should go through this function.
 *
 * @param clinicId - Target clinic ID from request
 * @param _client - Optional pre-built admin client (for testing)
 * @throws ClinicNotFoundError if clinic doesn't exist
 * @throws ClinicInactiveError if clinic is not active
 */
export async function createPublicClinicContext(
  clinicId: string,
  _client?: SupabaseServerClient
): Promise<PublicClinicContext> {
  const client = _client ?? createAdminClient();

  const { data: clinic, error } = await client
    .from('clinics')
    .select('id, name, is_active')
    .eq('id', clinicId)
    .single();

  if (error || !clinic) {
    throw new ClinicNotFoundError();
  }

  if (!clinic.is_active) {
    throw new ClinicInactiveError();
  }

  return {
    client,
    clinicId,
    clinic: {
      ...clinic,
      is_active: true,
    },
  };
}

/**
 * PR-03: route-helpers の先行テスト
 *
 * 先に固定する観点:
 * - handleRouteError: AppError / ApiError / Supabase error / unknown の各ケースでステータスコードが正しい
 * - processClinicScopedBody: auth失敗 / validation失敗 / scope失敗 / 成功の各ケースで認可が変わらない
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';

// --- mock setup ---
const processApiRequestMock = jest.fn();
const ensureClinicAccessMock = jest.fn();
const ensureBusinessWriteAccessMock = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: (...args: unknown[]) => processApiRequestMock(...args),
  };
});

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

jest.mock('@/lib/billing/business-write', () => ({
  ensureBusinessWriteAccess: (...args: unknown[]) =>
    ensureBusinessWriteAccessMock(...args),
}));

import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { AppError, ERROR_CODES, createApiError } from '@/lib/error-handler';

// --- test schema ---
const testInsertSchema = z.object({
  clinic_id: z.string().uuid(),
  name: z.string().min(1),
});

function fakeRequest(body?: unknown): NextRequest {
  return { method: 'POST' } as unknown as NextRequest;
}

// =========================================================
// handleRouteError
// =========================================================
describe('handleRouteError', () => {
  it('returns statusCode from AppError', async () => {
    const error = new AppError(ERROR_CODES.FORBIDDEN, 'アクセス拒否', 403);
    const res = handleRouteError(error, '/api/test');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('アクセス拒否');
  });

  it('returns mapped statusCode from ApiError-like object', async () => {
    const apiError = createApiError(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      'Not found',
      undefined,
      '/api/test'
    );
    const res = handleRouteError(apiError, '/api/test');
    expect(res.status).toBe(404);
  });

  it('normalizes Supabase-style error with code property', async () => {
    const supabaseError = { code: '23505', message: 'duplicate key' };
    const res = handleRouteError(supabaseError, '/api/test');
    // 23505 = unique constraint violation → should not be 500
    expect(res.status).toBeLessThanOrEqual(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 for unknown errors', async () => {
    const res = handleRouteError(new Error('something broke'), '/api/test');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// =========================================================
// processClinicScopedBody
// =========================================================
describe('processClinicScopedBody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureBusinessWriteAccessMock.mockResolvedValue({ mode: 'bypass' });
  });

  const validClinicId = '123e4567-e89b-12d3-a456-426614174000';

  it('returns failure when processApiRequest fails (auth error)', async () => {
    const mockErrorResponse = { status: 401 };
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: mockErrorResponse,
    });

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(mockErrorResponse);
    }
  });

  it('passes denied roles into processApiRequest before schema and clinic scope checks', async () => {
    const mockErrorResponse = { status: 403 };
    const request = fakeRequest();
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: mockErrorResponse,
    });

    const result = await processClinicScopedBody(request, testInsertSchema, {
      deniedRoles: ['manager'],
      deniedRoleMessage: 'マネージャーは作成できません。',
    });

    expect(result.success).toBe(false);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      requireBody: true,
      deniedRoles: ['manager'],
      deniedRoleMessage: 'マネージャーは作成できません。',
    });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body fails schema validation', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: 'not-a-uuid', name: '' },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: validClinicId },
      supabase: {},
    });

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(400);
    }
  });

  it('returns 403 when clinic scope check fails', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test' },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'other-clinic' },
      supabase: {},
    });
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, undefined, 403)
    );

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(403);
    }
  });

  it('denies a manager with stale body scope when effective assignment is revoked', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test' },
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: 'fallback-clinic',
        clinic_scope_ids: [validClinicId],
      },
      supabase: {},
    });
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, undefined, 403)
    );

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema,
      { path: '/api/menus' }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(403);
    }
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      '/api/menus',
      validClinicId,
      { requireClinicMatch: true, allowedRoles: undefined }
    );
  });

  it('allows a manager with an active effective assignment', async () => {
    const finalSupabase = { from: jest.fn() };
    const finalPermissions = {
      role: 'manager',
      clinic_id: null,
      clinic_scope_ids: [validClinicId],
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test' },
      auth: { id: 'manager-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: 'fallback-clinic',
        clinic_scope_ids: [validClinicId],
      },
      supabase: {},
    });
    ensureClinicAccessMock.mockResolvedValue({
      supabase: finalSupabase,
      user: { id: 'manager-1', email: 'manager@example.com' },
      permissions: finalPermissions,
    });

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema,
      { path: '/api/menus' }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.supabase).toBe(finalSupabase);
      expect(result.permissions).toBe(finalPermissions);
      expect(result.auth).toEqual({
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
      });
    }
  });

  it('returns success with dto, supabase, auth when all checks pass', async () => {
    const mockSupabase = { from: jest.fn() };
    const mockAuth = { id: 'user-1', email: 'a@b.com', role: 'staff' };
    const mockPermissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test Menu' },
      auth: mockAuth,
      permissions: mockPermissions,
      supabase: mockSupabase,
    });
    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: { id: 'user-1', email: 'a@b.com' },
      permissions: mockPermissions,
    });

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.dto).toEqual({
        clinic_id: validClinicId,
        name: 'Test Menu',
      });
      expect(result.supabase).toBe(mockSupabase);
      expect(result.auth).toEqual(mockAuth);
      expect(result.permissions).toBe(mockPermissions);
    }
  });

  it('returns stable 402 when the subscription does not allow writes', async () => {
    const mockSupabase = { from: jest.fn() };
    const mockPermissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test Menu' },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: mockPermissions,
      supabase: mockSupabase,
    });
    ensureClinicAccessMock.mockResolvedValue({
      supabase: mockSupabase,
      user: { id: 'user-1', email: 'a@b.com' },
      permissions: mockPermissions,
    });
    ensureBusinessWriteAccessMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.SUBSCRIPTION_INACTIVE,
        '有効な契約が必要です',
        402
      )
    );

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(402);
      await expect(result.error.json()).resolves.toMatchObject({
        success: false,
        code: ERROR_CODES.SUBSCRIPTION_INACTIVE,
      });
    }
  });

  it('checks clinic scope with the clinic_id from parsed body', async () => {
    const mockPermissions = {
      role: 'staff',
      clinic_id: validClinicId,
      clinic_scope_ids: [validClinicId],
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      body: { clinic_id: validClinicId, name: 'Test' },
      auth: { id: 'user-1', email: 'a@b.com', role: 'staff' },
      permissions: mockPermissions,
      supabase: {},
    });
    ensureClinicAccessMock.mockResolvedValue({
      supabase: {},
      user: { id: 'user-1', email: 'a@b.com' },
      permissions: mockPermissions,
    });

    await processClinicScopedBody(fakeRequest(), testInsertSchema);

    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      '/api/unknown',
      validClinicId,
      { requireClinicMatch: true, allowedRoles: undefined }
    );
  });
});

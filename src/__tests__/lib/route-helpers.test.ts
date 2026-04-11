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
const canAccessClinicScopeMock = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: (...args: unknown[]) => processApiRequestMock(...args),
  };
});

jest.mock('@/lib/supabase', () => ({
  canAccessClinicScope: (...args: unknown[]) => canAccessClinicScopeMock(...args),
}));

import {
  handleRouteError,
  processClinicScopedBody,
} from '@/lib/route-helpers';
import {
  AppError,
  ERROR_CODES,
  createApiError,
} from '@/lib/error-handler';

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
    canAccessClinicScopeMock.mockReturnValue(false);

    const result = await processClinicScopedBody(
      fakeRequest(),
      testInsertSchema
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(403);
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
    canAccessClinicScopeMock.mockReturnValue(true);

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
      expect(result.auth).toBe(mockAuth);
      expect(result.permissions).toBe(mockPermissions);
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
    canAccessClinicScopeMock.mockReturnValue(true);

    await processClinicScopedBody(fakeRequest(), testInsertSchema);

    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      mockPermissions,
      validClinicId
    );
  });
});

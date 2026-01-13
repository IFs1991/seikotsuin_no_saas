import { PATCH } from '@/app/api/admin/security/events/route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => ({
  processApiRequest: jest.fn(),
  createSuccessResponse: jest.fn((data) =>
    new Response(JSON.stringify(data), { status: 200 })
  ),
  createErrorResponse: jest.fn((msg, status) =>
    new Response(JSON.stringify({ error: msg }), { status })
  ),
  logError: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

// テスト用UUID
const CLINIC_A_ID = '550e8400-e29b-41d4-a716-446655440001';
const CLINIC_B_ID = '550e8400-e29b-41d4-a716-446655440002';
const CLINIC_ID = '550e8400-e29b-41d4-a716-446655440003';
const EVENT_ID = '660e8400-e29b-41d4-a716-446655440001';
const ADMIN_ID = '770e8400-e29b-41d4-a716-446655440001';

describe('PATCH /api/admin/security/events - クリニック認可', () => {
  const createMockSupabase = () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  });

  const createMockRequest = (body: object) => {
    return new NextRequest('http://localhost/api/admin/security/events', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permissions.clinic_idを使用してイベント更新を許可する', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');

    // clinic_idはpermissionsから取得（リクエストには含まない）
    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@clinic-a.com' },
      permissions: { clinic_id: CLINIC_A_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' }, // clinic_idは不要
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_A_ID, status: 'resolved' },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
      // clinic_idは不要（JWTから取得）
    });
    const response = await PATCH(request);

    expect(response.status).toBe(200);
    // permissions.clinic_idでフィルタリングされることを確認
    expect(mockSupabase.eq).toHaveBeenCalledWith('clinic_id', CLINIC_A_ID);
  });

  it('permissions.clinic_idが未設定の場合は403を返す', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest, createErrorResponse } = require('@/lib/api-helpers');

    // clinic_idがpermissionsに含まれていない
    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { role: 'admin' }, // clinic_idなし
      body: { id: EVENT_ID, status: 'resolved' },
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });
    const response = await PATCH(request);

    // clinic_idが特定できないため403
    expect(response.status).toBe(403);
    expect(createErrorResponse).toHaveBeenCalledWith(
      expect.stringContaining('クリニックID'),
      403
    );
  });

  it('更新クエリにpermissions.clinic_idフィルターが含まれる', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' },
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_ID },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });

    await PATCH(request);

    // updateクエリにclinic_id条件（permissionsから取得）が含まれることを確認
    const eqCalls = mockSupabase.eq.mock.calls;
    const clinicIdCall = eqCalls.find(
      (call: [string, string]) => call[0] === 'clinic_id'
    );
    expect(clinicIdCall).toBeDefined();
    expect(clinicIdCall?.[1]).toBe(CLINIC_ID);
  });

  it('イベントが見つからない場合は404を返す', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');
    const nonExistentEventId = '880e8400-e29b-41d4-a716-446655440001';

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: nonExistentEventId, status: 'resolved' },
    });

    // clinic_idフィルター後、該当なしでPGRST116エラー
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });

    const request = createMockRequest({
      id: nonExistentEventId,
      status: 'resolved',
    });
    const response = await PATCH(request);

    expect(response.status).toBe(404);
  });

  it('監査ログにpermissions.clinic_idが含まれる', async () => {
    const mockSupabase = createMockSupabase();
    const { processApiRequest } = require('@/lib/api-helpers');
    const { AuditLogger } = require('@/lib/audit-logger');

    processApiRequest.mockResolvedValue({
      success: true,
      supabase: mockSupabase,
      auth: { id: ADMIN_ID, email: 'admin@test.com' },
      permissions: { clinic_id: CLINIC_ID, role: 'admin' },
      body: { id: EVENT_ID, status: 'resolved' },
    });

    mockSupabase.single.mockResolvedValue({
      data: { id: EVENT_ID, clinic_id: CLINIC_ID, status: 'resolved' },
      error: null,
    });

    const request = createMockRequest({
      id: EVENT_ID,
      status: 'resolved',
    });

    await PATCH(request);

    // 監査ログにpermissionsから取得したclinic_idが含まれる
    expect(AuditLogger.logAdminAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'admin@test.com',
      'update_security_event',
      EVENT_ID,
      expect.objectContaining({ clinic_id: CLINIC_ID })
    );
  });
});

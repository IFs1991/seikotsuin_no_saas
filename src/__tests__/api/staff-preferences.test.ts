/**
 * @jest-environment node
 *
 * POST /api/staff/preferences - ロールガードテスト
 *
 * @spec docs/stabilization/spec-rls-menus-staff-preferences-hardening-v0.2.md
 *   Issue 2: staff_preferences INSERT を manager 以上に限定
 *
 * ## TDDリスト
 * - [x] therapist が POST すると 403 を返す
 * - [x] staff が POST すると 403 を返す
 * - [x] manager が POST すると 201 を返す
 * - [x] clinic_admin が POST すると 201 を返す
 */

import { NextRequest } from 'next/server';
import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {
    nextUrl: { searchParams: URLSearchParams };
    private _body: unknown;
    constructor(url: string, init?: { body?: string }) {
      const parsed = new URL(url);
      this.nextUrl = { searchParams: parsed.searchParams };
      this._body = init?.body ? JSON.parse(init.body) : undefined;
    }
    async json() {
      return this._body;
    }
  },
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

const TEST_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_STAFF_ID = '123e4567-e89b-12d3-a456-426614174001';

const VALID_BODY = {
  clinic_id: TEST_CLINIC_ID,
  staff_id: TEST_STAFF_ID,
  preference_text: '土曜日の勤務を希望します',
  preference_type: 'day_off',
  priority: 3,
};

const createPostRequest = (body: unknown = VALID_BODY) =>
  new (NextRequest as any)('http://localhost/api/staff/preferences', {
    body: JSON.stringify(body),
  });

/** supabase.from().insert().select().single() チェーンのモック */
const createSupabaseMock = (insertResult: { data: unknown; error: unknown }) => {
  const single = jest.fn().mockResolvedValue(insertResult);
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  return { from: jest.fn().mockReturnValue({ insert }) };
};

type PostHandler = (
  request: NextRequest
) => Promise<{ status: number; json: () => Promise<unknown> }>;
let postHandler: PostHandler;

beforeAll(async () => {
  const mod = await import('@/app/api/staff/preferences/route');
  postHandler = mod.POST as unknown as PostHandler;
});

describe('POST /api/staff/preferences - ロールガード', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // 🔴 Red テスト: therapist / staff は 403 で拒否されるべき
  // 現状は role チェックがないため 201 が返り、テストは失敗する。
  // ----------------------------------------------------------------

  it('therapist が POST すると 403 を返す', async () => {
    ensureClinicAccessMock.mockResolvedValue({
      supabase: createSupabaseMock({ data: null, error: null }),
      user: { id: 'user-1', email: 'therapist@test.com' },
      permissions: { role: 'therapist', clinic_id: TEST_CLINIC_ID },
    });

    const response = await postHandler(createPostRequest());

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('管理者');
  });

  it('staff が POST すると 403 を返す', async () => {
    ensureClinicAccessMock.mockResolvedValue({
      supabase: createSupabaseMock({ data: null, error: null }),
      user: { id: 'user-2', email: 'staff@test.com' },
      permissions: { role: 'staff', clinic_id: TEST_CLINIC_ID },
    });

    const response = await postHandler(createPostRequest());

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
  });

  // ----------------------------------------------------------------
  // 🟢 Green テスト: manager / clinic_admin は 201 で成功するべき
  // ----------------------------------------------------------------

  it('manager が POST すると 201 を返す', async () => {
    const mockData = { id: 'pref-1', ...VALID_BODY };
    ensureClinicAccessMock.mockResolvedValue({
      supabase: createSupabaseMock({ data: mockData, error: null }),
      user: { id: 'user-3', email: 'manager@test.com' },
      permissions: { role: 'manager', clinic_id: TEST_CLINIC_ID },
    });

    const response = await postHandler(createPostRequest());

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
  });

  it('clinic_admin が POST すると 201 を返す', async () => {
    const mockData = { id: 'pref-2', ...VALID_BODY };
    ensureClinicAccessMock.mockResolvedValue({
      supabase: createSupabaseMock({ data: mockData, error: null }),
      user: { id: 'user-4', email: 'clinic_admin@test.com' },
      permissions: { role: 'clinic_admin', clinic_id: TEST_CLINIC_ID },
    });

    const response = await postHandler(createPostRequest());

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
  });

  it('admin が POST すると 201 を返す', async () => {
    const mockData = { id: 'pref-3', ...VALID_BODY };
    ensureClinicAccessMock.mockResolvedValue({
      supabase: createSupabaseMock({ data: mockData, error: null }),
      user: { id: 'user-5', email: 'admin@test.com' },
      permissions: { role: 'admin', clinic_id: TEST_CLINIC_ID },
    });

    const response = await postHandler(createPostRequest());

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
  });
});

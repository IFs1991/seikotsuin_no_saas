/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
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
    private body: unknown;
    constructor(url: string, init?: { body?: unknown }) {
      const parsed = new URL(url);
      this.nextUrl = { searchParams: parsed.searchParams };
      this.body = init?.body;
    }
    json() {
      return Promise.resolve(this.body);
    }
  },
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let shiftsGetHandler: (request: NextRequest) => Promise<Response>;
let shiftsPostHandler: (request: NextRequest) => Promise<Response>;
let shiftsPatchHandler: (request: NextRequest) => Promise<Response>;
let preferencesGetHandler: (request: NextRequest) => Promise<Response>;
let demandForecastGetHandler: (request: NextRequest) => Promise<Response>;

// UUIDフォーマットのテスト用clinic_id
const TEST_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';

const createGetRequest = (path: string, params: Record<string, string>) => {
  const searchParams = new URLSearchParams(params);
  return new (NextRequest as typeof NextRequest)(
    `http://localhost${path}?${searchParams.toString()}`
  );
};

const createJsonRequest = (path: string, body: object) =>
  new (NextRequest as typeof NextRequest)(`http://localhost${path}`, {
    body,
  });

const createQueryBuilder = (result: { data: unknown; error: unknown }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  then: (resolve: (value: unknown) => void) =>
    Promise.resolve(result).then(resolve),
});

beforeAll(async () => {
  const shiftsModule = await import('@/app/api/staff/shifts/route');
  shiftsGetHandler = shiftsModule.GET;
  shiftsPostHandler = shiftsModule.POST;
  shiftsPatchHandler = shiftsModule.PATCH;
  const preferencesModule = await import('@/app/api/staff/preferences/route');
  preferencesGetHandler = preferencesModule.GET;
  const demandForecastModule =
    await import('@/app/api/staff/demand-forecast/route');
  demandForecastGetHandler = demandForecastModule.GET;
});

describe('Staff Shifts API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/staff/shifts', () => {
    it('clinic_id が必須', async () => {
      const request = createGetRequest('/api/staff/shifts', {});
      const response = await shiftsGetHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
    });

    it('シフト取得APIが正しいデータ形式を返す', async () => {
      const mockShifts = [
        {
          id: 'shift-1',
          clinic_id: TEST_CLINIC_ID,
          staff_id: 'staff-1',
          start_time: '2025-01-15T00:00:00Z',
          end_time: '2025-01-15T09:00:00Z',
          status: 'confirmed',
          notes: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          resources: {
            id: 'staff-1',
            name: 'E2E Staff 1',
            type: 'therapist',
          },
        },
      ];

      const queryBuilder = createQueryBuilder({
        data: mockShifts,
        error: null,
      });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn().mockReturnValue(queryBuilder),
        },
        // DOD-09: permissionsを追加
        permissions: {
          role: 'clinic_admin',
          clinic_id: TEST_CLINIC_ID,
        },
      });

      const request = createGetRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        start: '2025-01-01',
        end: '2025-01-31',
      });

      const response = await shiftsGetHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.total).toBe(1);
      expect(payload.data.shifts[0].staff.name).toBe('E2E Staff 1');
    });

    it('認証エラー時は 401 を返す', async () => {
      ensureClinicAccessMock.mockRejectedValue(
        new AppError(ERROR_CODES.UNAUTHORIZED, 'Unauthorized', 401)
      );

      const request = createGetRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        start: '2025-01-01',
        end: '2025-01-31',
      });
      const response = await shiftsGetHandler(request);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/staff/shifts', () => {
    it('clinic_admin がシフトを作成できる', async () => {
      const overlapQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: '123e4567-e89b-12d3-a456-426614174010' },
          error: null,
        }),
      };
      const from = jest
        .fn()
        .mockReturnValueOnce(overlapQuery)
        .mockReturnValueOnce(insertQuery);

      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from },
        user: { id: 'user-1' },
      });

      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        staff_id: '123e4567-e89b-12d3-a456-426614174001',
        start_time: '2026-05-14T00:00:00.000Z',
        end_time: '2026-05-14T09:00:00.000Z',
        status: 'confirmed',
      });

      const response = await shiftsPostHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          clinic_id: TEST_CLINIC_ID,
          status: 'confirmed',
          created_by: 'user-1',
        })
      );
    });

    it('clinic_admin が複数シフトを一括作成できる', async () => {
      const overlapQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        returns: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [
            { id: '123e4567-e89b-12d3-a456-426614174011' },
            { id: '123e4567-e89b-12d3-a456-426614174012' },
          ],
          error: null,
        }),
      };
      const from = jest
        .fn()
        .mockReturnValueOnce(overlapQuery)
        .mockReturnValueOnce(insertQuery);

      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from },
        user: { id: 'user-1' },
      });

      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        shifts: [
          {
            staff_id: '123e4567-e89b-12d3-a456-426614174001',
            start_time: '2026-05-14T00:00:00.000Z',
            end_time: '2026-05-14T09:00:00.000Z',
            status: 'confirmed',
          },
          {
            staff_id: '123e4567-e89b-12d3-a456-426614174001',
            start_time: '2026-05-15T00:00:00.000Z',
            end_time: '2026-05-15T09:00:00.000Z',
            status: 'confirmed',
          },
        ],
      });

      const response = await shiftsPostHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(201);
      expect(payload.success).toBe(true);
      expect(payload.data.total).toBe(2);
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            clinic_id: TEST_CLINIC_ID,
            created_by: 'user-1',
          }),
        ])
      );
    });

    it('同一スタッフの重複シフトは 400 を返す', async () => {
      const overlapQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [{ id: '123e4567-e89b-12d3-a456-426614174010' }],
          error: null,
        }),
      };

      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: jest.fn().mockReturnValue(overlapQuery) },
        user: { id: 'user-1' },
      });

      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        staff_id: '123e4567-e89b-12d3-a456-426614174001',
        start_time: '2026-05-14T00:00:00.000Z',
        end_time: '2026-05-14T09:00:00.000Z',
        status: 'confirmed',
      });

      const response = await shiftsPostHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
    });

    it('他院 clinic_id は拒否される', async () => {
      ensureClinicAccessMock.mockRejectedValue(
        new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden', 403)
      );

      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        staff_id: '123e4567-e89b-12d3-a456-426614174001',
        start_time: '2026-05-14T00:00:00.000Z',
        end_time: '2026-05-14T09:00:00.000Z',
        status: 'confirmed',
      });

      const response = await shiftsPostHandler(request);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/staff/shifts', () => {
    it('clinic_admin が自院シフトを cancelled にできる', async () => {
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '123e4567-e89b-12d3-a456-426614174010',
            status: 'cancelled',
          },
          error: null,
        }),
      };

      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: jest.fn().mockReturnValue(updateQuery) },
      });

      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        id: '123e4567-e89b-12d3-a456-426614174010',
        status: 'cancelled',
      });

      const response = await shiftsPatchHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(updateQuery.update).toHaveBeenCalledWith({
        status: 'cancelled',
      });
    });

    it('cancelled 以外への更新は拒否される', async () => {
      const request = createJsonRequest('/api/staff/shifts', {
        clinic_id: TEST_CLINIC_ID,
        id: '123e4567-e89b-12d3-a456-426614174010',
        status: 'confirmed',
      });

      const response = await shiftsPatchHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.success).toBe(false);
      expect(ensureClinicAccessMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/staff/preferences', () => {
    it('希望取得APIが正しいデータ形式を返す', async () => {
      const mockPreferences = [
        {
          id: 'pref-1',
          clinic_id: TEST_CLINIC_ID,
          staff_id: 'staff-1',
          preference_text: '週末の勤務を希望します',
          preference_type: 'shift_pattern',
          priority: 3,
          valid_from: null,
          valid_until: null,
          is_active: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          resources: {
            id: 'staff-1',
            name: 'E2E Staff 1',
            type: 'therapist',
          },
        },
      ];

      const queryBuilder = createQueryBuilder({
        data: mockPreferences,
        error: null,
      });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn().mockReturnValue(queryBuilder),
        },
      });

      const request = createGetRequest('/api/staff/preferences', {
        clinic_id: TEST_CLINIC_ID,
        active_only: 'true',
      });

      const response = await preferencesGetHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.preferences[0].staff.name).toBe('E2E Staff 1');
    });
  });

  describe('GET /api/staff/demand-forecast', () => {
    it('需要予測APIが予約データから正しく集計される', async () => {
      const mockReservations = [
        {
          id: 'res-1',
          start_time: '2025-01-15T00:00:00Z',
          end_time: '2025-01-15T01:00:00Z',
          status: 'confirmed',
        },
        {
          id: 'res-2',
          start_time: '2025-01-15T00:30:00Z',
          end_time: '2025-01-15T01:00:00Z',
          status: 'confirmed',
        },
        {
          id: 'res-3',
          start_time: '2025-01-15T03:00:00Z',
          end_time: '2025-01-15T04:00:00Z',
          status: 'completed',
        },
      ];

      const inMock = jest.fn().mockResolvedValue({
        data: mockReservations,
        error: null,
      });

      const supabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  in: inMock,
                }),
              }),
            }),
          }),
        }),
      };

      ensureClinicAccessMock.mockResolvedValue({ supabase });

      const request = createGetRequest('/api/staff/demand-forecast', {
        clinic_id: TEST_CLINIC_ID,
        start: '2025-01-01',
        end: '2025-01-31',
      });

      const response = await demandForecastGetHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.forecasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ date: '2025-01-15', hour: 9, count: 2 }),
          expect.objectContaining({ date: '2025-01-15', hour: 12, count: 1 }),
        ])
      );
      expect(payload.data.summary.totalReservations).toBe(3);
    });
  });
});

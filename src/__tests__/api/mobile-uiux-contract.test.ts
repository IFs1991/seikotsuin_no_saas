import { NextRequest } from 'next/server';

import { GET as getMobileUiuxContext } from '@/app/api/mobile-uiux/context/route';
import {
  GET as getMobileUiuxDailyReports,
  POST as postMobileUiuxDailyReports,
} from '@/app/api/mobile-uiux/daily-reports/route';
import { GET as getMobileUiuxHome } from '@/app/api/mobile-uiux/home/route';
import { GET as getMobileUiuxPatientAnalysis } from '@/app/api/mobile-uiux/patient-analysis/route';
import {
  GET as getMobileUiuxReservations,
  PATCH as patchMobileUiuxReservations,
  POST as postMobileUiuxReservations,
} from '@/app/api/mobile-uiux/reservations/route';
import { GET as getMobileUiuxSettingsDetail } from '@/app/api/mobile-uiux/settings-detail/route';
import {
  GET as getMobileUiuxSettings,
  PUT as putMobileUiuxSettings,
} from '@/app/api/mobile-uiux/settings/route';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxFailureFromResponse,
} from '@/lib/mobile-uiux/route-utils';

type MobileUiuxHandler = (request: NextRequest) => Response | Promise<Response>;

type MobileUiuxFailurePayload = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

function buildRequest(path: string, method: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectFailurePayload(
  payload: unknown
): asserts payload is MobileUiuxFailurePayload {
  expect(isRecord(payload)).toBe(true);
  if (!isRecord(payload)) return;

  expect(payload.success).toBe(false);
  expect(payload).not.toHaveProperty('generatedAt');
  expect(isRecord(payload.error)).toBe(true);
  if (!isRecord(payload.error)) return;

  expect(typeof payload.error.code).toBe('string');
  expect(typeof payload.error.message).toBe('string');
}

const endpointCases: ReadonlyArray<{
  name: string;
  method: string;
  path: string;
  handler: MobileUiuxHandler;
}> = [
  {
    name: 'GET /api/mobile-uiux/context',
    method: 'GET',
    path: '/api/mobile-uiux/context',
    handler: getMobileUiuxContext,
  },
  {
    name: 'GET /api/mobile-uiux/home',
    method: 'GET',
    path: '/api/mobile-uiux/home',
    handler: getMobileUiuxHome,
  },
  {
    name: 'GET /api/mobile-uiux/reservations',
    method: 'GET',
    path: '/api/mobile-uiux/reservations',
    handler: getMobileUiuxReservations,
  },
  {
    name: 'POST /api/mobile-uiux/reservations',
    method: 'POST',
    path: '/api/mobile-uiux/reservations',
    handler: postMobileUiuxReservations,
  },
  {
    name: 'PATCH /api/mobile-uiux/reservations',
    method: 'PATCH',
    path: '/api/mobile-uiux/reservations',
    handler: patchMobileUiuxReservations,
  },
  {
    name: 'GET /api/mobile-uiux/daily-reports',
    method: 'GET',
    path: '/api/mobile-uiux/daily-reports',
    handler: getMobileUiuxDailyReports,
  },
  {
    name: 'POST /api/mobile-uiux/daily-reports',
    method: 'POST',
    path: '/api/mobile-uiux/daily-reports',
    handler: postMobileUiuxDailyReports,
  },
  {
    name: 'GET /api/mobile-uiux/settings',
    method: 'GET',
    path: '/api/mobile-uiux/settings',
    handler: getMobileUiuxSettings,
  },
  {
    name: 'PUT /api/mobile-uiux/settings',
    method: 'PUT',
    path: '/api/mobile-uiux/settings',
    handler: putMobileUiuxSettings,
  },
  {
    name: 'GET /api/mobile-uiux/settings-detail',
    method: 'GET',
    path: '/api/mobile-uiux/settings-detail',
    handler: getMobileUiuxSettingsDetail,
  },
  {
    name: 'GET /api/mobile-uiux/patient-analysis',
    method: 'GET',
    path: '/api/mobile-uiux/patient-analysis',
    handler: getMobileUiuxPatientAnalysis,
  },
];

describe('/api/mobile-uiux contract headers and envelopes', () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'false',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'false',
      MOBILE_UIUX_WRITE_ENABLED: 'false',
      MOBILE_UIUX_RESERVATION_WRITE_ENABLED: 'false',
      MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED: 'false',
      MOBILE_UIUX_SETTINGS_WRITE_ENABLED: 'false',
    };
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each(endpointCases)(
    '$name returns the fixed JSON contract headers and failure envelope',
    async ({ handler, method, path }) => {
      const response = await handler(buildRequest(path, method));
      const payload: unknown = await response.json();

      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.status).toBe(403);
      expectFailurePayload(payload);
      expect(payload.error.code).toBe('FORBIDDEN');
    }
  );

  it.each([
    { status: 400, expectedCode: 'BAD_REQUEST' },
    { status: 401, expectedCode: 'UNAUTHORIZED' },
    { status: 403, expectedCode: 'FORBIDDEN' },
    { status: 409, expectedCode: 'CONFLICT' },
    { status: 500, expectedCode: 'INTERNAL' },
  ])(
    'normalizes error code for HTTP $status',
    async ({ status, expectedCode }) => {
      const response = buildMobileUiuxFailure(status, 'INTERNAL', 'failed');
      const payload: unknown = await response.json();

      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expectFailurePayload(payload);
      expect(payload.error.code).toBe(expectedCode);
    }
  );

  it('normalizes shared API helper failures into the mobile UIUX envelope', async () => {
    const sourceResponse = Response.json(
      { success: false, error: '入力値にエラーがあります' },
      { status: 400 }
    );

    const response = await buildMobileUiuxFailureFromResponse(
      sourceResponse,
      'リクエストの処理に失敗しました'
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectFailurePayload(payload);
    expect(payload.error).toEqual({
      code: 'BAD_REQUEST',
      message: '入力値にエラーがあります',
    });
  });
});

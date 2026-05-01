const ensureClinicAccessMock = jest.fn();
const loggerErrorMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: unknown[]) => loggerErrorMock(...args),
    info: jest.fn(),
    log: jest.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
}));

import {
  createErrorResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';

describe('api-helpers security behavior', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('本番では createErrorResponse の details を返さない', async () => {
    process.env.NODE_ENV = 'production';

    const response = createErrorResponse('入力値にエラーがあります', 400, {
      fieldErrors: { password: ['too short'] },
    });

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: '入力値にエラーがあります',
    });
  });

  it('非本番では createErrorResponse の details を維持する', async () => {
    process.env.NODE_ENV = 'test';

    const details = { fieldErrors: { name: ['required'] } };
    const response = createErrorResponse('入力値にエラーがあります', 400, details);

    const body = await response.json();
    expect(body.details).toEqual(details);
  });

  it('本番の mutating request は Origin/Referer 欠落時に 403 を返す', async () => {
    process.env.NODE_ENV = 'production';

    const result = await processApiRequest(
      new Request('https://example.com/api/test', {
        method: 'POST',
        body: JSON.stringify({ ok: true }),
      }) as any,
      { requireBody: true }
    );

    expect(result.success).toBe(false);
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
    if (!result.success) {
      expect(result.error.status).toBe(403);
      await expect(result.error.json()).resolves.toMatchObject({
        success: false,
        error: '不正なリクエスト元です',
      });
    }
  });

  it('本番では logError に stack を含めない', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('boom');
    error.stack = 'STACK SHOULD NOT LEAK';

    logError(error, {
      endpoint: '/api/test',
      method: 'POST',
      userId: 'user-1',
    });

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(loggerErrorMock.mock.calls[0][0]);
    expect(payload.error).toEqual({
      name: 'Error',
      message: 'boom',
    });
  });
});

import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { buildAppBootstrap } from '@/lib/app-bootstrap/service';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/app-bootstrap/service', () => ({
  buildAppBootstrap: jest.fn(),
}));

const mockProcessApiRequest = jest.mocked(processApiRequest);
const mockBuildAppBootstrap = jest.mocked(buildAppBootstrap);

const bootstrap = {
  profile: {
    id: 'user-1',
    email: 'staff@example.com',
    role: 'staff',
    clinicId: 'clinic-1',
    clinicName: '本院',
    isActive: true,
    isAdmin: false,
  },
  clinics: [{ id: 'clinic-1', name: '本院' }],
  currentClinicId: 'clinic-1',
  errors: { profile: null, clinics: null },
  generatedAt: '2026-08-31T00:00:00.000Z',
};

function setAuthorizedRequest() {
  const subject = { user: { id: 'user-1', email: 'staff@example.com' } };
  const accessContext = {
    permissions: { role: 'staff', clinic_id: 'clinic-1' },
    role: 'staff',
    normalizedRole: 'staff',
    clinicId: 'clinic-1',
    isActive: true,
    isAdmin: false,
  };
  const supabase = { from: jest.fn() };

  mockProcessApiRequest.mockResolvedValue({
    success: true,
    auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
    subject,
    accessContext,
    permissions: accessContext.permissions,
    supabase,
  });

  return { subject, accessContext, supabase };
}

describe('GET /api/app/bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('検証済みsubject/access contextをshared serviceへ渡す', async () => {
    const authorized = setAuthorizedRequest();
    mockBuildAppBootstrap.mockResolvedValue(bootstrap);
    const { GET } = await import('@/app/api/app/bootstrap/route');

    const response = await GET(
      new NextRequest('http://localhost/api/app/bootstrap')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: bootstrap,
    });
    expect(mockBuildAppBootstrap).toHaveBeenCalledTimes(1);
    expect(mockBuildAppBootstrap).toHaveBeenCalledWith({
      subject: authorized.subject,
      accessContext: authorized.accessContext,
      supabase: authorized.supabase,
    });
  });

  it.each([401, 403])(
    'guardの%d契約をそのまま返し、serviceを呼ばない',
    async status => {
      mockProcessApiRequest.mockResolvedValue({
        success: false,
        error: new Response(
          JSON.stringify({ success: false, error: `guard-${status}` }),
          { status }
        ),
      });
      const { GET } = await import('@/app/api/app/bootstrap/route');

      const response = await GET(
        new NextRequest('http://localhost/api/app/bootstrap')
      );

      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(mockBuildAppBootstrap).not.toHaveBeenCalled();
    }
  );

  it('authority 503を内部情報なしで返す', async () => {
    setAuthorizedRequest();
    mockBuildAppBootstrap.mockRejectedValue(
      new AppError(
        ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
        'sensitive manager assignment detail',
        503
      )
    );
    const { GET } = await import('@/app/api/app/bootstrap/route');

    const response = await GET(
      new NextRequest('http://localhost/api/app/bootstrap')
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(JSON.stringify(body)).not.toContain('sensitive');
  });
});

import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';

import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds:
    jest.requireActual('@/lib/supabase').resolveScopedClinicIds,
}));

const readFileMock = readFile as jest.Mock;
const createClientMock = createClient as jest.Mock;
const getCurrentUserMock = getCurrentUser as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;

const user = { id: 'user-1', email: 'staff@example.com' };
const supabase = { client: 'supabase' };

function buildRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

async function callMobileScreen(resource: string) {
  const { GET } =
    await import('@/app/(app)/mobile-uiux/screens/[resource]/route');
  return GET(buildRequest(`/mobile-uiux/screens/${resource}`), {
    params: Promise.resolve({ resource }),
  });
}

describe('GET /mobile-uiux/screens/[resource] production gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_ENABLED;
    delete process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;

    readFileMock.mockResolvedValue('<!doctype html><html></html>');
    createClientMock.mockResolvedValue(supabase);
    getCurrentUserMock.mockResolvedValue(user);
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 404 when MOBILE_UIUX_ENABLED is unset', async () => {
    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin roles when clinic allowlist is empty', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is outside the mobile role allowlist', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_ALLOWED_ROLES = 'admin,clinic_admin';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 for customer even if the env role allowlist includes it', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';
    process.env.MOBILE_UIUX_ALLOWED_ROLES = 'customer';
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'customer',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      clinicId: 'clinic-1',
    });

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the accessible clinic scope is outside the allowlist', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-2';

    const response = await callMobileScreen('reservations');
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('serves the screen when flag, role, and clinic allowlist permit access', async () => {
    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = 'clinic-1';

    const response = await callMobileScreen('reservations');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(readFileMock).toHaveBeenCalled();
  });
});

import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { mfaManager } from '@/lib/mfa/mfa-manager';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/mfa/mfa-manager', () => ({
  mfaManager: {
    initiateMFASetup: jest.fn(),
  },
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const initiateMFASetupMock = mfaManager.initiateMFASetup as jest.Mock;

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/mfa/setup/initiate', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mfa/setup/initiate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores request clinicId and uses the authenticated clinic scope', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'user@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'clinic-owned',
        clinic_scope_ids: ['clinic-owned'],
      },
      supabase: {},
      body: { clinicId: 'clinic-other' },
    });
    initiateMFASetupMock.mockResolvedValue({
      qrCodeUrl: 'data:image/png;base64,qr',
      backupCodes: ['ABCD1234'],
      manualEntryKey: 'SECR ET',
    });

    const { POST } = await import('@/app/api/mfa/setup/initiate/route');
    const response = await POST(buildRequest({ clinicId: 'clinic-other' }));

    expect(response.status).toBe(200);
    expect(initiateMFASetupMock).toHaveBeenCalledWith('user-1', 'clinic-owned');
  });

  it('uses a valid JWT subset instead of the DB primary clinic', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'user@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: 'clinic-primary',
        clinic_scope_ids: ['clinic-subset'],
      },
      supabase: {},
    });
    initiateMFASetupMock.mockResolvedValue({
      qrCodeUrl: 'data:image/png;base64,qr',
      backupCodes: ['ABCD1234'],
      manualEntryKey: 'SECR ET',
    });

    const { POST } = await import('@/app/api/mfa/setup/initiate/route');
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(200);
    expect(initiateMFASetupMock).toHaveBeenCalledWith(
      'user-1',
      'clinic-subset'
    );
    expect(initiateMFASetupMock).not.toHaveBeenCalledWith(
      'user-1',
      'clinic-primary'
    );
  });
});

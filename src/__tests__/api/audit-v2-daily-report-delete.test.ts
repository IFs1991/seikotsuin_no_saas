import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/daily-reports/route';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const clinicA = '00000000-0000-0000-0000-000000000101';
const clinicB = '00000000-0000-0000-0000-000000000102';
const reportId = '00000000-0000-0000-0000-000000000201';
let mockScope: string[];
let mockReportClinic: string | null;
let mockRole: string;
let mockRevoke: boolean;
let mockReadError: boolean;
const mockBilling = jest.fn();
const mockDelete = jest.fn();
const mockGuard = jest.fn();
const mockEq = jest.fn();

function mockTable() {
  let includedScope: string[] | null = null;
  const read = {
    eq: () => read,
    in: (_column: string, scope: string[]) => {
      includedScope = scope;
      return read;
    },
    single: async () => ({
      data:
        mockReportClinic &&
        (!includedScope || includedScope.includes(mockReportClinic))
          ? { id: reportId, clinic_id: mockReportClinic }
          : null,
      error: mockReadError ? new Error('read failed') : null,
    }),
  };
  const write = {
    eq: (column: string, value: string) => {
      mockEq(column, value);
      return write;
    },
    then(resolve: (result: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  return {
    select: () => read,
    delete: () => {
      mockDelete();
      return write;
    },
  };
}
jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (
    _request: unknown,
    _path: string,
    clinic: string | null,
    options: { allowedRoles?: string[] }
  ) => {
    mockGuard(clinic, options);
    if (
      !options.allowedRoles?.includes(mockRole) ||
      (clinic && (!mockScope.includes(clinic) || mockRevoke))
    ) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'denied', 403);
    }
    return Promise.resolve({
      supabase: { from: () => mockTable() },
      permissions: {
        role: mockRole,
        clinic_id: clinicA,
        clinic_scope_ids: mockScope,
      },
    });
  },
}));
jest.mock('@/lib/billing/business-write', () => ({
  ensureScopedBusinessWriteAccess: (...args: unknown[]) => mockBilling(...args),
}));

function remove() {
  return DELETE(
    new NextRequest(`http://localhost/api/daily-reports?id=${reportId}`, {
      method: 'DELETE',
    })
  );
}

describe('AUDIT-V2 F15 delete the actual report clinic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBilling.mockReset();
    mockScope = [clinicA, clinicB];
    mockReportClinic = clinicB;
    mockRole = 'admin';
    mockRevoke = false;
    mockReadError = false;
  });

  it.each([
    [clinicA, clinicB],
    [clinicB, clinicA],
  ])(
    'authorizes and bills B regardless of scope order %j',
    async (...scope) => {
      mockScope = scope;
      const response = await remove();
      expect(response.status).toBe(200);
      expect(mockGuard).toHaveBeenLastCalledWith(
        clinicB,
        expect.objectContaining({ allowedRoles: ['admin', 'clinic_admin'] })
      );
      expect(mockBilling).toHaveBeenCalledTimes(1);
      expect(mockBilling).toHaveBeenCalledWith(
        expect.objectContaining({ targetClinicId: clinicB })
      );
      expect(mockEq).toHaveBeenCalledWith('clinic_id', clinicB);
      expect(mockDelete).toHaveBeenCalledTimes(1);
    }
  );

  it('checks the actual B billing lock before deleting', async () => {
    mockBilling.mockImplementation((input: { targetClinicId: string }) => {
      if (input.targetClinicId === clinicB)
        throw new AppError(ERROR_CODES.FORBIDDEN, 'billing locked', 403);
    });
    expect((await remove()).status).toBe(403);
    expect(mockBilling).toHaveBeenCalledWith(
      expect.objectContaining({ targetClinicId: clinicB })
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('denies when report clinic permission is revoked during lookup', async () => {
    mockRevoke = true;
    expect((await remove()).status).toBe(403);
    expect(mockBilling).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each([null, '00000000-0000-0000-0000-000000000999'])(
    'does not reveal a missing or out-of-scope report: %s',
    async clinic => {
      mockReportClinic = clinic;
      const response = await remove();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Report not found' });
      expect(mockBilling).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    }
  );

  it.each(['manager', 'staff'])('preserves the denied role %s', async role => {
    mockRole = role;
    expect((await remove()).status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('fails closed for empty scope or read error', async () => {
    mockScope = [];
    expect((await remove()).status).toBe(400);
    mockScope = [clinicB];
    mockReadError = true;
    expect((await remove()).status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

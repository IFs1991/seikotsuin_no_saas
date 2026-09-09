import { NextRequest } from 'next/server';
import { z } from 'zod';
import { GET, PATCH, POST } from '@/app/api/customers/route';
import { sanitizeInput } from '@/lib/api-helpers';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const customerId = '123e4567-e89b-12d3-a456-426614174001';
let mockStored: Record<string, unknown>;
let mockRole = 'clinic_admin';
let mockDeny = false;
const mockScope = jest.fn();
const mockWrite = jest.fn();
const mockBilling = jest.fn();
const mockGuard = jest.fn();

function mockQuery() {
  const query = {
    insert: (payload: Record<string, unknown>) => {
      mockWrite(payload);
      mockStored = { ...payload, id: customerId, is_deleted: false };
      return query;
    },
    update: (payload: Record<string, unknown>) => {
      mockWrite(payload);
      mockStored = {
        ...mockStored,
        ...Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined)
        ),
      };
      return query;
    },
    select: () => query,
    eq: (key: string, value: unknown) => {
      mockScope(key, value);
      return query;
    },
    single: async () => ({ data: mockStored, error: null }),
  };
  return query;
}

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => {
    mockGuard(...args);
    if (mockDeny) throw new AppError(ERROR_CODES.FORBIDDEN, 'denied', 403);
    return Promise.resolve({
      supabase: {},
      user: { id: 'test-user', email: 'test@example.invalid' },
      permissions: {
        role: mockRole,
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
    });
  },
}));
jest.mock('@/lib/supabase', () => ({
  createScopedAdminContext: () => ({
    assertClinicInScope: (scope: string) => {
      expect(scope).toBe(clinicId);
    },
    client: { from: () => mockQuery() },
  }),
}));
jest.mock('@/lib/billing/business-write', () => ({
  ensureScopedBusinessWriteAccess: (...args: unknown[]) => mockBilling(...args),
}));

function request(method: string, data?: unknown, origin = 'http://localhost') {
  return new NextRequest(
    `http://localhost/api/customers?clinic_id=${clinicId}&id=${customerId}`,
    {
      method,
      headers: { origin, 'content-type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }
  );
}
const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    name: z.string(),
    notes: z.string(),
    customAttributes: z.record(z.unknown()).optional(),
  }),
});

describe('AUDIT-V2 F10 real customer API and body pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'clinic_admin';
    mockDeny = false;
    mockStored = {};
  });

  it.each([
    'A&B',
    '<',
    '>',
    '"double" and \'single\'',
    '&amp;',
    '<img src=x onerror=alert(1)>',
  ])('preserves raw text through POST → GET → PATCH → GET: %s', async value => {
    const created = await POST(
      request('POST', {
        clinic_id: clinicId,
        name: value,
        phone: '09000000000',
        notes: value,
      })
    );
    expect(created.status).toBe(201);
    expect(mockStored.name).toBe(value);
    expect(mockStored.notes).toBe(value);
    const firstRead = responseSchema.parse(
      await (await GET(request('GET'))).json()
    ).data;
    expect(firstRead.name).toBe(value);
    expect(firstRead.notes).toBe(value);
    const updated = await PATCH(
      request('PATCH', {
        clinic_id: clinicId,
        id: customerId,
        name: firstRead.name,
        notes: firstRead.notes,
      })
    );
    expect(updated.status).toBe(200);
    const secondRead = responseSchema.parse(
      await (await GET(request('GET'))).json()
    ).data;
    expect(secondRead.name).toBe(value);
    expect(secondRead.notes).toBe(value);
    expect(mockScope).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(mockBilling).toHaveBeenCalledTimes(2);
    expect(mockGuard).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PATCH' }),
      '/api/customers',
      clinicId,
      expect.objectContaining({ requireClinicMatch: true })
    );
  });

  it('removes dangerous nested keys while retaining literal entities', () => {
    const input: unknown = JSON.parse(
      '{"__proto__":{"polluted":true},"nested":[{"constructor":"x","prototype":"x","note":"&amp;"}]}'
    );
    expect(sanitizeInput(input)).toEqual({ nested: [{ note: '&amp;' }] });
    expect({}).not.toHaveProperty('polluted');
  });

  it('still rejects invalid schema fields before persistence', async () => {
    const response = await POST(
      request('POST', {
        clinic_id: clinicId,
        name: '',
        phone: '090',
        unexpected: true,
      })
    );
    expect(response.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('still rejects a foreign Origin before auth or persistence', async () => {
    const response = await POST(
      request('POST', {}, 'https://foreign.example.invalid')
    );
    expect(response.status).toBe(403);
    expect(mockGuard).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it.each(['authority', 'manager'])(
    'still rejects %s before persistence',
    async reason => {
      mockDeny = reason === 'authority';
      mockRole = reason === 'manager' ? 'manager' : 'clinic_admin';
      const response = await POST(
        request('POST', { clinic_id: clinicId, name: 'A&B', phone: '090' })
      );
      expect(response.status).toBe(403);
      expect(mockWrite).not.toHaveBeenCalled();
    }
  );
});

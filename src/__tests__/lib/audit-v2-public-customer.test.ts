import type { Database } from '@/types/supabase';
import type { SupabaseServerClient } from '@/lib/supabase';
import { PublicReservationService } from '@/lib/services/public-reservation-service';

const { createClient } = jest.requireActual<
  typeof import('@supabase/supabase-js')
>('@supabase/supabase-js');
const clinicA = '00000000-0000-0000-0000-000000000101';
const clinicB = '00000000-0000-0000-0000-000000000102';
const existingId = '00000000-0000-0000-0000-000000000401';
type Patient = {
  id: string;
  clinic_id: string;
  name: string;
  phone: string;
  email: string;
  line_user_id: string | null;
  is_deleted: boolean;
};
let patients: Patient[];
let requestLog: { method: string; url: URL; body: unknown }[];
let service: PublicReservationService;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AUDIT-V2 F11 anonymous identity with actual SDK query serialization', () => {
  beforeEach(() => {
    patients = [
      {
        id: existingId,
        clinic_id: clinicA,
        name: '同名 太郎',
        phone: '09012345678',
        email: 'family@example.invalid',
        line_user_id: 'Uverified',
        is_deleted: false,
      },
    ];
    requestLog = [];
    const client: SupabaseServerClient = createClient<Database>(
      'https://db.example.invalid',
      'test-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            const url = new URL(
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url
            );
            const method = init?.method ?? 'GET';
            const body: unknown =
              typeof init?.body === 'string' ? JSON.parse(init.body) : null;
            requestLog.push({ method, url, body });
            if (method === 'POST')
              return response({ id: `new-${requestLog.length}` }, 201);
            if (method === 'PATCH') return new Response(null, { status: 204 });
            if (method !== 'GET')
              throw new Error(`Unexpected method ${method}`);
            const matches = patients.filter(
              patient =>
                url.searchParams.get('clinic_id') ===
                  `eq.${patient.clinic_id}` &&
                url.searchParams.get('is_deleted') === 'eq.false' &&
                !patient.is_deleted &&
                (url.searchParams.get('line_user_id') ===
                  `eq.${patient.line_user_id}` ||
                  url.searchParams.get('normalized_phone') ===
                    `eq.${patient.phone}` ||
                  url.searchParams.get('email') === `eq.${patient.email}`)
            );
            return response(matches.map(patient => ({ id: patient.id })));
          },
        },
      }
    );
    service = new PublicReservationService(client, clinicA);
  });

  it.each([
    ['家族 花子', '09012345678', 'family@example.invalid'],
    ['同名 太郎', '09012345678', 'family@example.invalid'],
    ['同名　太郎', '+81 90-1234-5678', 'family@example.invalid'],
    ['同名 太郎', '08099999999', 'family@example.invalid'],
    ['別メール', '09012345678', 'new@example.invalid'],
  ])(
    'web contact input never proves identity: %s',
    async (name, phone, email) => {
      const result = await service.findOrCreateCustomer(name, phone, email);
      expect(result.created).toBe(true);
      expect(result.customerId).not.toBe(existingId);
      expect(requestLog.map(item => item.method)).toEqual(['POST']);
      expect(requestLog[0]?.body).toMatchObject({
        clinic_id: clinicA,
        name,
        email,
      });
      expect(requestLog[0]?.body).not.toHaveProperty('line_user_id');
    }
  );

  it('two anonymous retries never reuse a contact match or modify its patient', async () => {
    const first = await service.findOrCreateCustomer(
      '同名 太郎',
      '09012345678',
      'family@example.invalid'
    );
    const second = await service.findOrCreateCustomer(
      '同名 太郎',
      '09012345678',
      'family@example.invalid'
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.customerId).not.toBe(second.customerId);
    expect(requestLog.map(item => item.method)).toEqual(['POST', 'POST']);
  });

  it('verified LINE still selects only the same clinic active LINE patient despite changed contact', async () => {
    const result = await service.findOrCreateCustomer(
      '新しい表記',
      '08011111111',
      'new@example.invalid',
      { lineUserId: 'Uverified', displayName: '新しい表示' }
    );
    expect(result).toEqual({ customerId: existingId, created: false });
    expect(requestLog.map(item => item.method)).toEqual(['GET', 'PATCH']);
    expect(requestLog[0]?.url.searchParams.get('clinic_id')).toBe(
      `eq.${clinicA}`
    );
    expect(requestLog[0]?.url.searchParams.get('line_user_id')).toBe(
      'eq.Uverified'
    );
    expect(requestLog[0]?.url.searchParams.has('normalized_phone')).toBe(false);
    expect(requestLog[1]?.body).not.toHaveProperty('phone');
  });

  it.each(['different clinic', 'deleted patient'])(
    'verified LINE cannot reuse a %s',
    async reason => {
      patients = patients.map(patient => ({
        ...patient,
        clinic_id: reason === 'different clinic' ? clinicB : clinicA,
        is_deleted: reason === 'deleted patient',
      }));
      const result = await service.findOrCreateCustomer(
        '患者',
        '09012345678',
        'family@example.invalid',
        { lineUserId: 'Uverified', displayName: null }
      );
      expect(result.created).toBe(true);
      expect(requestLog.map(item => item.method)).toEqual(['GET', 'POST']);
    }
  );
});

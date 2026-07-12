import { NextRequest } from 'next/server';

const mockProcessApiRequest = jest.fn();
const mockSafeValidateTableData = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockLogDataModify = jest.fn();

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');

  return {
    ...actual,
    processApiRequest: (...args: unknown[]) => mockProcessApiRequest(...args),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/validation/table-schemas', () => ({
  safeValidateTableData: (...args: unknown[]) =>
    mockSafeValidateTableData(...args),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logDataAccess: jest.fn(),
    logDataModify: (...args: unknown[]) => mockLogDataModify(...args),
  },
}));

import { POST, PUT } from '@/app/api/admin/tables/route';

const CLINIC_A_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_B_ID = '22222222-2222-4222-8222-222222222222';

type WriteResult = {
  data: { id: string } | null;
  error: { code: string; message: string } | null;
};

function createWriteClient(result: WriteResult) {
  const chain = {
    insert: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockResolvedValue(result),
  };
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);

  return {
    client: { from: jest.fn().mockReturnValue(chain) },
    chain,
  };
}

function arrangeRequest(
  method: 'POST' | 'PUT',
  tableName: 'menus' | 'menu_categories' | 'resources',
  authenticatedClient: ReturnType<typeof createWriteClient>['client']
) {
  const data =
    tableName === 'menu_categories'
      ? { name: '共有カテゴリ' }
      : { clinic_id: CLINIC_B_ID, name: 'Clinic B payload' };
  const body =
    method === 'POST'
      ? { table_name: tableName, data }
      : { table_name: tableName, id: 'row-in-clinic-b', data };

  mockProcessApiRequest.mockResolvedValue({
    success: true,
    auth: {
      id: 'admin-in-clinic-a',
      email: 'admin@example.test',
      clinic_id: CLINIC_A_ID,
    },
    body,
    supabase: authenticatedClient,
  });
  mockSafeValidateTableData.mockReturnValue({ success: true, data });

  return new NextRequest('http://localhost/api/admin/tables', { method });
}

describe('commercial PR-02 admin table client routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogDataModify.mockResolvedValue(undefined);
  });

  it.each([
    { method: 'POST' as const, handler: POST },
    { method: 'PUT' as const, handler: PUT },
  ])(
    'routes $method menu_categories through service credentials after auth',
    async ({ method, handler }) => {
      const authenticated = createWriteClient({
        data: { id: 'authenticated-row' },
        error: null,
      });
      const service = createWriteClient({
        data: { id: 'shared-category' },
        error: null,
      });
      mockCreateAdminClient.mockReturnValue(service.client);

      const response = await handler(
        arrangeRequest(method, 'menu_categories', authenticated.client)
      );

      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(mockCreateAdminClient).toHaveBeenCalledTimes(1);
      expect(service.client.from).toHaveBeenCalledWith('menu_categories');
      expect(authenticated.client.from).not.toHaveBeenCalled();
    }
  );

  it.each([
    { method: 'POST' as const, handler: POST, tableName: 'menus' as const },
    { method: 'PUT' as const, handler: PUT, tableName: 'menus' as const },
    { method: 'POST' as const, handler: POST, tableName: 'resources' as const },
    { method: 'PUT' as const, handler: PUT, tableName: 'resources' as const },
  ])(
    'routes $method $tableName through the authenticated RLS client',
    async ({ method, handler, tableName }) => {
      const authenticated = createWriteClient({
        data: { id: 'tenant-row' },
        error: null,
      });
      const service = createWriteClient({
        data: { id: 'unexpected-service-row' },
        error: null,
      });
      mockCreateAdminClient.mockReturnValue(service.client);

      const response = await handler(
        arrangeRequest(method, tableName, authenticated.client)
      );

      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(authenticated.client.from).toHaveBeenCalledWith(tableName);
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
      expect(service.client.from).not.toHaveBeenCalled();
    }
  );

  it('fails closed when authenticated RLS rejects a cross-clinic menu update', async () => {
    const authenticated = createWriteClient({
      data: null,
      error: { code: '42501', message: 'row-level security policy denied' },
    });
    const service = createWriteClient({
      data: { id: 'must-not-be-written' },
      error: null,
    });
    mockCreateAdminClient.mockReturnValue(service.client);

    const response = await PUT(
      arrangeRequest('PUT', 'menus', authenticated.client)
    );

    expect(response.status).toBe(500);
    expect(authenticated.client.from).toHaveBeenCalledWith('menus');
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(service.client.from).not.toHaveBeenCalled();
    expect(mockLogDataModify).not.toHaveBeenCalled();
  });
});

import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const VALID_CLINIC_ID = '123e4567-e89b-12d3-a456-426614174000';

type QueryResult<T> = { data: T[]; error: null };
type ResourceRow = {
  id: string;
  name: string;
  type: string;
  working_hours: Record<string, unknown> | null;
  supported_menus: string[] | null;
  max_concurrent: number | null;
  is_active: boolean | null;
};
type StaffCandidateRow = {
  id: string;
  name: string;
  role: string;
  is_therapist: boolean | null;
};
type ResourceQuery = {
  select: jest.MockedFunction<(columns: string) => ResourceQuery>;
  eq: jest.MockedFunction<(field: string, value: unknown) => ResourceQuery>;
  order: jest.MockedFunction<
    (field: string, options: { ascending: boolean }) => Promise<QueryResult<ResourceRow>>
  >;
};
type StaffQuery = {
  select: jest.MockedFunction<(columns: string) => StaffQuery>;
  eq: jest.MockedFunction<(field: string, value: unknown) => Promise<QueryResult<StaffCandidateRow>>>;
};

function buildRequest(path = `/api/resources?clinic_id=${VALID_CLINIC_ID}`) {
  return new NextRequest(`http://localhost${path}`);
}

function createResourceQuery(rows: ResourceRow[]): ResourceQuery {
  const query = {} as ResourceQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockReturnValue(query);
  query.order = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

function createStaffQuery(rows: StaffCandidateRow[]): StaffQuery {
  const query = {} as StaffQuery;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

describe('GET /api/resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('active staff resource がある場合は staff フォールバックを読まない', async () => {
    const resourceQuery = createResourceQuery([
      {
        id: 'resource-1',
        name: '田中先生',
        type: 'staff',
        working_hours: null,
        supported_menus: null,
        max_concurrent: 1,
        is_active: true,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'resource-1',
        name: '田中先生',
        type: 'staff',
        isActive: true,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('resources');
  });

  it('staff resource がない場合だけ staff から施術者候補を補完する', async () => {
    const resourceQuery = createResourceQuery([]);
    const staffQuery = createStaffQuery([
      {
        id: 'staff-1',
        name: '院長',
        role: 'clinic_admin',
        is_therapist: false,
      },
      {
        id: 'staff-2',
        name: '受付',
        role: 'staff',
        is_therapist: false,
      },
    ]);
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'resources') return resourceQuery;
        if (table === 'staff') return staffQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    processApiRequestMock.mockResolvedValue({
      success: true,
      supabase,
    });

    const { GET } = await import('@/app/api/resources/route');
    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'staff-1',
        name: '院長',
        type: 'staff',
        isActive: true,
      }),
    ]);
    expect(supabase.from).toHaveBeenCalledWith('resources');
    expect(supabase.from).toHaveBeenCalledWith('staff');
  });
});

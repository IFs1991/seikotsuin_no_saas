import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  canAccessClinicScope,
  createAdminClient,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import {
  GET as getMetrics,
  POST as postMetrics,
} from '@/app/api/beta/metrics/route';
import {
  GET as getFeedback,
  POST as postFeedback,
  PATCH as patchFeedback,
} from '@/app/api/beta/feedback/route';
import {
  GET as getBacklog,
  POST as postBacklog,
} from '@/app/api/beta/backlog/route';

jest.mock('@/lib/api-helpers', () => ({
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/supabase', () => {
  type PermissionLike = {
    clinic_id: string | null;
    clinic_scope_ids?: string[] | null;
  };

  const resolveScope = (permissions: PermissionLike): string[] | null => {
    if (Array.isArray(permissions.clinic_scope_ids)) {
      return permissions.clinic_scope_ids;
    }
    return permissions.clinic_id ? [permissions.clinic_id] : null;
  };

  return {
    canAccessClinicScope: jest.fn(
      (permissions: PermissionLike, clinicId: string) =>
        resolveScope(permissions)?.includes(clinicId) ?? false
    ),
    createAdminClient: jest.fn(),
    resolveScopedClinicIds: jest.fn(resolveScope),
  };
});

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const canAccessClinicScopeMock = canAccessClinicScope as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;
const resolveScopedClinicIdsMock = resolveScopedClinicIds as jest.Mock;

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const feedbackId = '33333333-3333-4333-8333-333333333333';

type QueryRow = Record<string, unknown>;
type QueryResult = { data: QueryRow[]; error: null };

class ReadQueryMock {
  private rows: QueryRow[];

  readonly select = jest.fn(() => this);
  readonly order = jest.fn(() => this);
  readonly gte = jest.fn(() => this);
  readonly lte = jest.fn(() => this);
  readonly update = jest.fn(() => this);
  readonly insert = jest.fn((value: QueryRow) => {
    this.rows = [{ id: 'created-row', ...value }];
    return this;
  });

  readonly eq = jest.fn((column: string, value: unknown) => {
    this.rows = this.rows.filter(row => row[column] === value);
    return this;
  });

  readonly in = jest.fn((column: string, values: readonly string[]) => {
    this.rows = this.rows.filter(row => {
      const value = row[column];
      return typeof value === 'string' && values.includes(value);
    });
    return this;
  });

  readonly overlaps = jest.fn((column: string, values: readonly string[]) => {
    this.rows = this.rows.filter(row => {
      const value = row[column];
      return (
        Array.isArray(value) &&
        value.some(entry => typeof entry === 'string' && values.includes(entry))
      );
    });
    return this;
  });

  readonly containedBy = jest.fn(
    (column: string, values: readonly string[]) => {
      this.rows = this.rows.filter(row => {
        const value = row[column];
        return (
          Array.isArray(value) &&
          value.every(
            entry => typeof entry === 'string' && values.includes(entry)
          )
        );
      });
      return this;
    }
  );

  constructor(rows: readonly QueryRow[] = []) {
    this.rows = [...rows];
  }

  maybeSingle<T>() {
    return Promise.resolve({
      data: (this.rows[0] ?? null) as T | null,
      error: null,
    });
  }

  single<T>() {
    return Promise.resolve({
      data: (this.rows[0] ?? null) as T | null,
      error: null,
    });
  }

  then(resolve: (result: QueryResult) => void) {
    resolve({ data: this.rows, error: null });
  }
}

function mockProcessSuccess(input: {
  body?: unknown;
  clinicId?: string | null;
  query?: ReadQueryMock;
  role?: string;
  scope: readonly string[];
}) {
  const query = input.query ?? new ReadQueryMock();
  const from = jest.fn((table: string) => {
    if (table === 'profiles') {
      throw new Error('profiles must not be consulted for beta authorization');
    }
    return query;
  });

  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'actor-user',
      email: 'actor@example.com',
      role: input.role ?? 'admin',
    },
    permissions: {
      role: input.role ?? 'admin',
      clinic_id: input.clinicId === undefined ? clinicA : input.clinicId,
      clinic_scope_ids: [...input.scope],
    },
    supabase: { from },
    body: input.body,
  });

  return { from, query };
}

function postRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: 'POST',
  });
}

function patchRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: 'PATCH',
  });
}

const authorityFailures = [
  { boundary: 'permission missing', status: 403 },
  { boundary: 'profile missing', status: 403 },
  { boundary: 'inactive profile', status: 403 },
  { boundary: 'authority lookup error', status: 503 },
] as const;

const betaGetRoutes = [
  {
    name: 'metrics',
    invoke: () =>
      getMetrics(new NextRequest('http://localhost/api/beta/metrics')),
  },
  {
    name: 'feedback',
    invoke: () =>
      getFeedback(new NextRequest('http://localhost/api/beta/feedback')),
  },
  {
    name: 'backlog',
    invoke: () =>
      getBacklog(new NextRequest('http://localhost/api/beta/backlog')),
  },
] as const;

describe('beta API canonical authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe.each(betaGetRoutes)('$name authority boundaries', route => {
    it.each(authorityFailures)(
      'propagates $boundary as HTTP $status',
      async ({ boundary, status }) => {
        processApiRequestMock.mockResolvedValue({
          success: false,
          error: NextResponse.json(
            { success: false, error: boundary },
            { status }
          ),
        });

        const response = await route.invoke();

        expect(response.status).toBe(status);
        expect(processApiRequestMock).toHaveBeenCalledTimes(1);
      }
    );

    it('denies an admin whose canonical clinic scope is empty', async () => {
      const { from } = mockProcessSuccess({ scope: [] });

      const response = await route.invoke();

      expect(response.status).toBe(403);
      expect(from).not.toHaveBeenCalled();
    });
  });

  it.each([
    {
      name: 'metrics',
      invoke: () =>
        getMetrics(
          new NextRequest(
            `http://localhost/api/beta/metrics?clinicId=${clinicB}`
          )
        ),
    },
    {
      name: 'feedback',
      invoke: () =>
        getFeedback(
          new NextRequest(
            `http://localhost/api/beta/feedback?clinicId=${clinicB}`
          )
        ),
    },
  ])('denies $name reads outside an admin JWT subset', async ({ invoke }) => {
    const { from } = mockProcessSuccess({ scope: [clinicA] });

    const response = await invoke();

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope metrics service-role write before creating the admin client', async () => {
    const { from } = mockProcessSuccess({
      body: {
        clinicId: clinicB,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-07-02T00:00:00.000Z',
      },
      scope: [clinicA],
    });

    const response = await postMetrics(postRequest('/api/beta/metrics'));

    expect(response.status).toBe(403);
    expect(canAccessClinicScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_scope_ids: [clinicA] }),
      clinicB
    );
    expect(from).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope feedback update for an admin JWT subset', async () => {
    const query = new ReadQueryMock([{ id: feedbackId, clinic_id: clinicB }]);
    mockProcessSuccess({
      body: { id: feedbackId, status: 'resolved' },
      query,
      scope: [clinicA],
    });

    const response = await patchFeedback(patchRequest('/api/beta/feedback'));

    expect(response.status).toBe(403);
    expect(query.update).not.toHaveBeenCalled();
  });

  it('uses the canonical JWT subset clinic for a feedback write default', async () => {
    const query = new ReadQueryMock();
    mockProcessSuccess({
      body: {
        category: 'usability',
        severity: 'medium',
        title: 'Canonical clinic feedback',
        description: 'The write must target the attenuated clinic scope.',
      },
      clinicId: clinicA,
      query,
      scope: [clinicB],
    });

    const response = await postFeedback(postRequest('/api/beta/feedback'));

    expect(response.status).toBe(201);
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: clinicB })
    );
    expect(query.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: clinicA })
    );
  });

  it('uses the canonical JWT subset clinic when backlog affectedClinics is omitted', async () => {
    const query = new ReadQueryMock();
    mockProcessSuccess({
      body: {
        title: 'Canonical backlog item',
        description: 'The default affected clinic must stay attenuated.',
        category: 'feature',
        priority: 'high',
        estimatedEffort: 'm',
        businessValue: 8,
      },
      clinicId: clinicA,
      query,
      scope: [clinicB],
    });

    const response = await postBacklog(postRequest('/api/beta/backlog'));

    expect(response.status).toBe(201);
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ affected_clinics: [clinicB] })
    );
    expect(query.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ affected_clinics: [clinicA] })
    );
  });

  it('filters mixed-scope backlog rows instead of leaking them through overlap', async () => {
    const query = new ReadQueryMock([
      { id: 'in-scope', affected_clinics: [clinicA] },
      { id: 'mixed-scope', affected_clinics: [clinicA, clinicB] },
      { id: 'out-of-scope', affected_clinics: [clinicB] },
      { id: 'unscoped', affected_clinics: [] },
    ]);
    mockProcessSuccess({ query, scope: [clinicA] });

    const response = await getBacklog(
      new NextRequest('http://localhost/api/beta/backlog')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.backlog).toEqual([
      { id: 'in-scope', affected_clinics: [clinicA] },
    ]);
    expect(query.overlaps).toHaveBeenCalledWith('affected_clinics', [clinicA]);
    expect(query.containedBy).toHaveBeenCalledWith('affected_clinics', [
      clinicA,
    ]);
  });

  it.each([
    {
      name: 'metrics POST',
      invoke: () => postMetrics(postRequest('/api/beta/metrics')),
      body: {
        clinicId: clinicA,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-07-02T00:00:00.000Z',
      },
    },
    {
      name: 'feedback PATCH',
      invoke: () => patchFeedback(patchRequest('/api/beta/feedback')),
      body: { id: feedbackId, status: 'resolved' },
    },
    {
      name: 'backlog POST',
      invoke: () => postBacklog(postRequest('/api/beta/backlog')),
      body: {
        title: 'Scoped backlog item',
        description: 'This item must remain inside canonical scope.',
        category: 'feature',
        priority: 'high',
        estimatedEffort: 'm',
        businessValue: 8,
        affectedClinics: [clinicA],
      },
    },
  ])(
    'does not let a stale profiles.admin row revive $name when user_permissions is non-admin',
    async ({ body, invoke }) => {
      const { from } = mockProcessSuccess({
        body,
        role: 'staff',
        scope: [clinicA],
      });

      const response = await invoke();

      expect(response.status).toBe(403);
      expect(from).not.toHaveBeenCalled();
      expect(createAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it('never reads profiles.role or profiles.clinic_id in beta authority routes', () => {
    const routePaths = [
      'src/app/api/beta/metrics/route.ts',
      'src/app/api/beta/feedback/route.ts',
      'src/app/api/beta/backlog/route.ts',
    ];

    for (const routePath of routePaths) {
      const source = readFileSync(
        path.resolve(process.cwd(), routePath),
        'utf8'
      );
      expect(source).not.toContain(".from('profiles')");
      expect(source).not.toContain('.auth.getUser()');
      expect(source).toContain('processApiRequest');
    }

    expect(resolveScopedClinicIdsMock).toBeDefined();
  });
});

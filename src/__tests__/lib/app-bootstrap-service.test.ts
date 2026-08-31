import {
  createAdminClient,
  createScopedAdminContext,
  type SupabaseServerClient,
  type UserAccessContext,
  type VerifiedSubject,
} from '@/lib/supabase';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { buildAppBootstrap } from '@/lib/app-bootstrap/service';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/supabase', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/supabase')>('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

const mockCreateAdminClient = jest.mocked(createAdminClient);
const mockCreateScopedAdminContext = jest.mocked(createScopedAdminContext);
const mockResolveManagerAssignedClinicsWithinScope = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);

const user = {
  id: 'user-1',
  email: 'staff@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-08-31T00:00:00.000Z',
};

function createSubject(): VerifiedSubject {
  return { user } as VerifiedSubject;
}

function createAccessContext(
  overrides: Partial<UserAccessContext> = {}
): UserAccessContext {
  return {
    permissions: { role: 'staff', clinic_id: 'clinic-1' },
    role: 'staff',
    normalizedRole: 'staff',
    clinicId: 'clinic-1',
    isActive: true,
    isAdmin: false,
    ...overrides,
  };
}

function createClinicsClient(
  rows: readonly Record<string, unknown>[],
  error: unknown = null
) {
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    returns: jest.fn().mockResolvedValue({ data: rows, error }),
  };
  const getUser = jest.fn();
  const client = {
    auth: { getUser },
    from: jest.fn().mockReturnValue(query),
  } as SupabaseServerClient;

  return { client, getUser, query };
}

describe('buildAppBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('staffはcanonical clinicを1回だけ取得し、subjectを再検証しない', async () => {
    const { client, getUser, query } = createClinicsClient([
      { id: 'clinic-1', name: '本院' },
    ]);

    const result = await buildAppBootstrap({
      subject: createSubject(),
      accessContext: createAccessContext(),
      supabase: client,
      now: () => new Date('2026-08-31T01:02:03.000Z'),
    });

    expect(getUser).not.toHaveBeenCalled();
    expect(query.in).toHaveBeenCalledWith('id', ['clinic-1']);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(result).toEqual({
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
      generatedAt: '2026-08-31T01:02:03.000Z',
    });
  });

  it('adminはexact canonical scope内のactive子院だけを選択肢にする', async () => {
    const { client: requestClient } = createClinicsClient([]);
    const { client: adminClient, query } = createClinicsClient([
      { id: 'parent-1', name: '本部', parent_id: null },
      { id: 'child-1', name: '新宿院', parent_id: 'parent-1' },
    ]);
    mockCreateScopedAdminContext.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['parent-1', 'child-1'],
      assertClinicInScope: jest.fn(),
    });

    const result = await buildAppBootstrap({
      subject: createSubject(),
      accessContext: createAccessContext({
        permissions: {
          role: 'admin',
          clinic_id: 'parent-1',
          clinic_scope_ids: ['parent-1', 'child-1'],
        },
        role: 'admin',
        normalizedRole: 'admin',
        clinicId: 'parent-1',
        isAdmin: true,
      }),
      supabase: requestClient,
    });

    expect(query.in).toHaveBeenCalledWith('id', ['parent-1', 'child-1']);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(result.clinics).toEqual([{ id: 'child-1', name: '新宿院' }]);
    expect(result.currentClinicId).toBeNull();
    expect(result.profile.clinicName).toBe('本部');
  });

  it('managerはDB assignmentとcanonical JWT intersectionの結果だけを使う', async () => {
    const { client: requestClient, getUser } = createClinicsClient([]);
    const adminClient = { from: jest.fn() } as SupabaseServerClient;
    mockCreateAdminClient.mockReturnValue(adminClient);
    mockResolveManagerAssignedClinicsWithinScope.mockResolvedValue([
      {
        id: 'assignment-2',
        manager_user_id: 'user-1',
        clinic_id: 'clinic-2',
        clinic_name: '渋谷院',
        assigned_at: '2026-08-31T00:00:00.000Z',
        revoked_at: null,
      },
      {
        id: 'assignment-1',
        manager_user_id: 'user-1',
        clinic_id: 'clinic-1',
        clinic_name: '池袋院',
        assigned_at: '2026-08-31T00:00:00.000Z',
        revoked_at: null,
      },
    ]);

    const result = await buildAppBootstrap({
      subject: createSubject(),
      accessContext: createAccessContext({
        permissions: {
          role: 'manager',
          clinic_id: 'outside-primary',
          clinic_scope_ids: ['clinic-1', 'clinic-2'],
        },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: 'clinic-1',
      }),
      supabase: requestClient,
    });

    expect(getUser).not.toHaveBeenCalled();
    expect(mockResolveManagerAssignedClinicsWithinScope).toHaveBeenCalledWith(
      adminClient,
      'user-1',
      ['clinic-1', 'clinic-2']
    );
    expect(result.clinics).toEqual([
      { id: 'clinic-2', name: '渋谷院' },
      { id: 'clinic-1', name: '池袋院' },
    ]);
    expect(result.currentClinicId).toBe('clinic-2');
    expect(result.profile.clinicName).toBe('池袋院');
    expect(mockCreateScopedAdminContext).not.toHaveBeenCalled();
  });

  it('manager assignment authority 503はpartial successへ変換しない', async () => {
    const { client: requestClient } = createClinicsClient([]);
    const adminClient = { from: jest.fn() } as SupabaseServerClient;
    mockCreateAdminClient.mockReturnValue(adminClient);
    const authorityError = new AppError(
      ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
      'sensitive assignment backend detail',
      503
    );
    mockResolveManagerAssignedClinicsWithinScope.mockRejectedValue(
      authorityError
    );

    await expect(
      buildAppBootstrap({
        subject: createSubject(),
        accessContext: createAccessContext({
          permissions: {
            role: 'manager',
            clinic_id: 'clinic-1',
            clinic_scope_ids: ['clinic-1'],
          },
          role: 'manager',
          normalizedRole: 'manager',
          clinicId: 'clinic-1',
        }),
        supabase: requestClient,
      })
    ).rejects.toBe(authorityError);
  });

  it('clinic query failureは空clinicとclinic専用errorを返し、profileは維持する', async () => {
    const { client } = createClinicsClient([], new Error('database offline'));

    const result = await buildAppBootstrap({
      subject: createSubject(),
      accessContext: createAccessContext(),
      supabase: client,
    });

    expect(result.profile.id).toBe('user-1');
    expect(result.profile.clinicName).toBeNull();
    expect(result.clinics).toEqual([]);
    expect(result.currentClinicId).toBeNull();
    expect(result.errors).toEqual({
      profile: null,
      clinics: '利用可能なクリニック一覧の取得に失敗しました',
    });
  });
});

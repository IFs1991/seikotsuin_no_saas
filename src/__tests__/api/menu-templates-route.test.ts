import { processApiRequest } from '@/lib/api-helpers';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';
import { createScopedAdminContext } from '@/lib/supabase';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const parentClinicId = '00000000-0000-0000-0000-0000000000a1';
const childClinicId = '00000000-0000-0000-0000-0000000000b1';
const templateId = '00000000-0000-0000-0000-0000000000c1';
const userId = '00000000-0000-0000-0000-000000000001';

const makeRequest = (url: string, init?: RequestInit) =>
  new NextRequest(url, init);

describe('GET /api/menu-templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a child clinic to its parent template owner', async () => {
    const userScopedSupabase = { from: jest.fn() };
    const childClinicQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: childClinicId,
          name: '子院',
          parent_id: parentClinicId,
        },
        error: null,
      }),
    };
    const parentClinicQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: parentClinicId,
          name: '本部院',
          parent_id: null,
        },
        error: null,
      }),
    };
    const templatesOrder = jest.fn().mockResolvedValue({
      data: [
        {
          id: templateId,
          owner_clinic_id: parentClinicId,
          name: '自費整体 60分',
          description: '全身調整',
          category: 'treatment',
          price: 6000,
          duration_minutes: 60,
          is_insurance_applicable: false,
          options: [],
          is_active: true,
          display_order: 1,
        },
      ],
      error: null,
    });
    const templatesEqDeleted = jest.fn().mockReturnValue({
      order: templatesOrder,
    });
    const templatesEqOwner = jest.fn().mockReturnValue({
      eq: templatesEqDeleted,
    });
    const templatesSelect = jest.fn().mockReturnValue({
      eq: templatesEqOwner,
    });
    const clinicQueries = [childClinicQuery, parentClinicQuery];
    const from = jest.fn().mockImplementation((table: string) => {
      if (table === 'clinics') {
        return clinicQueries.shift();
      }
      if (table === 'menu_templates') {
        return { select: templatesSelect };
      }
      return {};
    });
    const assertClinicInScope = jest.fn();
    const permissions = {
      role: 'clinic_admin',
      clinic_id: childClinicId,
      clinic_scope_ids: [childClinicId],
    };

    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: userId, email: 'admin@example.com', role: 'clinic_admin' },
      permissions,
      supabase: userScopedSupabase,
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/menu-templates/route');
    const response = await GET(
      makeRequest(
        `http://localhost/api/menu-templates?clinic_id=${childClinicId}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clinicId: childClinicId,
        requireClinicMatch: true,
        allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
      })
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(permissions);
    expect(assertClinicInScope).toHaveBeenCalledWith(childClinicId);
    expect(userScopedSupabase.from).not.toHaveBeenCalled();
    expect(body.data).toMatchObject({
      ownerClinicId: parentClinicId,
      ownerClinicName: '本部院',
      targetClinicId: childClinicId,
      isOwnerClinic: false,
      templates: [
        {
          id: templateId,
          ownerClinicId: parentClinicId,
          durationMinutes: 60,
        },
      ],
    });
  });
});

describe('POST /api/menu-templates/import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('imports a parent template into the selected child clinic menu list', async () => {
    const clinicQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: childClinicId,
          name: '子院',
          parent_id: parentClinicId,
        },
        error: null,
      }),
    };
    const templateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: templateId,
          owner_clinic_id: parentClinicId,
          name: '保険施術 30分',
          description: '保険適用の基本施術枠',
          category: 'treatment',
          price: 0,
          duration_minutes: 30,
          is_insurance_applicable: true,
          options: [],
          is_active: true,
          display_order: 1,
        },
        error: null,
      }),
    };
    const insertSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'menu-1',
        clinic_id: childClinicId,
        name: '保険施術 30分',
        description: '保険適用の基本施術枠',
        category: 'treatment',
        price: 0,
        duration_minutes: 30,
        is_insurance_applicable: true,
        options: [],
        is_active: true,
      },
      error: null,
    });
    const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
    const insert = jest.fn().mockReturnValue({ select: insertSelect });
    const templateProfilesQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    templateProfilesQuery.select.mockReturnValue(templateProfilesQuery);
    templateProfilesQuery.eq.mockReturnValue(templateProfilesQuery);
    const from = jest.fn().mockImplementation((table: string) => {
      if (table === 'clinics') return clinicQuery;
      if (table === 'menu_templates') return templateQuery;
      if (table === 'menu_template_billing_profiles') {
        return templateProfilesQuery;
      }
      if (table === 'menus') return { insert };
      return {};
    });
    const assertClinicInScope = jest.fn();

    processApiRequestMock.mockResolvedValue({
      success: true,
      body: {
        clinic_id: childClinicId,
        template_id: templateId,
      },
      auth: { id: userId, email: 'admin@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: childClinicId,
        clinic_scope_ids: [childClinicId],
      },
      supabase: { from },
    });
    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: childClinicId,
        template_id: templateId,
      },
      auth: { id: userId, email: 'admin@example.com', role: 'clinic_admin' },
      permissions: {
        role: 'clinic_admin',
        clinic_id: childClinicId,
        clinic_scope_ids: [childClinicId],
      },
      supabase: { from },
    });
    createScopedAdminContextMock.mockReturnValue({
      client: { from },
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/menu-templates/import/route');
    const response = await POST(
      makeRequest('http://localhost/api/menu-templates/import', {
        method: 'POST',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      id: 'menu-1',
      clinicId: childClinicId,
      durationMinutes: 30,
      isInsuranceApplicable: true,
    });
    expect(processClinicScopedBodyMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { allowedRoles: Array.from(CLINIC_ADMIN_ROLES) }
    );
    expect(createScopedAdminContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_scope_ids: [childClinicId] })
    );
    expect(assertClinicInScope).toHaveBeenCalledWith(childClinicId);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: childClinicId,
        created_by: userId,
        name: '保険施術 30分',
        duration_minutes: 30,
        is_insurance_applicable: true,
      })
    );
  });
});

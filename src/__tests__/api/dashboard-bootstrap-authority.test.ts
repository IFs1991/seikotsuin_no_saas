import { createServerClient } from '@supabase/ssr';
import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/dashboard/bootstrap/route';
import { AuditLogger } from '@/lib/audit-logger';
import { env } from '@/lib/env';
import {
  setSupabaseClientFactory,
  resetSupabaseClientFactory,
} from '@/lib/supabase';
import type { Database } from '@/types/supabase';

jest.unmock('@supabase/supabase-js');
jest.unmock('@/lib/audit-logger');

const primary = '10000000-0000-4000-8000-000000000001';
const child = '10000000-0000-4000-8000-000000000002';
const outside = '20000000-0000-4000-8000-000000000001';
const user: User = {
  id: '30000000-0000-4000-8000-000000000001',
  email: 'bootstrap@example.invalid',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-05-01T00:00:00Z',
};

type Scenario = {
  role: string;
  clinicId?: string | null;
  jwtScope?: string[];
  assignments?: string[];
  inactive?: boolean;
  unauthenticated?: boolean;
  permissionError?: boolean;
};
type Hit = { client: 'scoped' | 'authority'; url: URL };

async function arrange(scenario: Scenario) {
  jest.replaceProperty(env, 'SUPABASE_SERVICE_ROLE_KEY', 'fixture-authority');
  const hits: Hit[] = [];
  const claim = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { clinic_scope_ids: scenario.jwtScope },
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url'
    ),
    Buffer.from(JSON.stringify(claim)).toString('base64url'),
    Buffer.from('fixture').toString('base64url'),
  ].join('.');

  function transport(client: Hit['client']): typeof fetch {
    return async input => {
      const url = new URL(new Request(input).url);
      const params = url.searchParams;
      hits.push({ client, url });
      switch (url.pathname) {
        case '/auth/v1/user':
          return Response.json(user);
        case '/rest/v1/user_permissions':
          if (scenario.permissionError)
            return Response.json(
              { code: '42501', message: 'private fixture detail' },
              { status: 403 }
            );
          return Response.json([
            {
              role: scenario.role,
              clinic_id:
                scenario.clinicId === undefined ? primary : scenario.clinicId,
            },
          ]);
        case '/rest/v1/profiles':
          return Response.json([{ is_active: !scenario.inactive }]);
        case '/rest/v1/manager_clinic_assignments':
          return Response.json(
            (scenario.assignments ?? [child]).map(clinic_id => ({ clinic_id }))
          );
        case '/rest/v1/clinics':
          if (params.get('select') === 'name') {
            return Response.json([
              { name: params.get('id') === 'eq.' + child ? '分院' : '本院' },
            ]);
          }
          return Response.json(
            params.has('or')
              ? [
                  { id: primary, parent_id: null },
                  { id: child, parent_id: primary },
                ]
              : [{ id: primary, parent_id: null }]
          );
        case '/rest/v1/daily_reports':
          return Response.json(
            params.get('select')?.includes('count()')
              ? [{ totalReports: 0, totalPatients: null, totalRevenue: null }]
              : []
          );
        default:
          throw new Error('Unexpected bootstrap request: ' + url.pathname);
      }
    };
  }

  const scoped = createClient<Database>('http://localhost:1', 'fixture', {
    global: { fetch: transport('scoped') },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const authority = createClient<Database>('http://localhost:1', 'fixture', {
    global: { fetch: transport('authority') },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  setSupabaseClientFactory(async () => scoped);
  jest.mocked(createServerClient).mockReturnValue(authority);
  if (!scenario.unauthenticated) {
    const { error } = await scoped.auth.setSession({
      access_token: token,
      refresh_token: 'fixture',
    });
    if (error) throw error;
    hits.length = 0; // Measure the route after the fixture has signed in.
  }
  return hits;
}

function get(clinicId?: string) {
  const url = new URL('http://localhost/api/dashboard/bootstrap');
  if (clinicId) url.searchParams.set('clinic_id', clinicId);
  return GET(new NextRequest(url));
}

describe('dashboard bootstrap through the clinic guard and Supabase transport', () => {
  beforeEach(() => {
    jest
      .spyOn(AuditLogger, 'logUnauthorizedAccess')
      .mockResolvedValue(undefined);
  });
  afterEach(() => {
    resetSupabaseClientFactory();
    jest.restoreAllMocks();
  });

  it.each([
    {
      role: 'staff',
      requested: primary,
      home: primary,
      name: '本院',
      isAdmin: false,
      clinicLookups: 0,
    },
    {
      role: 'admin',
      requested: child,
      home: primary,
      name: '分院',
      isAdmin: true,
      clinicLookups: 2,
    },
    {
      role: 'manager',
      requested: child,
      home: child,
      name: '分院',
      isAdmin: true,
      clinicLookups: 0,
    },
  ])(
    'reads authority once and returns the scoped profile for $role',
    async ({ role, requested, home, name, isAdmin, clinicLookups }) => {
      const hits = await arrange({ role });
      const response = await get(requested);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        data: {
          profile: {
            id: user.id,
            email: user.email,
            role,
            clinicId: home,
            clinicName: name,
            isActive: true,
            isAdmin,
          },
          dailyReports: {
            reports: [],
            summary: {
              totalReports: 0,
              averagePatients: 0,
              averageRevenue: 0,
              totalRevenue: 0,
            },
            monthlyTrends: [],
          },
        },
      });
      const calls = (client: Hit['client'], path: string) =>
        hits.filter(hit => hit.client === client && hit.url.pathname === path);
      expect(calls('scoped', '/auth/v1/user')).toHaveLength(1);
      expect(
        calls('authority', '/rest/v1/user_permissions').map(hit =>
          hit.url.searchParams.get('staff_id')
        )
      ).toEqual(['eq.' + user.id]);
      expect(
        calls('scoped', '/rest/v1/profiles').map(hit =>
          hit.url.searchParams.get('user_id')
        )
      ).toEqual(['eq.' + user.id]);
      expect(calls('authority', '/rest/v1/clinics')).toHaveLength(
        clinicLookups
      );
      const assignments = calls(
        'authority',
        '/rest/v1/manager_clinic_assignments'
      );
      expect(
        assignments.map(hit => [
          hit.url.searchParams.get('manager_user_id'),
          hit.url.searchParams.get('revoked_at'),
        ])
      ).toEqual(role === 'manager' ? [['eq.' + user.id, 'is.null']] : []);
      expect(
        calls('scoped', '/rest/v1/clinics').map(hit =>
          hit.url.searchParams.get('id')
        )
      ).toEqual(['eq.' + requested]);
      expect(
        calls('scoped', '/rest/v1/daily_reports').map(hit =>
          hit.url.searchParams.get('clinic_id')
        )
      ).toEqual(Array(3).fill('eq.' + requested));
    }
  );

  it.each<{
    label: string;
    scenario: Scenario;
    requested?: string;
    status: number;
  }>([
    {
      label: 'other tenant',
      scenario: { role: 'staff' },
      requested: outside,
      status: 403,
    },
    {
      label: 'inactive profile',
      scenario: { role: 'staff', inactive: true },
      requested: primary,
      status: 403,
    },
    {
      label: 'revoked manager assignment with stale claims',
      scenario: { role: 'manager', jwtScope: [child], assignments: [] },
      requested: child,
      status: 403,
    },
    {
      label: 'admin narrowed by JWT',
      scenario: { role: 'admin', jwtScope: [primary] },
      requested: child,
      status: 403,
    },
    {
      label: 'unrecognized authority role',
      scenario: { role: 'unrecognized' },
      requested: primary,
      status: 403,
    },
    {
      label: 'unset clinic',
      scenario: { role: 'staff', clinicId: null },
      requested: primary,
      status: 403,
    },
    {
      label: 'anonymous',
      scenario: { role: 'staff', unauthenticated: true },
      requested: primary,
      status: 401,
    },
    {
      label: 'authority query error',
      scenario: { role: 'staff', permissionError: true },
      requested: primary,
      status: 503,
    },
    {
      label: 'missing fallback clinic',
      scenario: { role: 'staff', clinicId: null },
      status: 403,
    },
    {
      label: 'anonymous fallback',
      scenario: { role: 'staff', unauthenticated: true },
      status: 401,
    },
    {
      label: 'authority query error during fallback',
      scenario: { role: 'staff', permissionError: true },
      status: 503,
    },
  ])(
    'rejects $label before reading the requested clinic or reports',
    async ({ scenario, requested, status }) => {
      const hits = await arrange(scenario);
      const response = await get(requested);
      expect(response.status).toBe(status);
      if (status === 503) {
        expect(await response.json()).toEqual({
          success: false,
          error: '認証情報を確認できません。時間をおいて再度お試しください',
        });
      }
      expect(
        hits.filter(
          ({ url }) =>
            url.pathname === '/rest/v1/daily_reports' ||
            (url.pathname === '/rest/v1/clinics' &&
              url.searchParams.get('select') === 'name')
        )
      ).toEqual([]);
    }
  );
});

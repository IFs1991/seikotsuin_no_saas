const getServerClientMock = jest.fn();
const createAdminClientMock = jest.fn();

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('next/headers', () => ({ headers: jest.fn() }));

jest.mock('@/lib/supabase', () => ({
  getServerClient: () => getServerClientMock(),
  createAdminClient: () => createAdminClientMock(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logFailedLogin: jest.fn(),
    logLogin: jest.fn(),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'commercial-red-contract',
  })),
}));

jest.mock('@/lib/env', () => ({
  assertEnv: jest.fn(() => 'https://app.example.com'),
}));

import { acceptInvite } from '@/app/(public)/invite/actions';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const ORIGINAL_CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const INVITED_CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const PARTIAL_COMMIT_MARKER =
  'RED COMM-INVITE-003: PARTIAL_COMMIT_STATE_MISMATCH';

type MutableState = {
  profile: {
    user_id: string;
    clinic_id: string;
    role: string;
    updated_at: string;
  };
  permission: {
    staff_id: string;
    clinic_id: string;
    role: string;
  };
  invite: {
    accepted_at: string | null;
    accepted_by: string | null;
  };
};

function createStatefulAdminClient(state: MutableState) {
  const inviteRow = {
    accepted_at: state.invite.accepted_at,
    accepted_by: state.invite.accepted_by,
    clinic_id: INVITED_CLINIC_ID,
    created_at: '2026-07-10T00:00:00.000Z',
    created_by: 'admin-1',
    email: 'invited@example.com',
    expires_at: '2099-07-10T00:00:00.000Z',
    id: '33333333-3333-4333-8333-333333333333',
    role: 'staff',
    token: TOKEN,
    updated_at: '2026-07-10T00:00:00.000Z',
  };

  const staffInvitesTable = {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gt: jest.fn(() => ({
          is: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: inviteRow,
              error: null,
            }),
          })),
        })),
      })),
    })),
  };

  const profilesTable = {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: '44444444-4444-4444-8444-444444444444' },
          error: null,
        }),
      })),
    })),
    update: jest.fn(
      (changes: Partial<MutableState['profile']>) => ({
        eq: jest.fn().mockImplementation(async () => {
          Object.assign(state.profile, changes);
          return { error: null };
        }),
      })
    ),
  };

  const permissionsTable = {
    upsert: jest.fn().mockResolvedValue({
      error: { message: 'simulated permission write failure' },
    }),
  };

  return {
    from: jest.fn((table: string) => {
      if (table === 'staff_invites') return staffInvitesTable;
      if (table === 'profiles') return profilesTable;
      if (table === 'user_permissions') return permissionsTable;
      throw new Error('Unexpected table: ' + table);
    }),
  };
}

describe('staff invite acceptance must be atomic', () => {
  it('rolls profile, permission, and invite state back when permission upsert fails', async () => {
    const state: MutableState = {
      profile: {
        user_id: 'user-1',
        clinic_id: ORIGINAL_CLINIC_ID,
        role: 'therapist',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      permission: {
        staff_id: 'user-1',
        clinic_id: ORIGINAL_CLINIC_ID,
        role: 'therapist',
      },
      invite: {
        accepted_at: null,
        accepted_by: null,
      },
    };
    const originalState = structuredClone(state);

    getServerClientMock.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'invited@example.com' },
          },
          error: null,
        }),
      },
    });
    createAdminClientMock.mockReturnValue(createStatefulAdminClient(state));

    await expect(acceptInvite(TOKEN)).resolves.toMatchObject({
      success: false,
    });

    // Secure target contract. Emit the RED marker only at this exact boundary:
    // the action returned failure but left a partial write behind.
    if (JSON.stringify(state) !== JSON.stringify(originalState)) {
      throw new Error(PARTIAL_COMMIT_MARKER);
    }
  });
});

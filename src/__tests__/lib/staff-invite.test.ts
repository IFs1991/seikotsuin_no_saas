import {
  buildStaffInviteRedirectUrl,
  createStaffInviteToken,
  sendStaffInviteEmail,
  StaffInviteDeliveryTimeoutError,
  type StaffInviteEmailClient,
  validateStaffInviteAccount,
} from '@/lib/auth/staff-invite';

type InviteUserByEmail =
  StaffInviteEmailClient['auth']['admin']['inviteUserByEmail'];

function createEmailClient() {
  const inviteUserByEmail: jest.MockedFunction<InviteUserByEmail> = jest.fn();
  const client: StaffInviteEmailClient = {
    auth: { admin: { inviteUserByEmail } },
  };

  return { client, inviteUserByEmail };
}

describe('staff invite policy and delivery', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('binds an invite to the normalized account email', () => {
    expect(
      validateStaffInviteAccount({
        inviteEmail: 'Staff@Example.com',
        accountEmail: ' staff@example.com ',
        inviteRole: 'staff',
      })
    ).toEqual({ success: true, role: 'staff' });

    expect(
      validateStaffInviteAccount({
        inviteEmail: 'staff@example.com',
        accountEmail: 'other@example.com',
        inviteRole: 'staff',
      })
    ).toEqual({ success: false, reason: 'email_mismatch' });
  });

  it('rejects privileged or unknown roles at the acceptance boundary', () => {
    expect(
      validateStaffInviteAccount({
        inviteEmail: 'staff@example.com',
        accountEmail: 'staff@example.com',
        inviteRole: 'admin',
      })
    ).toEqual({ success: false, reason: 'invalid_role' });
  });

  it('creates an opaque UUID token and carries it through the auth callback', () => {
    const token = createStaffInviteToken();

    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(buildStaffInviteRedirectUrl('https://app.example.com', token)).toBe(
      `https://app.example.com/admin/callback?next=%2Finvite%3Ftoken%3D${token}`
    );
  });

  it('sends the normalized email with the canonical acceptance URL', async () => {
    const { client, inviteUserByEmail } = createEmailClient();
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await sendStaffInviteEmail({
      adminClient: client,
      appUrl: 'https://app.example.com',
      email: ' Staff@Example.com ',
      token: '550e8400-e29b-41d4-a716-446655440000',
      metadata: { full_name: 'Test Staff' },
    });

    expect(inviteUserByEmail).toHaveBeenCalledWith('staff@example.com', {
      redirectTo:
        'https://app.example.com/admin/callback?next=%2Finvite%3Ftoken%3D550e8400-e29b-41d4-a716-446655440000',
      data: { full_name: 'Test Staff' },
    });
  });

  it('fails with a stable timeout error when the provider hangs', async () => {
    jest.useFakeTimers();
    const { client, inviteUserByEmail } = createEmailClient();
    inviteUserByEmail.mockReturnValue(new Promise(() => undefined));

    const delivery = sendStaffInviteEmail({
      adminClient: client,
      appUrl: 'https://app.example.com',
      email: 'staff@example.com',
      token: '550e8400-e29b-41d4-a716-446655440000',
      timeoutMs: 100,
    });
    const rejection = expect(delivery).rejects.toBeInstanceOf(
      StaffInviteDeliveryTimeoutError
    );

    await jest.advanceTimersByTimeAsync(100);
    await rejection;
  });
});

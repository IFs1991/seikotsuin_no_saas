import { ERROR_CODES } from '@/lib/error-handler';
import {
  getVerifiedSubjectAuthorityInput,
  getVerifiedSubjectServerTiming,
  resolveVerifiedSubject,
} from '@/lib/supabase/request-auth-context';
import { getUserAccessContextForVerifiedSubject } from '@/lib/supabase/server';

function createUser(id: string) {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-31T00:00:00.000Z',
  };
}

function createClient(input?: {
  userId?: string | null;
  sessionUserId?: string;
  getUserError?: unknown;
  getSessionError?: unknown;
}) {
  const userId = input?.userId === undefined ? 'verified-user' : input.userId;
  const verifiedUser = userId ? createUser(userId) : null;
  const sessionUser = createUser(input?.sessionUserId ?? 'cookie-user');
  const getUser = jest.fn().mockResolvedValue({
    data: { user: verifiedUser },
    error: input?.getUserError ?? null,
  });
  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: {
        user: sessionUser,
        access_token: 'header.payload.signature',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      },
    },
    error: input?.getSessionError ?? null,
  });

  return {
    client: {
      auth: { getUser, getSession },
      from: jest.fn(),
    },
    getUser,
    getSession,
  };
}

describe('request-local VerifiedSubject', () => {
  it('uses auth.getUser as the subject and reads the session only for claims', async () => {
    const { client, getUser, getSession } = createClient({
      userId: 'verified-user',
      sessionUserId: 'forged-cookie-user',
    });

    const subject = await resolveVerifiedSubject(client);

    expect(subject?.user.id).toBe('verified-user');
    expect(subject?.session?.user.id).toBe('forged-cookie-user');
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('returns null without consulting the session when getUser cannot verify a user', async () => {
    const { client, getUser, getSession } = createClient({ userId: null });

    await expect(resolveVerifiedSubject(client)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('maps a session lookup failure to the existing authority 503 contract', async () => {
    const { client } = createClient({
      getSessionError: {
        message: 'session unavailable',
        code: 'AUTH500',
      },
    });

    await expect(resolveVerifiedSubject(client)).rejects.toMatchObject({
      code: ERROR_CODES.DATABASE_CONNECTION_ERROR,
      statusCode: 503,
    });
  });

  it('rejects using a verified subject with a different Supabase client', async () => {
    const first = createClient();
    const second = createClient();
    const subject = await resolveVerifiedSubject(first.client);

    if (!subject) {
      throw new Error('Expected a verified subject');
    }

    await expect(
      getUserAccessContextForVerifiedSubject(subject, second.client)
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
    });
    expect(second.client.from).not.toHaveBeenCalled();
  });

  it('keeps immutable authority scalars when exposed snapshots are mutated', async () => {
    const { client } = createClient({ userId: 'verified-user' });
    const subject = await resolveVerifiedSubject(client);

    if (!subject) {
      throw new Error('Expected a verified subject');
    }

    expect(Reflect.set(subject.user, 'id', 'attacker-user')).toBe(false);
    if (subject.session) {
      expect(
        Reflect.set(subject.session, 'access_token', 'attacker-token')
      ).toBe(false);
    }
    expect(getVerifiedSubjectAuthorityInput(subject)).toEqual({
      userId: 'verified-user',
      accessToken: 'header.payload.signature',
    });
  });

  it('emits only bounded Server-Timing metric names and durations', async () => {
    const { client } = createClient({ userId: 'sensitive-user-id' });
    const subject = await resolveVerifiedSubject(client);

    if (!subject) {
      throw new Error('Expected a verified subject');
    }

    const header = getVerifiedSubjectServerTiming(subject);

    expect(header).toContain('auth_user;dur=');
    expect(header).toContain('auth_session;dur=');
    expect(header).toContain('total;dur=');
    expect(header).not.toContain('sensitive-user-id');
    expect(header).not.toContain('refresh-token');
  });
});

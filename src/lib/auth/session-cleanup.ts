import { cookies } from 'next/headers';

type AuthSessionClient = {
  auth: {
    signOut: () => PromiseLike<{ error?: unknown } | undefined>;
  };
};

type AuthCookieStore = {
  getAll: () => Array<{ name: string }>;
  delete: (name: string) => void;
};

type AuthCookieStoreProvider =
  | (() => AuthCookieStore)
  | (() => PromiseLike<AuthCookieStore>);

export type AuthSessionCleanupResult = {
  complete: boolean;
  signOutError: unknown | null;
  cookieCleanupError: unknown | null;
};

function isSupabaseAuthCookie(cookieName: string): boolean {
  return cookieName.startsWith('sb-') && cookieName.includes('-auth-token');
}

/**
 * Clear a newly-created session after an authorization denial. Supabase can
 * resolve signOut with an error before its SSR cookie adapter runs, so that
 * result must be handled separately from thrown failures.
 */
export async function clearRejectedAuthSession(
  client: AuthSessionClient,
  getCookieStore: AuthCookieStoreProvider = cookies
): Promise<AuthSessionCleanupResult> {
  let signOutError: unknown | null = null;

  try {
    const result = await client.auth.signOut();
    signOutError = result?.error ?? null;
  } catch (error) {
    signOutError = error;
  }

  if (!signOutError) {
    return {
      complete: true,
      signOutError: null,
      cookieCleanupError: null,
    };
  }

  try {
    const cookieStore = await getCookieStore();
    for (const cookie of cookieStore.getAll()) {
      if (isSupabaseAuthCookie(cookie.name)) {
        cookieStore.delete(cookie.name);
      }
    }

    return {
      complete: true,
      signOutError,
      cookieCleanupError: null,
    };
  } catch (cookieCleanupError) {
    return {
      complete: false,
      signOutError,
      cookieCleanupError,
    };
  }
}

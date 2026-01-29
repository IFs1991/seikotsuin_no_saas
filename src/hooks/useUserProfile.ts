'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { useOptionalUserProfileContext } from '@/providers/user-profile-context';
import type { UserProfile } from '@/types/user-profile';
import { CLINIC_ADMIN_ROLES, type Role } from '@/lib/constants/roles';

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

// Q4決定: isAdmin に manager を含める（統一）
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
// CLINIC_ADMIN_ROLES = admin, clinic_admin, manager
const ADMIN_ROLES = CLINIC_ADMIN_ROLES;
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const SESSION_FETCH_TIMEOUT_MS = 2000;

const resolveRole = (user: User): string | null => {
  const appMeta = user.app_metadata as
    | Record<string, unknown>
    | null
    | undefined;
  const userMeta = user.user_metadata as
    | Record<string, unknown>
    | null
    | undefined;
  const roleCandidate =
    appMeta?.user_role ??
    appMeta?.role ??
    userMeta?.role ??
    userMeta?.user_role ??
    null;

  return typeof roleCandidate === 'string' ? roleCandidate : null;
};

const resolveClinicId = (user: User): string | null => {
  const appMeta = user.app_metadata as
    | Record<string, unknown>
    | null
    | undefined;
  const userMeta = user.user_metadata as
    | Record<string, unknown>
    | null
    | undefined;
  const clinicCandidate = appMeta?.clinic_id ?? userMeta?.clinic_id ?? null;

  return typeof clinicCandidate === 'string' ? clinicCandidate : null;
};

const buildProfileFromUser = (user: User): UserProfile => {
  const role = resolveRole(user);
  const clinicId = resolveClinicId(user);

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    clinicId,
    isActive: true,
    isAdmin: role ? ADMIN_ROLES.has(role as Role) : false,
  };
};

const decodeBase64Url = (value: string): string | null => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = normalized + (padding ? '='.repeat(4 - padding) : '');

  try {
    return typeof atob === 'function' ? atob(padded) : null;
  } catch {
    return null;
  }
};

const getAuthCookieValue = (): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const rawCookies = document.cookie ? document.cookie.split(';') : [];
  const cookies = new Map<string, string>();

  for (const entry of rawCookies) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) continue;
    const name = decodeURIComponent(trimmed.slice(0, separatorIndex));
    const value = trimmed.slice(separatorIndex + 1);
    cookies.set(name, value);
  }

  const baseNames = new Set<string>();
  for (const name of cookies.keys()) {
    const baseName = name.split('.')[0];
    if (baseName.startsWith('sb-') && baseName.endsWith('-auth-token')) {
      baseNames.add(baseName);
    }
  }

  for (const baseName of baseNames) {
    const direct = cookies.get(baseName);
    if (direct) {
      return direct;
    }

    const prefix = `${baseName}.`;
    const chunks = Array.from(cookies.entries())
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, value]) => ({
        index: Number(name.slice(prefix.length)),
        value,
      }))
      .filter(chunk => Number.isFinite(chunk.index))
      .sort((a, b) => a.index - b.index);

    if (chunks.length > 0) {
      return chunks.map(chunk => chunk.value).join('');
    }
  }

  return null;
};

const loadProfileFromCookie = (): UserProfile | null => {
  const rawCookie = getAuthCookieValue();
  if (!rawCookie) {
    return null;
  }

  const encoded = rawCookie.startsWith('base64-')
    ? rawCookie.slice('base64-'.length)
    : rawCookie;
  const decoded = decodeBase64Url(encoded);

  if (!decoded) {
    return null;
  }

  try {
    const sessionPayload = JSON.parse(decoded) as { user?: User };
    if (!sessionPayload?.user) {
      return null;
    }
    return buildProfileFromUser(sessionPayload.user);
  } catch {
    return null;
  }
};

export function useUserProfile(): ProfileState {
  const context = useOptionalUserProfileContext();
  const initialProfile = loadProfileFromCookie();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [loading, setLoading] = useState(!initialProfile);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (context) {
      setProfile(context.profile ?? null);
      setLoading(context.loading);
      setError(context.error ?? null);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      PROFILE_FETCH_TIMEOUT_MS
    );
    const hasInitialProfile = Boolean(profile);
    let hasSessionFallback = hasInitialProfile;

    const loadSessionProfile = async () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<null>(resolve => {
          timeoutId = setTimeout(() => resolve(null), SESSION_FETCH_TIMEOUT_MS);
        });
        const sessionResult = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);

        if (!sessionResult) {
          return loadProfileFromCookie();
        }

        const { data, error: sessionError } = sessionResult;
        if (sessionError || !data.session?.user) {
          return loadProfileFromCookie();
        }
        return buildProfileFromUser(data.session.user);
      } catch (err) {
        console.error('useUserProfile session error', err);
        return loadProfileFromCookie();
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    };

    const fetchProfile = async () => {
      try {
        if (!hasSessionFallback) {
          setLoading(true);
        }
        const res = await fetch('/api/auth/profile', {
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            if (isMounted) {
              setProfile(null);
              setError('認証が必要です');
            }
            return;
          }

          const text = await res.text();
          throw new Error(text || 'プロフィール取得に失敗しました');
        }

        const json = await res.json();
        if (isMounted) {
          setProfile(json?.data ?? null);
          setError(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          if (isMounted && !hasSessionFallback) {
            setError('プロフィール取得がタイムアウトしました');
          }
          return;
        }

        console.error('useUserProfile error', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          if (!hasSessionFallback) {
            setProfile(null);
          }
        }
      } finally {
        if (isMounted && !hasSessionFallback) {
          setLoading(false);
        }
      }
    };

    const initializeProfile = async () => {
      if (!hasInitialProfile) {
        const sessionProfile = await loadSessionProfile();
        if (isMounted && sessionProfile) {
          setProfile(sessionProfile);
          setError(null);
          setLoading(false);
          hasSessionFallback = true;
        }
      }

      await fetchProfile();
      if (isMounted) {
        setLoading(false);
      }
    };

    initializeProfile();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [context]);

  if (context) {
    return {
      profile: context.profile ?? null,
      loading: context.loading,
      error: context.error ?? null,
    };
  }

  return { profile, loading, error };
}

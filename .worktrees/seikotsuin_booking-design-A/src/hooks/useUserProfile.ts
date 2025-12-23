'use client';

import { useEffect, useState } from 'react';

export interface UserProfile {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

interface ProfileState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useUserProfile(): ProfileState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/auth/profile', {
          credentials: 'include',
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
        console.error('useUserProfile error', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  return { profile, loading, error };
}

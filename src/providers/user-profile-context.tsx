'use client';

import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import type { UserProfile } from '@/hooks/useUserProfile';

interface UserProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  setProfile?: Dispatch<SetStateAction<UserProfile | null>>;
  setLoading?: Dispatch<SetStateAction<boolean>>;
  setError?: Dispatch<SetStateAction<string | null>>;
}

const UserProfileContext =
  createContext<UserProfileContextValue | undefined>(undefined);

interface UserProfileProviderProps {
  value: UserProfileContextValue;
  children: ReactNode;
}

export function UserProfileProvider({
  value,
  children,
}: UserProfileProviderProps) {
  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfileContext(): UserProfileContextValue {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error(
      'useUserProfileContext must be used within a UserProfileProvider'
    );
  }
  return context;
}


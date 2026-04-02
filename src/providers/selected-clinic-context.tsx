'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

interface SelectedClinicContextValue {
  selectedClinicId: string | null;
  setSelectedClinicId: Dispatch<SetStateAction<string | null>>;
}

const SelectedClinicContext = createContext<
  SelectedClinicContextValue | undefined
>(undefined);

export function SelectedClinicProvider({
  initialClinicId,
  children,
}: {
  initialClinicId: string | null;
  children: ReactNode;
}) {
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(
    initialClinicId
  );

  useEffect(() => {
    if (!initialClinicId) {
      return;
    }

    setSelectedClinicId(currentClinicId => currentClinicId ?? initialClinicId);
  }, [initialClinicId]);

  return (
    <SelectedClinicContext.Provider
      value={{ selectedClinicId, setSelectedClinicId }}
    >
      {children}
    </SelectedClinicContext.Provider>
  );
}

export function useSelectedClinic(): SelectedClinicContextValue {
  const ctx = useContext(SelectedClinicContext);
  if (!ctx)
    throw new Error(
      'useSelectedClinic must be used within SelectedClinicProvider'
    );
  return ctx;
}

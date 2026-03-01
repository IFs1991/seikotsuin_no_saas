'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface SelectedClinicContextValue {
  selectedClinicId: string | null;
  setSelectedClinicId: (id: string) => void;
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

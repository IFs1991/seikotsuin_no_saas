'use client';

import {
  type ChangeEvent,
  type FormEvent,
  memo,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import type { AccessibleClinic } from '@/hooks/useAccessibleClinics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AdminClinicScopeSelectorProps {
  clinics: readonly AccessibleClinic[];
  loading: boolean;
  error: string | null;
  onApplyClinic: (clinic: AccessibleClinic) => void;
}

const MAX_VISIBLE_CLINIC_OPTIONS = 8;

function AdminClinicScopeSelectorComponent({
  clinics,
  loading,
  error,
  onApplyClinic,
}: AdminClinicScopeSelectorProps) {
  const [clinicSearchTerm, setClinicSearchTerm] = useState('');
  const [draftClinicId, setDraftClinicId] = useState<string | null>(null);
  const deferredClinicSearchTerm = useDeferredValue(clinicSearchTerm);

  const visibleClinics = useMemo(() => {
    const normalizedTerm = deferredClinicSearchTerm.trim().toLowerCase();
    const sourceClinics = normalizedTerm
      ? clinics.filter(clinic =>
          clinic.name.toLowerCase().includes(normalizedTerm)
        )
      : clinics;

    return sourceClinics.slice(0, MAX_VISIBLE_CLINIC_OPTIONS);
  }, [clinics, deferredClinicSearchTerm]);

  const draftClinic = useMemo(
    () => clinics.find(clinic => clinic.id === draftClinicId) ?? null,
    [clinics, draftClinicId]
  );

  const handleClinicSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setClinicSearchTerm(event.target.value);
    setDraftClinicId(null);
  };

  const handleClinicSelect = (clinic: AccessibleClinic) => {
    setClinicSearchTerm(clinic.name);
    setDraftClinicId(clinic.id);
  };

  const handleApplySelectedClinic = (event: FormEvent) => {
    event.preventDefault();
    if (!draftClinic) return;
    onApplyClinic(draftClinic);
  };

  return (
    <form className='mt-3 max-w-xl' onSubmit={handleApplySelectedClinic}>
      <Label htmlFor='selected-clinic-name'>店舗名で検索</Label>
      <div className='mt-1 flex flex-col gap-2 sm:flex-row'>
        <Input
          id='selected-clinic-name'
          value={clinicSearchTerm}
          onChange={handleClinicSearchChange}
          placeholder='例: 新宿院、本院、渋谷院'
          className='flex-1 border-[#4C1D95]'
        />
        <Button
          type='submit'
          disabled={!draftClinic}
          className={
            draftClinic
              ? 'bg-[#4C1D95] text-white hover:bg-[#3B1673]'
              : 'bg-gray-200 text-gray-500'
          }
        >
          この店舗で開始
        </Button>
      </div>

      {loading && (
        <p className='mt-2 text-xs text-gray-500'>
          店舗一覧を読み込んでいます...
        </p>
      )}
      {error && (
        <p role='alert' className='mt-2 text-xs text-red-600'>
          {error}
        </p>
      )}
      {!loading &&
        !error &&
        clinicSearchTerm.trim().length > 0 &&
        visibleClinics.length === 0 && (
          <p className='mt-2 text-xs text-gray-500'>
            一致する店舗がありません。
          </p>
        )}
      {visibleClinics.length > 0 && (
        <ul className='mt-2 grid gap-2' aria-label='店舗候補'>
          {visibleClinics.map(clinic => {
            const isSelected = clinic.id === draftClinicId;
            return (
              <li key={clinic.id}>
                <button
                  type='button'
                  onClick={() => handleClinicSelect(clinic)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'border-[#4C1D95] bg-[#EEF2FF] text-[#312E81]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-[#4C1D95]'
                  }`}
                  aria-pressed={isSelected}
                >
                  {clinic.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}

export const AdminClinicScopeSelector = memo(AdminClinicScopeSelectorComponent);

AdminClinicScopeSelector.displayName = 'AdminClinicScopeSelector';

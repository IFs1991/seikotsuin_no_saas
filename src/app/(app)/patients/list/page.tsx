'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePatientsList, type Patient } from '@/hooks/usePatientsList';
import { PatientsTable } from '@/components/patients/patients-table';
import { PatientModal } from '@/components/patients/patient-modal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Loader2 } from 'lucide-react';

// トースト用の簡易実装
function Toast({
  message,
  variant = 'success',
  onClose,
}: {
  message: string;
  variant?: 'success' | 'error';
  onClose: () => void;
}) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const toneClass = variant === 'error' ? 'bg-red-600' : 'bg-green-600';

  return (
    <div
      className={`fixed bottom-4 right-4 ${toneClass} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2`}
    >
      {message}
    </div>
  );
}

export default function PatientsListPage() {
  const {
    patients,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    createPatient,
    updatePatient,
  } = usePatientsList();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: 'success' | 'error';
  } | null>(null);
  const tabBaseClass = 'px-4 py-2 rounded text-sm font-medium';
  const activeTabClass = `${tabBaseClass} bg-blue-600 text-white`;
  const inactiveTabClass = `${tabBaseClass} bg-gray-200 text-gray-700 hover:bg-gray-300`;

  const handleOpenCreate = useCallback(() => {
    setModalMode('create');
    setSelectedPatient(null);
    setIsModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((patient: Patient) => {
    setModalMode('edit');
    setSelectedPatient(patient);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedPatient(null);
  }, []);

  const handleSave = useCallback(
    async (data: {
      name: string;
      phone: string;
      email: string;
      notes: string;
      customAttributes?: Record<string, unknown>;
    }) => {
      try {
        if (modalMode === 'create') {
          await createPatient({
            name: data.name,
            phone: data.phone,
            email: data.email || undefined,
            notes: data.notes || undefined,
            customAttributes: data.customAttributes,
          });
          setToast({
            message: '\u767b\u9332\u3057\u307e\u3057\u305f',
            variant: 'success',
          });
        } else if (selectedPatient) {
          await updatePatient({
            id: selectedPatient.id,
            name: data.name,
            phone: data.phone,
            email: data.email || undefined,
            notes: data.notes || undefined,
            customAttributes: data.customAttributes,
          });
          setToast({
            message: '\u4fdd\u5b58\u3057\u307e\u3057\u305f',
            variant: 'success',
          });
        }
      } catch (error) {
        const fallback =
          '\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f';
        const message =
          error instanceof Error && error.message ? error.message : fallback;
        setToast({ message, variant: 'error' });
        throw error;
      }
    },
    [modalMode, selectedPatient, createPatient, updatePatient]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery]
  );

  if (error) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <Card className='max-w-[1200px] mx-auto bg-card border border-red-200'>
          <CardHeader>
            <CardTitle className='text-red-600'>
              データ取得に失敗しました
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-gray-600'>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
      <div className='max-w-[1200px] mx-auto space-y-6'>
        <div className='flex space-x-2'>
          <Link href='/patients' className={inactiveTabClass}>
            {'\u60a3\u8005\u5206\u6790'}
          </Link>
          <span className={activeTabClass} aria-current='page'>
            {'\u60a3\u8005\u4e00\u89a7'}
          </span>
        </div>
        {/* ヘッダー */}
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
            患者一覧
          </h1>
          <Button onClick={handleOpenCreate}>
            <Plus className='h-4 w-4 mr-2' />
            新規登録
          </Button>
        </div>

        {/* 検索 */}
        <Card className='bg-card'>
          <CardContent className='pt-6'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
              <Input
                placeholder='氏名または電話番号で検索'
                value={searchQuery}
                onChange={handleSearchChange}
                className='pl-10'
              />
            </div>
          </CardContent>
        </Card>

        {/* 一覧 */}
        <Card className='bg-card'>
          <CardContent className='pt-6'>
            {isLoading ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='h-8 w-8 animate-spin text-gray-400' />
              </div>
            ) : (
              <PatientsTable patients={patients} onEdit={handleOpenEdit} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* モーダル */}
      <PatientModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        patient={selectedPatient}
        mode={modalMode}
      />

      {/* トースト */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

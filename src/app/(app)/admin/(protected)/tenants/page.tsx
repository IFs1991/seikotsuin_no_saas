'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminTenants, type ClinicSummary } from '@/hooks/useAdminTenants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';

const STATUS_OPTIONS = [
  { label: 'すべて', value: 'all' },
  { label: '有効のみ', value: 'active' },
  { label: '無効のみ', value: 'inactive' },
] as const;

type TenantFormState = {
  name: string;
  address: string;
  phone_number: string;
  login_email: string;
  login_password: string;
  is_active: boolean;
};

const INITIAL_FORM_STATE: TenantFormState = {
  name: '',
  address: '',
  phone_number: '',
  login_email: '',
  login_password: '',
  is_active: true,
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
};

const createInitialFormState = (): TenantFormState => ({
  ...INITIAL_FORM_STATE,
});

const buildFormValidationMessage = (
  formState: TenantFormState,
  isCreateMode: boolean
) => {
  if (!formState.name.trim()) {
    return 'クリニック名を入力してください';
  }

  if (!isCreateMode) {
    return null;
  }

  if (!formState.login_email.trim()) {
    return 'ログインID（メールアドレス）を入力してください';
  }

  if (!formState.login_password) {
    return '初期パスワードを入力してください';
  }

  return null;
};

const buildCreateClinicPayload = (formState: TenantFormState) => ({
  name: formState.name,
  address: formState.address || undefined,
  phone_number: formState.phone_number || undefined,
  is_active: formState.is_active,
  login_email: formState.login_email || undefined,
  login_password: formState.login_password || undefined,
});

const buildUpdateClinicPayload = (formState: TenantFormState) => ({
  name: formState.name,
  address: formState.address || null,
  phone_number: formState.phone_number || null,
  is_active: formState.is_active,
});

const buildCreateNotice = (adminAccount?: ClinicSummary['admin_account']) =>
  adminAccount
    ? `クリニックと店舗管理者アカウントを作成しました（ID: ${adminAccount.email}）`
    : 'クリニックを作成しました';

const buildEditFormState = (clinic: ClinicSummary): TenantFormState => ({
  name: clinic.name,
  address: clinic.address ?? '',
  phone_number: clinic.phone_number ?? '',
  login_email: '',
  login_password: '',
  is_active: clinic.is_active,
});

export default function AdminTenantsPage() {
  const {
    clinics,
    loading,
    error,
    fetchClinics,
    createClinic,
    updateClinic,
    setClinics,
  } = useAdminTenants();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]['value']>('active');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formState, setFormState] = useState<TenantFormState>(
    createInitialFormState
  );
  const isCreateMode = editingId === null;

  const currentFilters = useMemo(() => {
    if (statusFilter === 'all') return { search };
    return { search, isActive: statusFilter === 'active' };
  }, [search, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchClinics(currentFilters);
    }, 200);
    return () => clearTimeout(timeout);
  }, [fetchClinics, currentFilters]);

  const matchesCurrentFilters = useCallback(
    (clinic: ClinicSummary) => {
      const normalizedSearch = search.trim().toLocaleLowerCase('ja-JP');
      const matchesSearch =
        normalizedSearch.length === 0 ||
        clinic.name.toLocaleLowerCase('ja-JP').includes(normalizedSearch);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? clinic.is_active : !clinic.is_active);

      return matchesSearch && matchesStatus;
    },
    [search, statusFilter]
  );

  const removeClinicFromCurrentView = useCallback(
    (clinicId: string) => {
      setClinics(prev => prev.filter(clinic => clinic.id !== clinicId));
    },
    [setClinics]
  );

  const syncClinicWithCurrentFilters = useCallback(
    (clinic: ClinicSummary) => {
      if (!matchesCurrentFilters(clinic)) {
        removeClinicFromCurrentView(clinic.id);
      }
    },
    [matchesCurrentFilters, removeClinicFromCurrentView]
  );

  const resetForm = useCallback(() => {
    setFormState(createInitialFormState());
    setEditingId(null);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);

    const validationMessage = buildFormValidationMessage(
      formState,
      isCreateMode
    );
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    if (editingId) {
      const updated = await updateClinic(
        editingId,
        buildUpdateClinicPayload(formState)
      );
      if (updated) {
        syncClinicWithCurrentFilters(updated);
        setNotice('クリニックを更新しました');
        resetForm();
      }
      return;
    }

    const created = await createClinic(buildCreateClinicPayload(formState));

    if (created) {
      syncClinicWithCurrentFilters(created);
      setNotice(buildCreateNotice(created.admin_account));
      resetForm();
    }
  };

  const handleEdit = (clinic: ClinicSummary) => {
    setEditingId(clinic.id);
    setFormState(buildEditFormState(clinic));
    setNotice(null);
  };

  const handleToggleActive = async (clinic: ClinicSummary) => {
    setNotice(null);
    const updated = await updateClinic(clinic.id, {
      is_active: !clinic.is_active,
    });
    if (updated) {
      syncClinicWithCurrentFilters(updated);
      setNotice(
        clinic.is_active
          ? 'クリニックを無効化しました'
          : 'クリニックを有効化しました'
      );
    }
  };

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 p-6'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-xl font-semibold'>
              クリニック管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label htmlFor='clinic-name' className='text-sm font-medium'>
                    クリニック名
                  </label>
                  <Input
                    id='clinic-name'
                    value={formState.name}
                    onChange={event =>
                      setFormState(prev => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder='例: 本院'
                  />
                </div>
                <div className='space-y-2'>
                  <label
                    htmlFor='clinic-phone-number'
                    className='text-sm font-medium'
                  >
                    電話番号
                  </label>
                  <Input
                    id='clinic-phone-number'
                    value={formState.phone_number}
                    onChange={event =>
                      setFormState(prev => ({
                        ...prev,
                        phone_number: event.target.value,
                      }))
                    }
                    placeholder='例: 03-1234-5678'
                  />
                </div>
              </div>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label
                    htmlFor='clinic-address'
                    className='text-sm font-medium'
                  >
                    住所
                  </label>
                  <Input
                    id='clinic-address'
                    value={formState.address}
                    onChange={event =>
                      setFormState(prev => ({
                        ...prev,
                        address: event.target.value,
                      }))
                    }
                    placeholder='例: 東京都千代田区'
                  />
                </div>
                <div className='flex items-center gap-3 pt-7'>
                  <Switch
                    id='clinic-active'
                    checked={formState.is_active}
                    onCheckedChange={value =>
                      setFormState(prev => ({ ...prev, is_active: value }))
                    }
                  />
                  <label
                    htmlFor='clinic-active'
                    className='text-sm text-gray-600 dark:text-gray-300'
                  >
                    有効
                  </label>
                </div>
              </div>
              {isCreateMode && (
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <label
                      htmlFor='clinic-login-email'
                      className='text-sm font-medium'
                    >
                      ログインID（メールアドレス）
                    </label>
                    <Input
                      id='clinic-login-email'
                      type='email'
                      value={formState.login_email}
                      onChange={event =>
                        setFormState(prev => ({
                          ...prev,
                          login_email: event.target.value,
                        }))
                      }
                      placeholder='例: clinic-admin@example.com'
                      autoComplete='email'
                    />
                  </div>
                  <div className='space-y-2'>
                    <label
                      htmlFor='clinic-login-password'
                      className='text-sm font-medium'
                    >
                      初期パスワード
                    </label>
                    <Input
                      id='clinic-login-password'
                      type='password'
                      value={formState.login_password}
                      onChange={event =>
                        setFormState(prev => ({
                          ...prev,
                          login_password: event.target.value,
                        }))
                      }
                      placeholder='初期パスワードを設定'
                      autoComplete='new-password'
                    />
                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                      ログインは既存仕様どおりメールアドレスとパスワードで行います
                    </p>
                  </div>
                </div>
              )}
              <div className='flex flex-wrap items-center gap-2'>
                <Button type='submit' disabled={loading}>
                  {editingId ? '更新する' : '作成する'}
                </Button>
                {editingId && (
                  <Button type='button' variant='outline' onClick={resetForm}>
                    編集をキャンセル
                  </Button>
                )}
                {notice && (
                  <span className='text-sm text-emerald-600'>{notice}</span>
                )}
                {error && <span className='text-sm text-red-500'>{error}</span>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='space-y-3'>
            <CardTitle className='text-lg font-semibold'>一覧</CardTitle>
            <div className='flex flex-wrap items-center gap-3'>
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='クリニック名で検索'
                className='max-w-xs'
              />
              <Select
                value={statusFilter}
                onValueChange={value =>
                  setStatusFilter(
                    value as (typeof STATUS_OPTIONS)[number]['value']
                  )
                }
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder='状態' />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading && clinics.length === 0 ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clinics.map(clinic => (
                    <TableRow key={clinic.id}>
                      <TableCell className='text-xs text-gray-500'>
                        {clinic.id}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {clinic.name}
                      </TableCell>
                      <TableCell>
                        {clinic.is_active ? '有効' : '無効'}
                      </TableCell>
                      <TableCell>{formatDate(clinic.created_at)}</TableCell>
                      <TableCell className='space-x-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => handleEdit(clinic)}
                        >
                          編集
                        </Button>
                        <Button
                          size='sm'
                          variant={
                            clinic.is_active ? 'destructive' : 'secondary'
                          }
                          onClick={() => handleToggleActive(clinic)}
                        >
                          {clinic.is_active ? '無効化' : '有効化'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {clinics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center text-sm'>
                        クリニックがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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
import {
  ADMIN_TENANT_STATUS_OPTIONS,
  ADMIN_TENANT_TYPE_OPTIONS,
  UNSELECTED_PARENT_VALUE,
  buildCreateClinicPayload,
  buildCreateNotice,
  buildEditFormState,
  buildFormValidationMessage,
  buildParentLabel,
  buildParentOptionLabel,
  buildUpdateClinicPayload,
  createInitialTenantFormState,
  formatClinicDate,
  formatClinicTypeLabel,
  isHierarchyLocked,
  sortClinicsForDisplay,
  type ClinicStatusFilterValue,
  type ClinicHierarchyType,
  type TenantFormState,
} from '@/lib/admin/tenants';

export default function AdminTenantsPage() {
  const {
    clinics,
    loading,
    error,
    fetchClinics,
    listClinics,
    createClinic,
    updateClinic,
    setClinics,
  } = useAdminTenants();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<ClinicStatusFilterValue>('active');
  const [tenantOptions, setTenantOptions] = useState<ClinicSummary[]>([]);
  const [tenantOptionsLoading, setTenantOptionsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formState, setFormState] = useState<TenantFormState>(
    createInitialTenantFormState
  );
  const isCreateMode = editingId === null;

  const currentFilters = useMemo(() => {
    if (statusFilter === 'all') return { search };
    return { search, isActive: statusFilter === 'active' };
  }, [search, statusFilter]);

  const refreshTenantOptions = useCallback(async () => {
    setTenantOptionsLoading(true);
    const items = await listClinics();

    if (items) {
      setTenantOptions(items);
    }

    setTenantOptionsLoading(false);
  }, [listClinics]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchClinics(currentFilters);
    }, 200);
    return () => clearTimeout(timeout);
  }, [fetchClinics, currentFilters]);

  useEffect(() => {
    void refreshTenantOptions();
  }, [refreshTenantOptions]);

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
    setFormState(createInitialTenantFormState());
    setEditingId(null);
  }, []);

  const editingClinic = useMemo(() => {
    if (!editingId) {
      return null;
    }

    return (
      tenantOptions.find(clinic => clinic.id === editingId) ??
      clinics.find(clinic => clinic.id === editingId) ??
      null
    );
  }, [editingId, tenantOptions, clinics]);

  const shouldLockHierarchy = !isCreateMode && isHierarchyLocked(editingClinic);

  const parentTenantOptions = useMemo(
    () =>
      sortClinicsForDisplay(
        tenantOptions.filter(
          clinic =>
            clinic.parent_id === null &&
            clinic.id !== editingId &&
            (clinic.is_active || clinic.id === formState.parent_id)
        )
      ),
    [tenantOptions, editingId, formState.parent_id]
  );

  const displayClinics = useMemo(
    () => sortClinicsForDisplay(clinics),
    [clinics]
  );

  const handleTenantTypeChange = (value: ClinicHierarchyType) => {
    setFormState(prev => ({
      ...prev,
      tenant_type: value,
      parent_id: value === 'child' ? prev.parent_id : '',
    }));
  };

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
        await refreshTenantOptions();
        setNotice('クリニックを更新しました');
        resetForm();
      }
      return;
    }

    const created = await createClinic(buildCreateClinicPayload(formState));

    if (created) {
      syncClinicWithCurrentFilters(created);
      await refreshTenantOptions();
      setNotice(buildCreateNotice(created));
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
      await refreshTenantOptions();
      setNotice(
        clinic.is_active
          ? 'クリニックを無効化しました'
          : 'クリニックを有効化しました'
      );
    }
  };

  return (
    <div className='min-h-screen bg-white p-6 dark:bg-gray-800'>
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
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label
                    htmlFor='clinic-tenant-type'
                    className='text-sm font-medium'
                  >
                    テナント種別
                  </label>
                  <Select
                    value={formState.tenant_type}
                    onValueChange={value =>
                      handleTenantTypeChange(value as ClinicHierarchyType)
                    }
                    disabled={shouldLockHierarchy}
                  >
                    <SelectTrigger id='clinic-tenant-type' className='w-full'>
                      <SelectValue placeholder='種別を選択' />
                    </SelectTrigger>
                    <SelectContent>
                      {ADMIN_TENANT_TYPE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <label
                    htmlFor='clinic-parent-tenant'
                    className='text-sm font-medium'
                  >
                    親テナント
                  </label>
                  <Select
                    value={formState.parent_id || UNSELECTED_PARENT_VALUE}
                    onValueChange={value =>
                      setFormState(prev => ({
                        ...prev,
                        parent_id:
                          value === UNSELECTED_PARENT_VALUE ? '' : value,
                      }))
                    }
                    disabled={
                      formState.tenant_type !== 'child' || shouldLockHierarchy
                    }
                  >
                    <SelectTrigger id='clinic-parent-tenant' className='w-full'>
                      <SelectValue
                        placeholder={
                          tenantOptionsLoading
                            ? '親テナントを読み込み中'
                            : '親テナントを選択'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSELECTED_PARENT_VALUE}>
                        親テナントを選択
                      </SelectItem>
                      {parentTenantOptions.map(clinic => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {buildParentOptionLabel(clinic)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    本部/単独テナントは親なし、子テナントは同一スコープ内の本部配下に作成します
                  </p>
                  {shouldLockHierarchy && (
                    <p className='text-xs text-amber-600 dark:text-amber-400'>
                      子テナントを持つ本部テナントは、先に子テナントを整理するまで親変更できません
                    </p>
                  )}
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
                  setStatusFilter(value as ClinicStatusFilterValue)
                }
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder='状態' />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_TENANT_STATUS_OPTIONS.map(option => (
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
                    <TableHead>種別</TableHead>
                    <TableHead>親テナント</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayClinics.map(clinic => (
                    <TableRow key={clinic.id}>
                      <TableCell className='text-xs text-gray-500'>
                        {clinic.id}
                      </TableCell>
                      <TableCell className='font-medium'>
                        <div className={clinic.parent_id ? 'pl-4' : ''}>
                          {clinic.name}
                        </div>
                      </TableCell>
                      <TableCell>{formatClinicTypeLabel(clinic)}</TableCell>
                      <TableCell>{buildParentLabel(clinic)}</TableCell>
                      <TableCell>
                        {clinic.is_active ? '有効' : '無効'}
                      </TableCell>
                      <TableCell>
                        {formatClinicDate(clinic.created_at)}
                      </TableCell>
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
                  {displayClinics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className='text-center text-sm'>
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

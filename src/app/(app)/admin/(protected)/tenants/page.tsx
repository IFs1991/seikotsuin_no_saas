'use client';

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useAdminTenants, type ClinicSummary } from '@/hooks/useAdminTenants';
import { AdminFormCard } from '@/components/admin/admin-form-card';
import { AdminListCard } from '@/components/admin/admin-list-card';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminState } from '@/components/admin/admin-state';
import {
  TenantOperationStatusBadge,
  TenantOperationStatusControl,
} from '@/components/admin/tenant-operation-status';
import { Button } from '@/components/ui/button';
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
import {
  ADMIN_TENANT_STATUS_OPTIONS,
  ADMIN_TENANT_TYPE_OPTIONS,
  UNSELECTED_PARENT_VALUE,
  buildCreateClinicPayload,
  buildCreateNotice,
  buildClinicOperationNotice,
  buildEditFormState,
  buildFormValidationMessage,
  buildParentLabel,
  buildParentOptionLabel,
  buildUpdateClinicPayload,
  createInitialTenantFormState,
  formatClinicDate,
  formatClinicOperationAction,
  formatClinicTypeLabel,
  isHierarchyLocked,
  sortClinicsForDisplay,
  type ClinicStatusFilterValue,
  type ClinicHierarchyType,
  type TenantFormState,
} from '@/lib/admin/tenants';

interface TenantTableRowProps {
  clinic: ClinicSummary;
  onEdit: (clinic: ClinicSummary) => void;
  onToggleActive: (clinic: ClinicSummary) => void;
}

const TenantTableRow = memo(function TenantTableRow({
  clinic,
  onEdit,
  onToggleActive,
}: TenantTableRowProps) {
  return (
    <TableRow>
      <TableCell className='text-xs text-gray-500'>{clinic.id}</TableCell>
      <TableCell className='font-medium'>
        <div className={clinic.parent_id ? 'pl-4' : ''}>{clinic.name}</div>
      </TableCell>
      <TableCell>{formatClinicTypeLabel(clinic)}</TableCell>
      <TableCell>{buildParentLabel(clinic)}</TableCell>
      <TableCell>
        <TenantOperationStatusBadge isActive={clinic.is_active} />
      </TableCell>
      <TableCell>{formatClinicDate(clinic.created_at)}</TableCell>
      <TableCell className='space-x-2'>
        <Button size='sm' variant='outline' onClick={() => onEdit(clinic)}>
          編集
        </Button>
        <Button
          size='sm'
          variant={clinic.is_active ? 'destructive' : 'secondary'}
          onClick={() => onToggleActive(clinic)}
        >
          {formatClinicOperationAction(clinic.is_active)}
        </Button>
      </TableCell>
    </TableRow>
  );
});

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
  const deferredSearch = useDeferredValue(search);
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
    if (statusFilter === 'all') return { search: deferredSearch };
    return { search: deferredSearch, isActive: statusFilter === 'active' };
  }, [deferredSearch, statusFilter]);

  const refreshTenantOptions = useCallback(async () => {
    setTenantOptionsLoading(true);
    try {
      const items = await listClinics();

      if (items) {
        setTenantOptions(items);
      }
    } finally {
      setTenantOptionsLoading(false);
    }
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

  const updateFormField = useCallback(function updateTenantFormField<
    Field extends keyof TenantFormState,
  >(field: Field, value: TenantFormState[Field]) {
    setFormState(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateFormField('name', event.target.value);
    },
    [updateFormField]
  );

  const handlePhoneNumberChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateFormField('phone_number', event.target.value);
    },
    [updateFormField]
  );

  const handleAddressChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateFormField('address', event.target.value);
    },
    [updateFormField]
  );

  const handleLoginEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateFormField('login_email', event.target.value);
    },
    [updateFormField]
  );

  const handleLoginPasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateFormField('login_password', event.target.value);
    },
    [updateFormField]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleTenantTypeChange = useCallback((value: ClinicHierarchyType) => {
    setFormState(prev => ({
      ...prev,
      tenant_type: value,
      parent_id: value === 'child' ? prev.parent_id : '',
    }));
  }, []);

  const handleParentTenantChange = useCallback((value: string) => {
    setFormState(prev => ({
      ...prev,
      parent_id: value === UNSELECTED_PARENT_VALUE ? '' : value,
    }));
  }, []);

  const handleOperationStatusChange = useCallback(
    (value: boolean) => {
      updateFormField('is_active', value);
    },
    [updateFormField]
  );

  const handleStatusFilterChange = useCallback(
    (value: ClinicStatusFilterValue) => {
      setStatusFilter(value);
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
    },
    [
      createClinic,
      editingId,
      formState,
      isCreateMode,
      refreshTenantOptions,
      resetForm,
      syncClinicWithCurrentFilters,
      updateClinic,
    ]
  );

  const handleEdit = useCallback((clinic: ClinicSummary) => {
    setEditingId(clinic.id);
    setFormState(buildEditFormState(clinic));
    setNotice(null);
  }, []);

  const handleToggleActive = useCallback(
    async (clinic: ClinicSummary) => {
      setNotice(null);
      const updated = await updateClinic(clinic.id, {
        is_active: !clinic.is_active,
      });
      if (updated) {
        syncClinicWithCurrentFilters(updated);
        await refreshTenantOptions();
        setNotice(buildClinicOperationNotice(clinic.is_active));
      }
    },
    [refreshTenantOptions, syncClinicWithCurrentFilters, updateClinic]
  );

  return (
    <AdminPageShell
      title='クリニック管理'
      description='親子テナント、店舗ログイン、運用状態を管理します。'
    >
      <AdminFormCard title={isCreateMode ? 'クリニック作成' : 'クリニック編集'}>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <label htmlFor='clinic-name' className='text-sm font-medium'>
                クリニック名
              </label>
              <Input
                id='clinic-name'
                value={formState.name}
                onChange={handleNameChange}
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
                onChange={handlePhoneNumberChange}
                placeholder='例: 03-1234-5678'
              />
            </div>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <label htmlFor='clinic-address' className='text-sm font-medium'>
                住所
              </label>
              <Input
                id='clinic-address'
                value={formState.address}
                onChange={handleAddressChange}
                placeholder='例: 東京都千代田区'
              />
            </div>
            <TenantOperationStatusControl
              id='clinic-active'
              isActive={formState.is_active}
              onChange={handleOperationStatusChange}
            />
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
                onValueChange={handleParentTenantChange}
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
                  onChange={handleLoginEmailChange}
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
                  onChange={handleLoginPasswordChange}
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
      </AdminFormCard>

      <AdminListCard
        title='クリニック一覧'
        searchId='admin-tenant-search'
        searchValue={search}
        searchPlaceholder='クリニック名で検索'
        onSearchChange={handleSearchChange}
        filters={
          <Select
            value={statusFilter}
            onValueChange={value =>
              handleStatusFilterChange(value as ClinicStatusFilterValue)
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
        }
      >
        {loading && clinics.length === 0 ? (
          <AdminState variant='loading' title='読み込み中...' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>親テナント</TableHead>
                <TableHead>運用状態</TableHead>
                <TableHead>作成日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayClinics.map(clinic => (
                <TenantTableRow
                  key={clinic.id}
                  clinic={clinic}
                  onEdit={handleEdit}
                  onToggleActive={handleToggleActive}
                />
              ))}
              {displayClinics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <AdminState
                      variant='empty'
                      title='クリニックがありません'
                      description='検索条件を変更するか、新しいクリニックを作成してください。'
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </AdminListCard>
    </AdminPageShell>
  );
}

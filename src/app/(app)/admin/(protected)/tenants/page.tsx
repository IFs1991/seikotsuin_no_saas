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
import { useAdminUserCandidates, useAdminUsers } from '@/hooks/useAdminUsers';
import { AdminFormCard } from '@/components/admin/admin-form-card';
import { AdminListCard } from '@/components/admin/admin-list-card';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminScopeNotice } from '@/components/admin/admin-scope-notice';
import { AdminState } from '@/components/admin/admin-state';
import {
  TenantOperationStatusBadge,
  TenantOperationStatusControl,
} from '@/components/admin/tenant-operation-status';
import { UserCandidateCombobox } from '@/components/admin/user-candidate-combobox';
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
  TENANT_INITIAL_ACCESS_EXISTING,
  TENANT_INITIAL_ACCESS_LATER,
  TENANT_INITIAL_ACCESS_NEW,
  TENANT_INITIAL_ACCESS_OPTIONS,
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
  type TenantInitialAccessMode,
  type TenantFormState,
} from '@/lib/admin/tenants';
import {
  USER_CANDIDATE_MIN_SEARCH_LENGTH,
  getCandidateInputLabel,
  type UserPermissionCandidate,
} from '@/lib/admin/users';

const TENANT_SCOPE_NOTICE_ITEMS = [
  {
    label: 'この画面で作るもの',
    description:
      '同一スコープ内の本部配下に、子テナントと店舗単位の運用状態を作成・管理します。',
  },
  {
    label: '初期アクセス',
    description:
      'あとで設定、新規管理者作成、既存ユーザー割り当てから選択できます。',
  },
  {
    label: '別画面で扱うもの',
    description:
      'マネージャー、施術者、スタッフの追加や権限変更はアカウント・権限管理で行います。',
  },
] as const;

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
  const { assignPermission, loading: permissionLoading } = useAdminUsers();
  const {
    candidates: userCandidates,
    loading: userCandidatesLoading,
    error: userCandidatesError,
    clearCandidates,
    fetchUserCandidates,
  } = useAdminUserCandidates();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [userSearch, setUserSearch] = useState('');
  const deferredUserSearch = useDeferredValue(userSearch);
  const [selectedUserLabel, setSelectedUserLabel] = useState('');
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false);
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
  const isNewInitialAdminMode =
    formState.initial_access_mode === TENANT_INITIAL_ACCESS_NEW;
  const isExistingInitialAdminMode =
    formState.initial_access_mode === TENANT_INITIAL_ACCESS_EXISTING;
  const hasSelectedInitialAdmin =
    Boolean(formState.existing_admin_user_id) &&
    selectedUserLabel.trim() !== '' &&
    userSearch.trim() === selectedUserLabel.trim();

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

  useEffect(() => {
    const trimmedSearch = deferredUserSearch.trim();
    const selectedLabel = selectedUserLabel.trim();

    if (
      !isCreateMode ||
      !isExistingInitialAdminMode ||
      !isUserPickerOpen ||
      trimmedSearch.length < USER_CANDIDATE_MIN_SEARCH_LENGTH ||
      (selectedLabel && trimmedSearch === selectedLabel)
    ) {
      clearCandidates();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchUserCandidates(trimmedSearch, { signal: controller.signal });
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    clearCandidates,
    deferredUserSearch,
    fetchUserCandidates,
    isCreateMode,
    isExistingInitialAdminMode,
    isUserPickerOpen,
    selectedUserLabel,
  ]);

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
    setUserSearch('');
    setSelectedUserLabel('');
    setIsUserPickerOpen(false);
    clearCandidates();
  }, [clearCandidates]);

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
  const isEditingChildTenant =
    !isCreateMode && Boolean(editingClinic?.parent_id);
  const shouldRestrictTenantTypeToChild = isCreateMode || isEditingChildTenant;
  const tenantTypeOptions = useMemo(
    () =>
      shouldRestrictTenantTypeToChild
        ? ADMIN_TENANT_TYPE_OPTIONS.filter(option => option.value === 'child')
        : ADMIN_TENANT_TYPE_OPTIONS,
    [shouldRestrictTenantTypeToChild]
  );

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

  const handleInitialAccessModeChange = useCallback(
    (mode: TenantInitialAccessMode) => {
      setFormState(prev => ({
        ...prev,
        initial_access_mode: mode,
        login_email: mode === TENANT_INITIAL_ACCESS_NEW ? prev.login_email : '',
        login_password:
          mode === TENANT_INITIAL_ACCESS_NEW ? prev.login_password : '',
        existing_admin_user_id:
          mode === TENANT_INITIAL_ACCESS_EXISTING
            ? prev.existing_admin_user_id
            : '',
      }));

      if (mode !== TENANT_INITIAL_ACCESS_EXISTING) {
        setUserSearch('');
        setSelectedUserLabel('');
        setIsUserPickerOpen(false);
        clearCandidates();
      }
    },
    [clearCandidates]
  );

  const handleInitialAdminSearchChange = useCallback((value: string) => {
    setUserSearch(value);
    setSelectedUserLabel('');
    setFormState(prev => ({
      ...prev,
      existing_admin_user_id: '',
    }));
    setIsUserPickerOpen(true);
  }, []);

  const handleInitialAdminSelect = useCallback(
    (candidate: UserPermissionCandidate) => {
      const label = getCandidateInputLabel(candidate);
      setUserSearch(label);
      setSelectedUserLabel(label);
      setFormState(prev => ({
        ...prev,
        existing_admin_user_id: candidate.user_id,
      }));
      setIsUserPickerOpen(false);
      clearCandidates();
    },
    [clearCandidates]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleTenantTypeChange = useCallback(
    (value: ClinicHierarchyType) => {
      setFormState(prev => {
        const tenantType = shouldRestrictTenantTypeToChild ? 'child' : value;

        return {
          ...prev,
          tenant_type: tenantType,
          parent_id: tenantType === 'child' ? prev.parent_id : '',
        };
      });
    },
    [shouldRestrictTenantTypeToChild]
  );

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
        if (formState.initial_access_mode === TENANT_INITIAL_ACCESS_EXISTING) {
          const permission = await assignPermission({
            user_id: formState.existing_admin_user_id,
            role: 'clinic_admin',
            clinic_id: created.id,
          });

          if (!permission) {
            syncClinicWithCurrentFilters(created);
            await refreshTenantOptions();
            setNotice(
              'テナントは作成しましたが、既存ユーザーの初期管理者割り当てに失敗しました。アカウント・権限管理から再設定してください。'
            );
            return;
          }
        }

        syncClinicWithCurrentFilters(created);
        await refreshTenantOptions();
        setNotice(
          formState.initial_access_mode === TENANT_INITIAL_ACCESS_EXISTING
            ? 'テナントを作成し、既存ユーザーを初期管理者として割り当てました'
            : buildCreateNotice(created)
        );
        resetForm();
      }
    },
    [
      assignPermission,
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
      description='同一スコープ内の本部配下に子テナントを作成し、店舗の運用状態を管理します。スタッフや権限ユーザーの追加はアカウント・権限管理で扱います。'
    >
      <AdminScopeNotice
        title='この画面の役割'
        description='店舗という箱を作る画面です。人を増やす操作とは分けて管理します。'
        items={TENANT_SCOPE_NOTICE_ITEMS}
        action={{ href: '/admin/users', label: '店舗ユーザーを作成する' }}
      />

      <AdminFormCard
        title={isCreateMode ? 'テナント/店舗作成' : 'テナント/店舗編集'}
      >
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <label htmlFor='clinic-name' className='text-sm font-medium'>
                店舗/テナント名
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
                disabled={
                  shouldLockHierarchy || shouldRestrictTenantTypeToChild
                }
              >
                <SelectTrigger id='clinic-tenant-type' className='w-full'>
                  <SelectValue placeholder='種別を選択' />
                </SelectTrigger>
                <SelectContent>
                  {tenantTypeOptions.map(option => (
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
                子テナントは同一スコープ内の本部配下に作成します
              </p>
              {shouldLockHierarchy && (
                <p className='text-xs text-amber-600 dark:text-amber-400'>
                  子テナントを持つ本部テナントは、先に子テナントを整理するまで親変更できません
                </p>
              )}
            </div>
          </div>
          {isCreateMode && (
            <section className='space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40'>
              <div>
                <h3 className='text-sm font-semibold text-slate-950 dark:text-slate-50'>
                  初期アクセス設定
                </h3>
                <p className='mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300'>
                  店舗/テナント作成時点で、誰が最初に管理画面へアクセスするかを選択します。既存の院長・施術者・管理者が担う場合は、既存ユーザーを割り当ててください。
                </p>
              </div>
              <div
                className='grid gap-3 md:grid-cols-3'
                role='radiogroup'
                aria-label='初期アクセス設定'
              >
                {TENANT_INITIAL_ACCESS_OPTIONS.map(option => {
                  const isSelected =
                    formState.initial_access_mode === option.value;

                  return (
                    <button
                      key={option.value}
                      type='button'
                      role='radio'
                      aria-checked={isSelected}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'
                      }`}
                      onClick={() =>
                        handleInitialAccessModeChange(option.value)
                      }
                    >
                      <span className='block text-sm font-semibold'>
                        {option.label}
                      </span>
                      <span className='mt-1 block text-xs leading-5 opacity-80'>
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {formState.initial_access_mode ===
                TENANT_INITIAL_ACCESS_LATER && (
                <p className='rounded-md bg-white px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300'>
                  テナント作成後、アカウント・権限管理から店舗管理者、マネージャー、施術者、スタッフを追加してください。
                </p>
              )}
              {isNewInitialAdminMode && (
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <label
                      htmlFor='clinic-login-email'
                      className='text-sm font-medium'
                    >
                      初期管理者メールアドレス
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
                      ログインはメールアドレスとパスワードで行います
                    </p>
                  </div>
                </div>
              )}
              {isExistingInitialAdminMode && (
                <UserCandidateCombobox
                  candidates={userCandidates}
                  disabled={false}
                  error={userCandidatesError}
                  hasSelectedUser={hasSelectedInitialAdmin}
                  inputId='tenant-initial-admin-search'
                  isOpen={isUserPickerOpen}
                  listboxId='tenant-initial-admin-candidates'
                  loading={userCandidatesLoading}
                  selectedUserId={formState.existing_admin_user_id}
                  value={userSearch}
                  onOpenChange={setIsUserPickerOpen}
                  onSearchChange={handleInitialAdminSearchChange}
                  onSelect={handleInitialAdminSelect}
                />
              )}
            </section>
          )}
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='submit' disabled={loading || permissionLoading}>
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

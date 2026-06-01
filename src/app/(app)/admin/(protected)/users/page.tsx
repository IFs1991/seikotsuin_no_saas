'use client';

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AdminFormCard } from '@/components/admin/admin-form-card';
import { AdminListCard } from '@/components/admin/admin-list-card';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminScopeNotice } from '@/components/admin/admin-scope-notice';
import { AdminState } from '@/components/admin/admin-state';
import { AdminAccountCreateFields } from '@/components/admin/admin-account-create-fields';
import { UserCandidateCombobox } from '@/components/admin/user-candidate-combobox';
import ShiftOptimizer from '@/components/staff/shift-optimizer';
import { Button } from '@/components/ui/button';
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
  CLINIC_FILTER_ALL,
  CREATE_ACCOUNT_MODE_ACCOUNT_ONLY,
  CREATE_ACCOUNT_MODE_EXISTING,
  CREATE_ACCOUNT_MODE_NEW,
  DEFAULT_ADMIN_USER_ROLE,
  NO_CLINIC_VALUE,
  ROLE_FILTER_ALL,
  USER_CANDIDATE_MIN_SEARCH_LENGTH,
  getCreatableAdminAccountRoleOptions,
  buildPermissionFilters,
  canAreaManagerManagePermissionRole,
  canClinicAdminManagePermissionRole,
  createAccountOnlyPayload,
  createAssignPermissionPayload,
  createEmptyPermissionFormState,
  createPermissionFormState,
  createUpdatePermissionPayload,
  getCandidateInputLabel,
  getAssignableAdminUserRoleOptions,
  getPermissionAccountPrimary,
  getPermissionAccountSecondary,
  getPermissionInputLabel,
  permissionMatchesFilters,
  toAdminUserRole,
  toRoleFilterValue,
  validatePermissionForm,
  type AccountCreateMode,
  type AdminUsersRoleFilter,
  type PermissionEntry,
  type PermissionFormState,
  type UserPermissionCandidate,
} from '@/lib/admin/users';
import { useAdminUserCandidates, useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { getRoleLabel, normalizeRole } from '@/lib/constants/roles';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfileContext } from '@/providers/user-profile-context';

const ACCOUNT_SCOPE_NOTICE_ITEMS = [
  {
    label: 'この画面で作るもの',
    description:
      '既存店舗に所属する人のログインアカウントとロールを管理します。',
  },
  {
    label: '作らないもの',
    description:
      '子テナントや店舗レコード自体は作成しません。所属店舗を選んで人を紐づけます。',
  },
  {
    label: '店舗を増やす場合',
    description:
      '先にクリニック管理で子テナントを作成し、その後この画面で管理者やスタッフを追加します。',
  },
] as const;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
};

type PermissionTableRowProps = {
  permission: PermissionEntry;
  canManage: boolean;
  onEdit: (permission: PermissionEntry) => void;
  onRevoke: (permission: PermissionEntry) => void;
};

const PermissionTableRow = React.memo(function PermissionTableRow({
  permission,
  canManage,
  onEdit,
  onRevoke,
}: PermissionTableRowProps) {
  const secondaryAccount = getPermissionAccountSecondary(permission);

  return (
    <TableRow>
      <TableCell className='text-xs text-gray-500'>{permission.id}</TableCell>
      <TableCell>
        <div className='text-sm font-medium'>
          {getPermissionAccountPrimary(permission)}
        </div>
        {secondaryAccount && (
          <div className='text-xs text-gray-500'>{secondaryAccount}</div>
        )}
        {permission.user_id && (
          <div className='mt-1 text-[11px] text-gray-400'>
            内部ID: {permission.user_id}
          </div>
        )}
      </TableCell>
      <TableCell>{getRoleLabel(permission.role)}</TableCell>
      <TableCell>
        {permission.clinic_name || permission.clinic_id || '-'}
      </TableCell>
      <TableCell>{formatDate(permission.created_at)}</TableCell>
      <TableCell className='space-x-2'>
        {canManage ? (
          <>
            <Button
              size='sm'
              variant='outline'
              onClick={() => onEdit(permission)}
            >
              編集
            </Button>
            <Button
              size='sm'
              variant='destructive'
              onClick={() => onRevoke(permission)}
            >
              権限を外す
            </Button>
          </>
        ) : (
          <span className='text-xs text-gray-500'>管理対象外</span>
        )}
      </TableCell>
    </TableRow>
  );
});

export default function AdminUsersPage() {
  const {
    permissions,
    loading,
    error,
    fetchPermissions,
    assignPermission,
    createAccountOnlyUser,
    updatePermission,
    applyPermissionToList,
    removePermissionFromList,
    revokePermission,
  } = useAdminUsers();
  const {
    candidates: userCandidates,
    loading: userCandidatesLoading,
    error: userCandidatesError,
    clearCandidates,
    fetchUserCandidates,
  } = useAdminUserCandidates();
  const {
    clinics: adminClinics,
    loading: adminClinicsLoading,
    error: adminClinicsError,
    fetchClinics,
  } = useAdminTenants();
  const {
    clinics: accessibleClinics,
    clinicsLoading,
    clinicsError,
  } = useSelectedClinic();
  const { profile } = useUserProfileContext();
  const actorRole = normalizeRole(profile?.role);
  const isHqAdmin = actorRole === 'admin';
  const isAreaManager = actorRole === 'manager';
  const requiresClinicForPermission = !isHqAdmin;
  const clinicOptions = useMemo(
    () => (isHqAdmin ? adminClinics : accessibleClinics),
    [accessibleClinics, adminClinics, isHqAdmin]
  );
  const clinicOptionsError = isHqAdmin ? adminClinicsError : clinicsError;
  const clinicOptionsLoading = isHqAdmin ? adminClinicsLoading : clinicsLoading;
  const roleOptions = useMemo(
    () => getAssignableAdminUserRoleOptions(actorRole),
    [actorRole]
  );
  const creatableRoleOptions = useMemo(
    () => getCreatableAdminAccountRoleOptions(actorRole),
    [actorRole]
  );
  const defaultFormRole =
    actorRole === 'admin'
      ? DEFAULT_ADMIN_USER_ROLE
      : (roleOptions[0]?.value ?? DEFAULT_ADMIN_USER_ROLE);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [userSearch, setUserSearch] = useState('');
  const deferredUserSearch = useDeferredValue(userSearch);
  const [selectedUserLabel, setSelectedUserLabel] = useState('');
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false);
  const [roleFilter, setRoleFilter] =
    useState<AdminUsersRoleFilter>(ROLE_FILTER_ALL);
  const [clinicFilter, setClinicFilter] = useState<string>(CLINIC_FILTER_ALL);
  const [shiftClinicId, setShiftClinicId] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(
    null
  );
  const [formState, setFormState] = useState<PermissionFormState>(() =>
    createEmptyPermissionFormState(defaultFormRole)
  );
  const isStoreAccountCreateMode =
    formState.create_mode === CREATE_ACCOUNT_MODE_NEW;
  const isAccountOnlyCreateMode =
    formState.create_mode === CREATE_ACCOUNT_MODE_ACCOUNT_ONLY;
  const usesAccountFields = isStoreAccountCreateMode || isAccountOnlyCreateMode;
  const formRoleOptions = useMemo(
    () => (isStoreAccountCreateMode ? creatableRoleOptions : roleOptions),
    [creatableRoleOptions, isStoreAccountCreateMode, roleOptions]
  );

  const currentFilters = useMemo(
    () =>
      buildPermissionFilters({
        roleFilter,
        clinicFilter,
        search: deferredSearch,
      }),
    [clinicFilter, deferredSearch, roleFilter]
  );

  useEffect(() => {
    if (isHqAdmin) {
      fetchClinics({ isActive: null });
    }
  }, [fetchClinics, isHqAdmin]);

  useEffect(() => {
    if (shiftClinicId || clinicOptionsLoading) {
      return;
    }

    const defaultClinicId = profile?.clinicId || clinicOptions[0]?.id || '';
    if (defaultClinicId) {
      setShiftClinicId(defaultClinicId);
    }
  }, [clinicOptions, clinicOptionsLoading, profile?.clinicId, shiftClinicId]);

  useEffect(() => {
    if (roleOptions.length === 0) {
      return;
    }

    setFormState(current =>
      roleOptions.some(option => option.value === current.role)
        ? current
        : { ...current, role: defaultFormRole }
    );
  }, [defaultFormRole, roleOptions]);

  useEffect(() => {
    if (!isStoreAccountCreateMode || creatableRoleOptions.length === 0) {
      return;
    }

    setFormState(current =>
      creatableRoleOptions.some(option => option.value === current.role)
        ? current
        : { ...current, role: creatableRoleOptions[0].value }
    );
  }, [creatableRoleOptions, isStoreAccountCreateMode]);

  useEffect(() => {
    const trimmedSearch = deferredUserSearch.trim();
    const selectedLabel = selectedUserLabel.trim();

    if (
      editingPermissionId ||
      usesAccountFields ||
      !isUserPickerOpen ||
      trimmedSearch.length < USER_CANDIDATE_MIN_SEARCH_LENGTH ||
      (selectedLabel && trimmedSearch === selectedLabel)
    ) {
      clearCandidates();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchUserCandidates(trimmedSearch, {
        signal: controller.signal,
        includeUnassigned: isHqAdmin,
      });
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    clearCandidates,
    deferredUserSearch,
    editingPermissionId,
    fetchUserCandidates,
    isHqAdmin,
    isUserPickerOpen,
    selectedUserLabel,
    usesAccountFields,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchPermissions(currentFilters, { signal: controller.signal });
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [fetchPermissions, currentFilters]);

  const resetForm = useCallback(() => {
    setEditingPermissionId(null);
    setFormState(createEmptyPermissionFormState(defaultFormRole));
    setUserSearch('');
    setSelectedUserLabel('');
    setIsUserPickerOpen(false);
    clearCandidates();
  }, [clearCandidates, defaultFormRole]);

  const syncPermissionList = useCallback(
    (permission: PermissionEntry) => {
      applyPermissionToList(
        permission,
        permissionMatchesFilters(permission, currentFilters)
      );
    },
    [applyPermissionToList, currentFilters]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setNotice(null);

      const validationMessage = validatePermissionForm(formState, {
        requireClinicId:
          requiresClinicForPermission &&
          (!isAccountOnlyCreateMode || formState.assign_role),
      });
      if (validationMessage) {
        setNotice(validationMessage);
        return;
      }

      if (editingPermissionId) {
        const updated = await updatePermission(
          editingPermissionId,
          createUpdatePermissionPayload(formState)
        );
        if (updated) {
          setNotice('権限を更新しました');
          syncPermissionList(updated);
          resetForm();
        }
        return;
      }

      if (isAccountOnlyCreateMode) {
        const created = await createAccountOnlyUser(
          createAccountOnlyPayload(formState)
        );
        if (created) {
          setNotice(
            formState.assign_role
              ? 'ユーザーアカウントを作成し、権限を付与しました。'
              : 'ユーザーアカウントのみ作成しました。権限はまだ付与されていません。'
          );
          resetForm();
        }
        return;
      }

      const created = await assignPermission(
        createAssignPermissionPayload(formState)
      );
      if (created) {
        setNotice(
          isStoreAccountCreateMode
            ? 'アカウントを作成しました'
            : '権限を付与しました'
        );
        syncPermissionList(created);
        resetForm();
      }
    },
    [
      assignPermission,
      createAccountOnlyUser,
      editingPermissionId,
      formState,
      isAccountOnlyCreateMode,
      isStoreAccountCreateMode,
      resetForm,
      syncPermissionList,
      updatePermission,
      requiresClinicForPermission,
    ]
  );

  const canManagePermission = useCallback(
    (permission: PermissionEntry) =>
      isHqAdmin ||
      (isAreaManager
        ? canAreaManagerManagePermissionRole(permission.role)
        : canClinicAdminManagePermissionRole(permission.role)),
    [isAreaManager, isHqAdmin]
  );

  const handleEdit = useCallback(
    (permission: PermissionEntry) => {
      if (!canManagePermission(permission)) {
        return;
      }

      setEditingPermissionId(permission.id);
      setFormState(createPermissionFormState(permission));
      const label = getPermissionInputLabel(permission);
      setUserSearch(label);
      setSelectedUserLabel(label);
      setIsUserPickerOpen(false);
      clearCandidates();
      setNotice(null);
    },
    [canManagePermission, clearCandidates]
  );

  const handleUserSearchChange = useCallback((value: string) => {
    setUserSearch(value);
    setSelectedUserLabel('');
    setFormState(prev => ({
      ...prev,
      user_id: '',
    }));
    setIsUserPickerOpen(true);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleRoleChange = useCallback((value: string) => {
    setFormState(prev => ({
      ...prev,
      role: toAdminUserRole(value),
    }));
  }, []);

  const handleClinicChange = useCallback((value: string) => {
    setFormState(prev => ({
      ...prev,
      clinic_id: value === NO_CLINIC_VALUE ? '' : value,
    }));
  }, []);

  const handleFullNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormState(prev => ({
        ...prev,
        full_name: event.target.value,
      }));
    },
    []
  );

  const handleEmailChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormState(prev => ({
        ...prev,
        email: event.target.value,
      }));
    },
    []
  );

  const handlePasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormState(prev => ({
        ...prev,
        password: event.target.value,
      }));
    },
    []
  );

  const handleAssignRoleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormState(prev => ({
        ...prev,
        assign_role: event.target.checked,
      }));
    },
    []
  );

  const handleUserSelect = useCallback(
    (candidate: UserPermissionCandidate) => {
      const label = getCandidateInputLabel(candidate);
      setUserSearch(label);
      setSelectedUserLabel(label);
      setFormState(prev => ({
        ...prev,
        user_id: candidate.user_id,
        clinic_id: prev.clinic_id || candidate.clinic_id || '',
      }));
      setIsUserPickerOpen(false);
      clearCandidates();
    },
    [clearCandidates]
  );

  const handleCreateModeChange = useCallback(
    (mode: AccountCreateMode) => {
      const shouldCreateStoreAccount = mode === CREATE_ACCOUNT_MODE_NEW;
      const shouldUseAccountFields =
        shouldCreateStoreAccount || mode === CREATE_ACCOUNT_MODE_ACCOUNT_ONLY;

      setFormState(prev => ({
        ...prev,
        create_mode: mode,
        user_id: shouldUseAccountFields ? '' : prev.user_id,
        full_name: shouldUseAccountFields ? prev.full_name : '',
        email: shouldUseAccountFields ? prev.email : '',
        password: '',
        role:
          shouldCreateStoreAccount &&
          !creatableRoleOptions.some(option => option.value === prev.role)
            ? (creatableRoleOptions[0]?.value ?? defaultFormRole)
            : prev.role,
        assign_role:
          mode === CREATE_ACCOUNT_MODE_ACCOUNT_ONLY ? prev.assign_role : true,
      }));
      setUserSearch('');
      setSelectedUserLabel('');
      setIsUserPickerOpen(false);
      clearCandidates();
      setNotice(null);
    },
    [clearCandidates, creatableRoleOptions, defaultFormRole]
  );

  const handleRevoke = useCallback(
    async (permission: PermissionEntry) => {
      if (!canManagePermission(permission)) {
        return;
      }

      setNotice(null);
      const ok = await revokePermission(permission.id);
      if (ok) {
        setNotice('権限を外しました');
        removePermissionFromList(permission.id);
      }
    },
    [canManagePermission, removePermissionFromList, revokePermission]
  );

  const hasSelectedUser = useMemo(
    () =>
      Boolean(formState.user_id) &&
      Boolean(selectedUserLabel) &&
      userSearch.trim() === selectedUserLabel.trim(),
    [formState.user_id, selectedUserLabel, userSearch]
  );

  const roleField = (
    <div className='space-y-2'>
      <label htmlFor='admin-user-role' className='text-sm font-medium'>
        ロール
      </label>
      <Select value={formState.role} onValueChange={handleRoleChange}>
        <SelectTrigger id='admin-user-role'>
          <SelectValue placeholder='ロールを選択' />
        </SelectTrigger>
        <SelectContent>
          {formRoleOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AdminPageShell
      title='アカウント・権限管理'
      description='既存店舗にログインできる人とロールを管理します。子テナントや店舗そのものの作成はクリニック管理で扱います。'
    >
      <AdminScopeNotice
        title='この画面の役割'
        description='人・ログイン権限を管理する画面です。店舗そのものの作成とは分けて扱います。'
        items={ACCOUNT_SCOPE_NOTICE_ITEMS}
        action={
          isHqAdmin
            ? { href: '/admin/tenants', label: '子テナントを作成する' }
            : undefined
        }
      />

      <AdminFormCard
        title={
          editingPermissionId
            ? '権限編集'
            : isStoreAccountCreateMode
              ? '店舗ユーザー作成'
              : isAccountOnlyCreateMode
                ? 'ユーザーアカウントのみ作成'
                : '既存アカウントへの権限付与'
        }
        description='店舗を作る画面ではありません。選択済みの所属店舗へログインできる人を追加・管理します。'
      >
        <form onSubmit={handleSubmit} className='space-y-4'>
          {!editingPermissionId && (
            <div className='flex flex-wrap gap-2 rounded-lg bg-slate-50 p-1'>
              <Button
                type='button'
                variant={
                  formState.create_mode === CREATE_ACCOUNT_MODE_EXISTING
                    ? 'default'
                    : 'ghost'
                }
                onClick={() =>
                  handleCreateModeChange(CREATE_ACCOUNT_MODE_EXISTING)
                }
              >
                既存ユーザーに権限付与
              </Button>
              <Button
                type='button'
                variant={
                  formState.create_mode === CREATE_ACCOUNT_MODE_NEW
                    ? 'default'
                    : 'ghost'
                }
                onClick={() => handleCreateModeChange(CREATE_ACCOUNT_MODE_NEW)}
                disabled={creatableRoleOptions.length === 0}
              >
                新規店舗ユーザーを作成
              </Button>
              {isHqAdmin && (
                <Button
                  type='button'
                  variant={
                    formState.create_mode === CREATE_ACCOUNT_MODE_ACCOUNT_ONLY
                      ? 'default'
                      : 'ghost'
                  }
                  onClick={() =>
                    handleCreateModeChange(CREATE_ACCOUNT_MODE_ACCOUNT_ONLY)
                  }
                >
                  ユーザーアカウントのみ作成
                </Button>
              )}
            </div>
          )}
          {isStoreAccountCreateMode && (
            <div className='rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900'>
              作成するのは子テナントではなく、所属店舗に紐づくログインアカウントです。作成後すぐにログインできます。
              初期パスワードは安全な方法で本人へ共有してください。
            </div>
          )}
          {isAccountOnlyCreateMode && (
            <div className='rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'>
              ログインアカウントだけを作成できます。必要な場合だけロールを同時に付与してください。
            </div>
          )}
          {!usesAccountFields ? (
            <div className='grid gap-4 md:grid-cols-2'>
              <UserCandidateCombobox
                candidates={userCandidates}
                disabled={Boolean(editingPermissionId)}
                error={userCandidatesError}
                hasSelectedUser={hasSelectedUser}
                inputId='admin-user-search'
                isOpen={isUserPickerOpen}
                listboxId='admin-user-candidates'
                loading={userCandidatesLoading}
                selectedUserId={formState.user_id}
                value={userSearch}
                onOpenChange={setIsUserPickerOpen}
                onSearchChange={handleUserSearchChange}
                onSelect={handleUserSelect}
              />
              {roleField}
            </div>
          ) : (
            <>
              <AdminAccountCreateFields
                fullName={formState.full_name}
                email={formState.email}
                password={formState.password}
                fullNameInputId='admin-new-user-full-name'
                emailInputId='admin-new-user-email'
                passwordInputId='admin-new-user-password'
                onFullNameChange={handleFullNameChange}
                onEmailChange={handleEmailChange}
                onPasswordChange={handlePasswordChange}
              />
              {isAccountOnlyCreateMode && (
                <label className='flex items-center gap-2 text-sm font-medium'>
                  <input
                    type='checkbox'
                    checked={formState.assign_role}
                    onChange={handleAssignRoleChange}
                    className='h-4 w-4 rounded border-slate-300'
                  />
                  作成時にロールを付与する
                </label>
              )}
              {(isStoreAccountCreateMode ||
                (isAccountOnlyCreateMode && formState.assign_role)) && (
                <div className='grid gap-4 md:grid-cols-2'>{roleField}</div>
              )}
            </>
          )}
          {(!isAccountOnlyCreateMode || formState.assign_role) && (
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <label
                  htmlFor='admin-user-clinic'
                  className='text-sm font-medium'
                >
                  所属先店舗（作成済みテナント）
                </label>
                <Select
                  value={formState.clinic_id || NO_CLINIC_VALUE}
                  onValueChange={handleClinicChange}
                  disabled={
                    formState.role === 'admin' ||
                    (isAccountOnlyCreateMode && !formState.assign_role)
                  }
                >
                  <SelectTrigger id='admin-user-clinic'>
                    <SelectValue placeholder='クリニックを選択' />
                  </SelectTrigger>
                  <SelectContent>
                    {!requiresClinicForPermission && (
                      <SelectItem value={NO_CLINIC_VALUE}>未指定</SelectItem>
                    )}
                    {clinicOptions.map(clinic => (
                      <SelectItem key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='submit'
              disabled={
                loading ||
                ((!isAccountOnlyCreateMode || formState.assign_role) &&
                  formRoleOptions.length === 0)
              }
            >
              {editingPermissionId
                ? '権限を更新する'
                : isAccountOnlyCreateMode
                  ? 'ユーザーアカウントを作成する'
                  : isStoreAccountCreateMode
                    ? 'アカウントを作成する'
                    : '権限を付与する'}
            </Button>
            {editingPermissionId && (
              <Button type='button' variant='outline' onClick={resetForm}>
                編集をキャンセル
              </Button>
            )}
            {notice && (
              <span className='text-sm text-emerald-600'>{notice}</span>
            )}
            {error && <span className='text-sm text-red-500'>{error}</span>}
            {clinicOptionsError && (
              <span className='text-sm text-red-500'>{clinicOptionsError}</span>
            )}
          </div>
        </form>
      </AdminFormCard>

      <AdminListCard
        title='アカウント一覧'
        searchId='admin-user-permission-search'
        searchValue={search}
        searchPlaceholder='氏名・メールで検索'
        onSearchChange={handleSearchChange}
        filters={
          <>
            <Select
              value={roleFilter}
              onValueChange={value => setRoleFilter(toRoleFilterValue(value))}
            >
              <SelectTrigger className='w-40'>
                <SelectValue placeholder='ロール' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_FILTER_ALL}>すべて</SelectItem>
                {roleOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={clinicFilter}
              onValueChange={value => setClinicFilter(value)}
            >
              <SelectTrigger className='w-56'>
                <SelectValue placeholder='所属店舗' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLINIC_FILTER_ALL}>すべて</SelectItem>
                {clinicOptions.map(clinic => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      >
        {(loading || clinicOptionsLoading) && permissions.length === 0 ? (
          <AdminState variant='loading' title='読み込み中...' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>権限ID</TableHead>
                <TableHead>アカウント</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead>所属店舗</TableHead>
                <TableHead>作成日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map(permission => (
                <PermissionTableRow
                  key={permission.id}
                  permission={permission}
                  canManage={canManagePermission(permission)}
                  onEdit={handleEdit}
                  onRevoke={handleRevoke}
                />
              ))}
              {permissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <AdminState
                      variant='empty'
                      title='権限情報がありません'
                      description='検索条件を変更するか、対象ユーザーに権限を付与してください。'
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </AdminListCard>

      <section className='space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>シフト管理</h2>
            <p className='mt-1 text-sm leading-6 text-slate-600'>
              所属店舗のスタッフシフト、希望条件、需要予測を確認・調整します。
            </p>
          </div>
          <div className='w-full space-y-2 md:w-72'>
            <label
              htmlFor='admin-user-shift-clinic'
              className='text-sm font-medium'
            >
              対象店舗
            </label>
            <Select
              value={shiftClinicId || NO_CLINIC_VALUE}
              onValueChange={value =>
                setShiftClinicId(value === NO_CLINIC_VALUE ? '' : value)
              }
              disabled={clinicOptionsLoading || clinicOptions.length === 0}
            >
              <SelectTrigger id='admin-user-shift-clinic'>
                <SelectValue placeholder='クリニックを選択' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLINIC_VALUE}>未指定</SelectItem>
                {clinicOptions.map(clinic => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {shiftClinicId ? (
          <ShiftOptimizer clinicId={shiftClinicId} />
        ) : (
          <AdminState
            variant='empty'
            title='シフト管理の対象店舗がありません'
            description='所属店舗を選択するとシフト管理を表示します。'
          />
        )}
      </section>
    </AdminPageShell>
  );
}

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
import { AdminState } from '@/components/admin/admin-state';
import { UserCandidateCombobox } from '@/components/admin/user-candidate-combobox';
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
  DEFAULT_ADMIN_USER_ROLE,
  NO_CLINIC_VALUE,
  ROLE_FILTER_ALL,
  USER_CANDIDATE_MIN_SEARCH_LENGTH,
  buildPermissionFilters,
  canClinicAdminManagePermissionRole,
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

  const [notice, setNotice] = useState<string | null>(null);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(
    null
  );
  const [formState, setFormState] = useState<PermissionFormState>(() =>
    createEmptyPermissionFormState(defaultFormRole)
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
    const trimmedSearch = deferredUserSearch.trim();
    const selectedLabel = selectedUserLabel.trim();

    if (
      editingPermissionId ||
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
    editingPermissionId,
    fetchUserCandidates,
    isUserPickerOpen,
    selectedUserLabel,
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

      const validationMessage = validatePermissionForm(formState);
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

      const created = await assignPermission(
        createAssignPermissionPayload(formState)
      );
      if (created) {
        setNotice('権限を付与しました');
        syncPermissionList(created);
        resetForm();
      }
    },
    [
      assignPermission,
      editingPermissionId,
      formState,
      resetForm,
      syncPermissionList,
      updatePermission,
    ]
  );

  const canManagePermission = useCallback(
    (permission: PermissionEntry) =>
      isHqAdmin || canClinicAdminManagePermissionRole(permission.role),
    [isHqAdmin]
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

  return (
    <AdminPageShell
      title='アカウント・権限管理'
      description='ログインできるアカウント、所属店舗、ロールを管理します。店舗スタッフの招待や勤務情報は店舗単位の管理画面で扱います。'
    >
      <AdminFormCard title={editingPermissionId ? '権限編集' : '権限付与'}>
        <form onSubmit={handleSubmit} className='space-y-4'>
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
            <div className='space-y-2'>
              <label htmlFor='admin-user-role' className='text-sm font-medium'>
                ロール
              </label>
              <Select
                value={formState.role}
                onValueChange={value =>
                  setFormState(prev => ({
                    ...prev,
                    role: toAdminUserRole(value),
                  }))
                }
              >
                <SelectTrigger id='admin-user-role'>
                  <SelectValue placeholder='ロールを選択' />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <label
                htmlFor='admin-user-clinic'
                className='text-sm font-medium'
              >
                所属店舗
              </label>
              <Select
                value={formState.clinic_id || NO_CLINIC_VALUE}
                onValueChange={value =>
                  setFormState(prev => ({
                    ...prev,
                    clinic_id: value === NO_CLINIC_VALUE ? '' : value,
                  }))
                }
                disabled={formState.role === 'admin'}
              >
                <SelectTrigger id='admin-user-clinic'>
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
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='submit'
              disabled={loading || roleOptions.length === 0}
            >
              {editingPermissionId ? '権限を更新する' : '権限を付与する'}
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
    </AdminPageShell>
  );
}

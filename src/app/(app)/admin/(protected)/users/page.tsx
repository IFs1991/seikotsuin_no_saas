'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  CLINIC_FILTER_ALL,
  NO_CLINIC_VALUE,
  ROLE_FILTER_ALL,
  buildPermissionFilters,
  createAssignPermissionPayload,
  createEmptyPermissionFormState,
  createPermissionFormState,
  createUpdatePermissionPayload,
  toAdminUserRole,
  toRoleFilterValue,
  validatePermissionForm,
  type AdminUsersRoleFilter,
  type PermissionFormState,
} from '@/lib/admin/users';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { ADMIN_USER_ROLE_OPTIONS, getRoleLabel } from '@/lib/constants/roles';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
};

export default function AdminUsersPage() {
  const {
    permissions,
    loading,
    error,
    fetchPermissions,
    assignPermission,
    updatePermission,
    revokePermission,
  } = useAdminUsers();
  const { clinics, fetchClinics } = useAdminTenants();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] =
    useState<AdminUsersRoleFilter>(ROLE_FILTER_ALL);
  const [clinicFilter, setClinicFilter] = useState<string>(CLINIC_FILTER_ALL);

  const [notice, setNotice] = useState<string | null>(null);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(
    null
  );
  const [formState, setFormState] = useState<PermissionFormState>(
    createEmptyPermissionFormState
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
    fetchClinics({ isActive: null });
  }, [fetchClinics]);

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

  const resetForm = () => {
    setEditingPermissionId(null);
    setFormState(createEmptyPermissionFormState());
  };

  const handleSubmit = async (event: React.FormEvent) => {
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
        resetForm();
        fetchPermissions(currentFilters);
      }
      return;
    }

    const created = await assignPermission(
      createAssignPermissionPayload(formState)
    );
    if (created) {
      setNotice('権限を付与しました');
      resetForm();
      fetchPermissions(currentFilters);
    }
  };

  const handleEdit = (permission: (typeof permissions)[number]) => {
    setEditingPermissionId(permission.id);
    setFormState(createPermissionFormState(permission));
    setNotice(null);
  };

  const handleRevoke = async (permissionId: string) => {
    setNotice(null);
    const ok = await revokePermission(permissionId);
    if (ok) {
      setNotice('権限を外しました');
      fetchPermissions(currentFilters);
    }
  };

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 p-6'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-xl font-semibold'>
              アカウント・権限管理
            </CardTitle>
            <CardDescription>
              ログインできるアカウント、所属店舗、ロールを管理します。店舗スタッフの招待や勤務情報は店舗単位の管理画面で扱います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label
                    htmlFor='admin-user-id'
                    className='text-sm font-medium'
                  >
                    Supabase Auth ユーザーID
                  </label>
                  <Input
                    id='admin-user-id'
                    value={formState.user_id}
                    onChange={event =>
                      setFormState(prev => ({
                        ...prev,
                        user_id: event.target.value,
                      }))
                    }
                    placeholder='auth.users の UUID'
                    disabled={Boolean(editingPermissionId)}
                  />
                </div>
                <div className='space-y-2'>
                  <label
                    htmlFor='admin-user-role'
                    className='text-sm font-medium'
                  >
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
                      {ADMIN_USER_ROLE_OPTIONS.map(option => (
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
                      {clinics.map(clinic => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Button type='submit' disabled={loading}>
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
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='space-y-3'>
            <CardTitle className='text-lg font-semibold'>
              アカウント一覧
            </CardTitle>
            <div className='flex flex-wrap items-center gap-3'>
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='アカウントID/メールで検索'
                className='max-w-xs'
              />
              <Select
                value={roleFilter}
                onValueChange={value => setRoleFilter(toRoleFilterValue(value))}
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder='ロール' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROLE_FILTER_ALL}>すべて</SelectItem>
                  {ADMIN_USER_ROLE_OPTIONS.map(option => (
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
                  {clinics.map(clinic => (
                    <SelectItem key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading && permissions.length === 0 ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>アカウント</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>所属店舗</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map(permission => (
                    <TableRow key={permission.id}>
                      <TableCell className='text-xs text-gray-500'>
                        {permission.id}
                      </TableCell>
                      <TableCell>
                        <div className='text-sm font-medium'>
                          {permission.profile_email || permission.username}
                        </div>
                        <div className='text-xs text-gray-500'>
                          {permission.user_id}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleLabel(permission.role)}</TableCell>
                      <TableCell>
                        {permission.clinic_name || permission.clinic_id || '-'}
                      </TableCell>
                      <TableCell>{formatDate(permission.created_at)}</TableCell>
                      <TableCell className='space-x-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => handleEdit(permission)}
                        >
                          編集
                        </Button>
                        <Button
                          size='sm'
                          variant='destructive'
                          onClick={() => handleRevoke(permission.id)}
                        >
                          権限を外す
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {permissions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center text-sm'>
                        権限情報がありません
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

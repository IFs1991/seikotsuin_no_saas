'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { useAdminUsers, type PermissionFilters } from '@/hooks/useAdminUsers';
import { useAdminTenants } from '@/hooks/useAdminTenants';

const ROLE_OPTIONS = [
  { label: 'admin', value: 'admin' },
  { label: 'clinic_admin', value: 'clinic_admin' },
  { label: 'manager', value: 'manager' },
  { label: 'therapist', value: 'therapist' },
  { label: 'staff', value: 'staff' },
] as const;

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
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [clinicFilter, setClinicFilter] = useState<string>('all');

  const [notice, setNotice] = useState<string | null>(null);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(
    null
  );
  const [formState, setFormState] = useState({
    user_id: '',
    role: 'clinic_admin',
    clinic_id: '',
  });

  const currentFilters = useMemo<PermissionFilters>(() => {
    const result: PermissionFilters = {};
    if (roleFilter !== 'all') result.role = roleFilter;
    if (clinicFilter !== 'all') result.clinicId = clinicFilter;
    if (search) result.search = search;
    return result;
  }, [clinicFilter, roleFilter, search]);

  useEffect(() => {
    fetchClinics({ isActive: null });
  }, [fetchClinics]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchPermissions(currentFilters);
    }, 200);
    return () => clearTimeout(timeout);
  }, [fetchPermissions, currentFilters]);

  const resetForm = () => {
    setEditingPermissionId(null);
    setFormState({
      user_id: '',
      role: 'clinic_admin',
      clinic_id: '',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);

    if (!formState.user_id.trim()) {
      setNotice('ユーザーIDを入力してください');
      return;
    }

    if (formState.role !== 'admin' && !formState.clinic_id.trim()) {
      setNotice('クリニックIDを選択してください');
      return;
    }

    if (editingPermissionId) {
      const updated = await updatePermission(editingPermissionId, {
        role: formState.role,
        clinic_id:
          formState.role === 'admin' ? null : formState.clinic_id || null,
      });
      if (updated) {
        setNotice('権限を更新しました');
        resetForm();
        fetchPermissions(currentFilters);
      }
      return;
    }

    const created = await assignPermission({
      user_id: formState.user_id,
      role: formState.role,
      clinic_id:
        formState.role === 'admin' ? null : formState.clinic_id || null,
    });
    if (created) {
      setNotice('権限を付与しました');
      resetForm();
      fetchPermissions(currentFilters);
    }
  };

  const handleEdit = (permission: (typeof permissions)[number]) => {
    setEditingPermissionId(permission.id);
    setFormState({
      user_id: permission.user_id || '',
      role: permission.role,
      clinic_id: permission.clinic_id || '',
    });
    setNotice(null);
  };

  const handleRevoke = async (permissionId: string) => {
    setNotice(null);
    const ok = await revokePermission(permissionId);
    if (ok) {
      setNotice('権限を剥奪しました');
      fetchPermissions(currentFilters);
    }
  };

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 p-6'>
      <div className='mx-auto max-w-6xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-xl font-semibold'>
              ユーザー権限管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>ユーザーID</label>
                  <Input
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
                  <label className='text-sm font-medium'>ロール</label>
                  <Select
                    value={formState.role}
                    onValueChange={value =>
                      setFormState(prev => ({ ...prev, role: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='ロールを選択' />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(option => (
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
                  <label className='text-sm font-medium'>クリニック</label>
                  <Select
                    value={formState.clinic_id || 'none'}
                    onValueChange={value =>
                      setFormState(prev => ({
                        ...prev,
                        clinic_id: value === 'none' ? '' : value,
                      }))
                    }
                    disabled={formState.role === 'admin'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='クリニックを選択' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='none'>未指定</SelectItem>
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
                  {editingPermissionId ? '更新する' : '付与する'}
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
            <CardTitle className='text-lg font-semibold'>一覧</CardTitle>
            <div className='flex flex-wrap items-center gap-3'>
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='ユーザーID/メールで検索'
                className='max-w-xs'
              />
              <Select
                value={roleFilter}
                onValueChange={value => setRoleFilter(value)}
              >
                <SelectTrigger className='w-40'>
                  <SelectValue placeholder='ロール' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>すべて</SelectItem>
                  {ROLE_OPTIONS.map(option => (
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
                  <SelectValue placeholder='クリニック' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>すべて</SelectItem>
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
                    <TableHead>ユーザー</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>クリニック</TableHead>
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
                      <TableCell>{permission.role}</TableCell>
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
                          剥奪
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

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAdminTenants } from '@/hooks/useAdminTenants';
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

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
};

export default function AdminTenantsPage() {
  const { clinics, loading, error, fetchClinics, createClinic, updateClinic } =
    useAdminTenants();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]['value']>('active');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    address: '',
    phone_number: '',
    is_active: true,
  });

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

  const resetForm = () => {
    setFormState({
      name: '',
      address: '',
      phone_number: '',
      is_active: true,
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);

    if (!formState.name.trim()) {
      setNotice('クリニック名を入力してください');
      return;
    }

    if (editingId) {
      const updated = await updateClinic(editingId, {
        name: formState.name,
        address: formState.address || null,
        phone_number: formState.phone_number || null,
        is_active: formState.is_active,
      });
      if (updated) {
        setNotice('クリニックを更新しました');
        resetForm();
        fetchClinics(currentFilters);
      }
      return;
    }

    const created = await createClinic({
      name: formState.name,
      address: formState.address || undefined,
      phone_number: formState.phone_number || undefined,
      is_active: formState.is_active,
    });

    if (created) {
      setNotice('クリニックを作成しました');
      resetForm();
      fetchClinics(currentFilters);
    }
  };

  const handleEdit = (clinic: (typeof clinics)[number]) => {
    setEditingId(clinic.id);
    setFormState({
      name: clinic.name,
      address: clinic.address ?? '',
      phone_number: clinic.phone_number ?? '',
      is_active: clinic.is_active,
    });
    setNotice(null);
  };

  const handleToggleActive = async (clinic: (typeof clinics)[number]) => {
    setNotice(null);
    const updated = await updateClinic(clinic.id, {
      is_active: !clinic.is_active,
    });
    if (updated) {
      setNotice(
        clinic.is_active
          ? 'クリニックを無効化しました'
          : 'クリニックを有効化しました'
      );
      fetchClinics(currentFilters);
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
                  <label className='text-sm font-medium'>クリニック名</label>
                  <Input
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
                  <label className='text-sm font-medium'>電話番号</label>
                  <Input
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
                  <label className='text-sm font-medium'>住所</label>
                  <Input
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
                    checked={formState.is_active}
                    onCheckedChange={value =>
                      setFormState(prev => ({ ...prev, is_active: value }))
                    }
                  />
                  <span className='text-sm text-gray-600 dark:text-gray-300'>
                    有効
                  </span>
                </div>
              </div>
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

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listMasterData,
  createMasterData,
  updateMasterData,
  deleteMasterData,
  type MasterDataItem,
} from '@/lib/api/admin/master-data-client';

export interface UseMasterDataOptions {
  clinicId?: string | null;
  category?: string;
}

export interface MasterDataGroupedResult {
  [category: string]: MasterDataItem[];
}

export interface UseMasterDataReturn {
  data: MasterDataGroupedResult;
  items: MasterDataItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  createItem: (
    payload: Omit<MasterDataItem, 'id' | 'updated_at' | 'updated_by'>
  ) => Promise<void>;
  updateItem: (
    id: string,
    payload: Partial<Omit<MasterDataItem, 'id'>>
  ) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  importData: (file: File) => Promise<void>;
  exportData: () => void;
  refetch: () => Promise<void>;
  isMutating: boolean;
}

export function useMasterData(
  options: UseMasterDataOptions = {}
): UseMasterDataReturn {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  const query = useQuery({
    queryKey: [
      'admin-master-data',
      options.clinicId ?? 'global',
      options.category ?? 'all',
    ],
    queryFn: () =>
      listMasterData({
        clinic_id: options.clinicId ?? undefined,
        category: options.category,
      }),
  });

  const items = query.data?.items ?? [];

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const lowerSearch = searchQuery.toLowerCase();
    return items.filter(item => {
      return (
        item.name.toLowerCase().includes(lowerSearch) ||
        item.category.toLowerCase().includes(lowerSearch) ||
        (typeof item.value === 'string'
          ? item.value.toLowerCase().includes(lowerSearch)
          : false)
      );
    });
  }, [items, searchQuery]);

  const groupedData = useMemo(() => {
    return filteredItems.reduce<MasterDataGroupedResult>((acc, item) => {
      const key = item.category || 'uncategorized';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin-master-data'],
    });
  };

  const createMutation = useMutation({
    mutationFn: createMasterData,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Omit<MasterDataItem, 'id'>>;
    }) => updateMasterData(id, payload),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMasterData,
    onSuccess: invalidate,
  });

  const createItem = async (
    payload: Omit<MasterDataItem, 'id' | 'updated_at' | 'updated_by'>
  ) => {
    await createMutation.mutateAsync(payload);
  };

  const updateItem = async (
    id: string,
    payload: Partial<Omit<MasterDataItem, 'id'>>
  ) => {
    await updateMutation.mutateAsync({ id, payload });
  };

  const deleteItem = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: MasterDataItem[] = JSON.parse(text);

      await Promise.all(
        parsed.map(item =>
          createItem({
            clinic_id: item.clinic_id,
            name: item.name,
            category: item.category,
            value: item.value,
            data_type: item.data_type,
            description: item.description ?? null,
            is_editable: item.is_editable,
            is_public: item.is_public,
          })
        )
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        'インポートに失敗しました。ファイル形式を確認してください。'
      );
    }
  };

  const exportData = () => {
    const jsonString = JSON.stringify(items, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `master-data_${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const refetch = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin-master-data'],
    });
    await query.refetch();
  };

  return {
    data: groupedData,
    items,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    searchQuery,
    setSearchQuery,
    createItem,
    updateItem,
    deleteItem,
    importData,
    exportData,
    refetch,
    isMutating:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  };
}

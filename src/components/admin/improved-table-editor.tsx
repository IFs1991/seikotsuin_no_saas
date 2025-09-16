'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTableManager } from '@/hooks/useTableManager';
import { TableSelector } from './table-selector';
import { DataTable } from './data-table';
import { DataFormDialog } from './data-form-dialog';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';
import { TableData, FormMode } from '@/types/admin';

interface ImprovedTableEditorProps {
  onTableChange?: (tableName: string) => void;
}

export const ImprovedTableEditor: React.FC<ImprovedTableEditorProps> = ({ 
  onTableChange 
}) => {
  const {
    tableData,
    tableList,
    tableConfig,
    currentTable,
    loading,
    error,
    pagination,
    sortState,
    filterState,
    setCurrentTable,
    fetchTableData,
    createTableData,
    updateTableData,
    deleteTableData,
    setSearch,
    setSortState,
    setPage,
  } = useTableManager();

  // フォーム状態
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [editingItem, setEditingItem] = useState<TableData | null>(null);

  // 削除確認ダイアログ状態
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({
    open: false,
    id: '',
    name: ''
  });

  // テーブル選択処理
  const handleTableSelect = useCallback(async (tableName: string) => {
    setCurrentTable(tableName);
    await fetchTableData(tableName);
    onTableChange?.(tableName);
  }, [setCurrentTable, fetchTableData, onTableChange]);

  // 新規作成処理
  const handleCreate = useCallback(() => {
    setFormMode('create');
    setFormData({});
    setEditingItem(null);
    setShowForm(true);
  }, []);

  // 編集処理
  const handleEdit = useCallback((item: TableData) => {
    setFormMode('edit');
    setFormData({ ...item });
    setEditingItem(item);
    setShowForm(true);
  }, []);

  // 削除処理（確認ダイアログ表示）
  const handleDelete = useCallback((id: string, name: string) => {
    setDeleteDialog({
      open: true,
      id,
      name
    });
  }, []);

  // 削除確定処理
  const handleDeleteConfirm = useCallback(async () => {
    try {
      const success = await deleteTableData(deleteDialog.id);
      if (success) {
        setDeleteDialog({ open: false, id: '', name: '' });
      }
    } catch (error) {
      console.error('削除エラー:', error);
    }
  }, [deleteTableData, deleteDialog.id]);

  // フォーム送信処理
  const handleFormSubmit = useCallback(async (data: Record<string, unknown>) => {
    try {
      let success = false;
      
      if (formMode === 'create') {
        success = await createTableData(data);
      } else if (editingItem) {
        success = await updateTableData(editingItem.id, data);
      }

      if (success) {
        setShowForm(false);
        setFormData({});
        setEditingItem(null);
      }
    } catch (error) {
      console.error('フォーム送信エラー:', error);
    }
  }, [formMode, editingItem, createTableData, updateTableData]);

  // フォームフィールド変更処理
  const handleFieldChange = useCallback((name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  // フォームクローズ処理
  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setFormData({});
    setEditingItem(null);
  }, []);

  // 検索処理
  const handleSearch = useCallback((term: string) => {
    setSearch(term);
  }, [setSearch]);

  // ソート処理
  const handleSort = useCallback((column: string) => {
    const newOrder = sortState.sortBy === column && sortState.sortOrder === 'asc' ? 'desc' : 'asc';
    setSortState(column, newOrder);
  }, [sortState, setSortState]);

  // ページ変更処理
  const handlePageChange = useCallback((page: number) => {
    setPage(page);
  }, [setPage]);

  return (
    <div className="space-y-6">
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* テーブル選択 */}
      <TableSelector
        tableList={tableList}
        selectedTable={currentTable}
        onTableSelect={handleTableSelect}
        loading={loading}
      />

      {/* データテーブル */}
      {currentTable && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              {tableConfig?.name || currentTable}の管理
            </h2>
            <Button onClick={handleCreate} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              新規作成
            </Button>
          </div>

          <DataTable
            data={tableData}
            config={tableConfig}
            loading={loading}
            pagination={pagination}
            sortState={sortState}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPageChange={handlePageChange}
            onSort={handleSort}
            onSearch={handleSearch}
          />
        </>
      )}

      {/* フォームダイアログ */}
      <DataFormDialog
        open={showForm}
        mode={formMode}
        formData={formData}
        config={tableConfig}
        loading={loading}
        onSubmit={handleFormSubmit}
        onClose={handleFormClose}
        onFieldChange={handleFieldChange}
      />

      {/* 削除確認ダイアログ */}
      <DeleteConfirmationDialog
        open={deleteDialog.open}
        title="レコード"
        itemName={deleteDialog.name}
        loading={loading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ open: false, id: '', name: '' })}
      />
    </div>
  );
};
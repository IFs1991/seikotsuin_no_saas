import { useSystemSettings } from './useSystemSettings';
import { useTableManager } from './useTableManager';
import { MasterDataDetail as MasterData, TableData } from '@/types/admin';

/**
 * 管理者用統合フック（後方互換性のため）
 * 新規開発では useSystemSettings と useTableManager を直接使用してください
 * @deprecated Use useSystemSettings and useTableManager instead
 */
export const useAdminMaster = () => {
  const systemSettings = useSystemSettings();
  const tableManager = useTableManager();

  // 旧形式のAPI互換性のためのラッパー関数
  const fetchMasterData = async (category?: string, clinicId?: string) => {
    await systemSettings.fetchMasterData({ category, clinicId });
  };

  const fetchTableData = async (
    tableName: string,
    page = 1,
    limit = 20,
    search?: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc'
  ) => {
    tableManager.setCurrentTable(tableName);
    if (page !== tableManager.pagination.page) {
      tableManager.setPage(page);
    }
    if (search !== tableManager.filterState.search) {
      tableManager.setSearch(search || '');
    }
    if (
      sortBy &&
      sortOrder &&
      (sortBy !== tableManager.sortState.sortBy ||
        sortOrder !== tableManager.sortState.sortOrder)
    ) {
      tableManager.setSortState(sortBy, sortOrder);
    }
    await tableManager.fetchTableData(tableName);
  };

  const createMasterData = async (data: Partial<MasterData>) => {
    const success = await systemSettings.createMasterData(data);
    if (!success) {
      throw new Error(systemSettings.error || 'データの作成に失敗しました');
    }
    return data;
  };

  const updateMasterData = async (id: string, updates: Partial<MasterData>) => {
    const success = await systemSettings.updateMasterData(id, updates);
    if (!success) {
      throw new Error(systemSettings.error || 'データの更新に失敗しました');
    }
    return;
  };

  const deleteMasterData = async (id: string) => {
    const success = await systemSettings.deleteMasterData(id);
    if (!success) {
      throw new Error(systemSettings.error || 'データの削除に失敗しました');
    }
    return;
  };

  const exportMasterData = async () => {
    if (!systemSettings.exportMasterData) {
      throw new Error('エクスポート機能が利用できません');
    }
    const result = await systemSettings.exportMasterData();
    if (!result) {
      throw new Error(
        systemSettings.error || 'データのエクスポートに失敗しました'
      );
    }
    return result;
  };

  const importMasterData = async (items: MasterData[]) => {
    if (!systemSettings.importMasterData) {
      throw new Error('インポート機能が利用できません');
    }
    const success = await systemSettings.importMasterData(items);
    if (!success) {
      throw new Error(
        systemSettings.error || 'データのインポートに失敗しました'
      );
    }
    return true;
  };

  const rollbackMasterData = async () => {
    if (!systemSettings.rollbackMasterData) {
      throw new Error('ロールバック機能が利用できません');
    }
    const success = await systemSettings.rollbackMasterData();
    if (!success) {
      throw new Error(systemSettings.error || 'ロールバックに失敗しました');
    }
    return true;
  };

  const createTableData = async (
    tableName: string,
    data: Partial<TableData>
  ) => {
    if (tableName !== tableManager.currentTable) {
      tableManager.setCurrentTable(tableName);
    }
    const success = await tableManager.createTableData(
      data as Record<string, unknown>
    );
    if (!success) {
      throw new Error(tableManager.error || 'データの作成に失敗しました');
    }
    return data;
  };

  const updateTableData = async (
    tableName: string,
    id: string,
    updates: Partial<TableData>
  ) => {
    if (tableName !== tableManager.currentTable) {
      tableManager.setCurrentTable(tableName);
    }
    const success = await tableManager.updateTableData(
      id,
      updates as Record<string, unknown>
    );
    if (!success) {
      throw new Error(tableManager.error || 'データの更新に失敗しました');
    }
    return { id, ...updates };
  };

  const deleteTableData = async (tableName: string, id: string) => {
    if (tableName !== tableManager.currentTable) {
      tableManager.setCurrentTable(tableName);
    }
    const success = await tableManager.deleteTableData(id);
    if (!success) {
      throw new Error(tableManager.error || 'データの削除に失敗しました');
    }
    return true;
  };

  return {
    // マスターデータ関連
    masterData: systemSettings.masterData,
    fetchMasterData,
    createMasterData,
    updateMasterData,
    deleteMasterData,
    exportMasterData,
    importMasterData,
    rollbackMasterData,

    // テーブルデータ関連
    tableData: tableManager.tableData,
    tableList: tableManager.tableList,
    tableConfig: tableManager.tableConfig,
    currentTable: tableManager.currentTable,
    fetchTableList: tableManager.fetchTableList,
    fetchTableData,
    createTableData,
    updateTableData,
    deleteTableData,

    // 共通
    loading: systemSettings.loading || tableManager.loading,
    error: systemSettings.error || tableManager.error,
    pagination: tableManager.pagination,

    // 旧関数（後方互換性のため）
    handleCreate: createTableData,
    handleUpdate: updateTableData,
    handleDelete: deleteTableData,
  };
};

// 既存のコードとの互換性のためのエクスポート
export const useMasterData = useAdminMaster;

// 新しいフックの再エクスポート
export { useSystemSettings } from './useSystemSettings';
export { useTableManager } from './useTableManager';

import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES, PAGINATION } from '@/lib/constants';
import { 
  TableData, 
  TableListItem, 
  TableConfig, 
  PaginationState, 
  SortState, 
  FilterState, 
  SortOrder,
  UseTableManagerReturn,
  ApiResponse
} from '@/types/admin';

export const useTableManager = (): UseTableManagerReturn => {
  // データ状態
  const [tableData, setTableData] = useState<TableData[]>([]);
  const [tableList, setTableList] = useState<TableListItem[]>([]);
  const [tableConfig, setTableConfig] = useState<TableConfig | null>(null);
  const [currentTable, setCurrentTableState] = useState<string>('');

  // UI状態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: PAGINATION.DEFAULT_PAGE_SIZE,
    total: 0,
    total_pages: 0
  });
  const [sortState, setSortState] = useState<SortState>({
    sortBy: 'created_at',
    sortOrder: 'desc'
  });
  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    category: '',
    clinicId: '',
    isPublic: false,
  });

  // エラーメッセージのフォーマット
  const formatErrorMessage = (error: any): string => {
    if (error.details && Array.isArray(error.details)) {
      return error.details.map((detail: any) => 
        `${detail.path?.join('.')}: ${detail.message}`
      ).join(', ');
    }
    return error.message || ERROR_MESSAGES.SERVER_ERROR;
  };

  // テーブル一覧の取得
  const fetchTableList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(API_ENDPOINTS.ADMIN.TABLES);
      const result: ApiResponse<TableListItem[]> = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setTableList(result.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      console.error('テーブル一覧取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // テーブルデータの取得
  const fetchTableData = useCallback(async (tableName?: string) => {
    const targetTable = tableName || currentTable;
    if (!targetTable) return;

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        table: targetTable,
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sort_by: sortState.sortBy,
        sort_order: sortState.sortOrder
      });
      
      if (filterState.search) {
        params.append('search', filterState.search);
      }

      const response = await fetch(`${API_ENDPOINTS.ADMIN.TABLES}?${params.toString()}`);
      const result: ApiResponse<{
        data: TableData[];
        table_config: TableConfig;
        pagination: PaginationState;
      }> = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      if (result.data) {
        setTableData(result.data.data || []);
        setTableConfig(result.data.table_config || null);
        setPagination(result.data.pagination || pagination);
      }

      if (tableName) {
        setCurrentTableState(tableName);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      console.error('テーブルデータ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [currentTable, pagination.page, pagination.limit, sortState, filterState.search]);

  // テーブルデータの作成
  const createTableData = useCallback(async (data: Record<string, unknown>): Promise<boolean> => {
    if (!currentTable) return false;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_ENDPOINTS.ADMIN.TABLES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: currentTable, data })
      });

      const result: ApiResponse<TableData> = await response.json();

      if (!result.success) {
        throw { message: result.error, details: result.details };
      }

      if (result.data) {
        setTableData(prev => [result.data!, ...prev]);
        // ページネーション情報を更新
        setPagination(prev => ({ ...prev, total: prev.total + 1 }));
      }

      return true;
    } catch (err: any) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      console.error('テーブルデータ作成エラー:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentTable]);

  // テーブルデータの更新
  const updateTableData = useCallback(async (id: string, data: Record<string, unknown>): Promise<boolean> => {
    if (!currentTable) return false;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_ENDPOINTS.ADMIN.TABLES, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: currentTable, id, data })
      });

      const result: ApiResponse<TableData> = await response.json();

      if (!result.success) {
        throw { message: result.error, details: result.details };
      }

      if (result.data) {
        setTableData(prev => 
          prev.map(item => item.id === id ? result.data! : item)
        );
      }

      return true;
    } catch (err: any) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      console.error('テーブルデータ更新エラー:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentTable]);

  // テーブルデータの削除
  const deleteTableData = useCallback(async (id: string): Promise<boolean> => {
    if (!currentTable) return false;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_ENDPOINTS.ADMIN.TABLES}?table=${currentTable}&id=${id}`, {
        method: 'DELETE'
      });

      const result: ApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setTableData(prev => prev.filter(item => item.id !== id));
      // ページネーション情報を更新
      setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      console.error('テーブルデータ削除エラー:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentTable]);

  // テーブル選択
  const setCurrentTable = useCallback((tableName: string) => {
    setCurrentTableState(tableName);
    // ページをリセット
    setPagination(prev => ({ ...prev, page: 1 }));
    setTableData([]);
    setTableConfig(null);
  }, []);

  // 検索設定
  const setSearch = useCallback((term: string) => {
    setFilterState(prev => ({ ...prev, search: term }));
    setPagination(prev => ({ ...prev, page: 1 })); // 検索時はページをリセット
  }, []);

  // ソート設定
  const setSortStateValue = useCallback((sortBy: string, sortOrder: SortOrder) => {
    setSortState({ sortBy, sortOrder });
    setPagination(prev => ({ ...prev, page: 1 })); // ソート時はページをリセット
  }, []);

  // ページ設定
  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  // 状態リセット
  const resetState = useCallback(() => {
    setTableData([]);
    setTableConfig(null);
    setCurrentTableState('');
    setError(null);
    setPagination({
      page: 1,
      limit: PAGINATION.DEFAULT_PAGE_SIZE,
      total: 0,
      total_pages: 0
    });
    setSortState({
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
    setFilterState({
      search: '',
      category: '',
      clinicId: '',
      isPublic: false,
    });
  }, []);

  // 初期化時にテーブル一覧を取得
  useEffect(() => {
    fetchTableList();
  }, [fetchTableList]);

  // テーブル、ページ、ソート、検索が変わったらデータを再取得
  useEffect(() => {
    if (currentTable) {
      fetchTableData();
    }
  }, [currentTable, pagination.page, sortState, filterState.search]);

  return {
    // データ状態
    tableData,
    tableList,
    tableConfig,
    currentTable,
    
    // UI状態
    loading,
    error,
    pagination,
    sortState,
    filterState,
    
    // アクション
    setCurrentTable,
    fetchTableList,
    fetchTableData,
    createTableData,
    updateTableData,
    deleteTableData,
    
    // フィルター・ソート
    setSearch,
    setSortState: setSortStateValue,
    setPage,
    
    // リセット
    resetState,
  };
};
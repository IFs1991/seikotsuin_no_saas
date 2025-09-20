import { useState, useCallback, useRef } from 'react';
import { supabase } from '../api/database/supabase-client';

interface MasterData {
  id: string;
  name: string;
  category: string;
  order: number;
  isActive: boolean;
  updatedAt: string;
}

interface MasterDataHistory {
  data: MasterData[];
  timestamp: number;
}

export const useMasterData = () => {
  const [data, setData] = useState<MasterData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<MasterDataHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: masterData, error: fetchError } = await supabase
        .from('master_data')
        .select('*')
        .order('order');

      if (fetchError) throw fetchError;
      setData(masterData);
      addToHistory(masterData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  const addToHistory = (newData: MasterData[]) => {
    const newHistory = {
      data: JSON.parse(JSON.stringify(newData)),
      timestamp: Date.now(),
    };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newHistory]);
    setHistoryIndex(prev => prev + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setData(history[historyIndex - 1].data);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setData(history[historyIndex + 1].data);
    }
  };

  const createItem = async (newItem: Omit<MasterData, 'id' | 'updatedAt'>) => {
    try {
      const { data: created, error } = await supabase
        .from('master_data')
        .insert([{ ...newItem, updatedAt: new Date().toISOString() }])
        .select()
        .single();

      if (error) throw error;
      setData(prev => [...prev, created]);
      addToHistory([...data, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成エラー');
    }
  };

  const updateItem = async (id: string, updates: Partial<MasterData>) => {
    try {
      const { data: updated, error } = await supabase
        .from('master_data')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setData(prev => prev.map(item => (item.id === id ? updated : item)));
      addToHistory(data.map(item => (item.id === id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新エラー');
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('master_data')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setData(prev => prev.filter(item => item.id !== id));
      addToHistory(data.filter(item => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除エラー');
    }
  };

  const handleDragStart = (position: number) => {
    dragItem.current = position;
  };

  const handleDragEnter = (position: number) => {
    dragOverItem.current = position;
  };

  const handleDrop = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;

    const newData = [...data];
    const draggedItem = newData[dragItem.current];
    newData.splice(dragItem.current, 1);
    newData.splice(dragOverItem.current, 0, draggedItem);

    const updates = newData.map((item, index) => ({
      id: item.id,
      order: index,
    }));

    try {
      const { error } = await supabase.from('master_data').upsert(updates);

      if (error) throw error;
      setData(newData);
      addToHistory(newData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '並び替えエラー');
    }

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const filterData = useCallback(() => {
    return data.filter(
      item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const exportData = () => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master_data_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const content = await file.text();
      const importedData = JSON.parse(content);

      const { error } = await supabase.from('master_data').upsert(
        importedData.map((item: MasterData, index: number) => ({
          ...item,
          order: index,
          updatedAt: new Date().toISOString(),
        }))
      );

      if (error) throw error;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートエラー');
    }
  };

  return {
    data,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    filteredData: filterData(),
    createItem,
    updateItem,
    deleteItem,
    handleDragStart,
    handleDragEnter,
    handleDrop,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    exportData,
    importData,
  };
};

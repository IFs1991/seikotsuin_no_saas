'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { DataTableProps } from '@/types/admin';

export const DataTable: React.FC<DataTableProps> = ({
  data,
  config,
  loading,
  pagination,
  sortState,
  onEdit,
  onDelete,
  onPageChange,
  onSort,
  onSearch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    {}
  );

  // カラム表示設定の初期化
  React.useEffect(() => {
    if (config?.columns && Object.keys(visibleColumns).length === 0) {
      const initialVisibility = Object.keys(config.columns).reduce(
        (acc, key) => {
          acc[key] = !['created_at', 'updated_at'].includes(key);
          return acc;
        },
        {} as Record<string, boolean>
      );
      setVisibleColumns(initialVisibility);
    }
  }, [config, visibleColumns]);

  // 表示対象のカラム
  const displayColumns = useMemo(() => {
    if (!config?.columns) return [];
    return Object.entries(config.columns)
      .filter(([key]) => visibleColumns[key])
      .map(([key, columnConfig]) => ({
        key,
        label: columnConfig.label || key,
        type: columnConfig.type,
        readonly: columnConfig.readonly,
      }));
  }, [config, visibleColumns]);

  // 値の表示形式を整える
  const formatCellValue = (value: unknown, type: string): React.ReactNode => {
    if (value === null || value === undefined) return '-';

    switch (type) {
      case 'boolean':
        return value ? '有効' : '無効';
      case 'timestamp':
        if (typeof value === 'string') {
          try {
            return new Date(value).toLocaleString('ja-JP');
          } catch {
            return value;
          }
        }
        return String(value);
      case 'decimal':
        if (typeof value === 'number') {
          return value.toLocaleString();
        }
        return String(value);
      default:
        return String(value);
    }
  };

  // 検索処理
  const handleSearch = (term: string) => {
    setSearchTerm(term);
    onSearch(term);
  };

  // ソート処理
  const handleSort = (column: string) => {
    onSort(column);
  };

  // ソートアイコン取得
  const getSortIcon = (column: string) => {
    if (sortState.sortBy !== column) {
      return <ArrowUpDown className='h-4 w-4' />;
    }
    return sortState.sortOrder === 'asc' ? (
      <ArrowUp className='h-4 w-4' />
    ) : (
      <ArrowDown className='h-4 w-4' />
    );
  };

  // カラム表示切り替え
  const toggleColumnVisibility = (columnKey: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  if (!config) {
    return (
      <Card>
        <CardContent className='text-center py-8'>
          <p className='text-muted-foreground'>テーブルを選択してください</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='w-full'>
      <CardHeader>
        <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
          <CardTitle className='flex items-center gap-2'>
            {config.name} ({pagination.total}件)
          </CardTitle>

          <div className='flex flex-col md:flex-row gap-2'>
            {/* 検索 */}
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='検索...'
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                className='pl-10 w-full md:w-64'
              />
            </div>

            {/* カラム表示切り替え */}
            <Select>
              <SelectTrigger className='w-full md:w-auto'>
                <SelectValue placeholder='表示カラム' />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(config.columns).map(([key, columnConfig]) => (
                  <div
                    key={key}
                    className='flex items-center space-x-2 px-2 py-1 cursor-pointer hover:bg-accent'
                    onClick={() => toggleColumnVisibility(key)}
                  >
                    {visibleColumns[key] ? (
                      <Eye className='h-4 w-4' />
                    ) : (
                      <EyeOff className='h-4 w-4' />
                    )}
                    <span className='text-sm'>{columnConfig.label || key}</span>
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
          </div>
        ) : (
          <>
            {/* テーブル */}
            <div className='rounded-md border overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {displayColumns.map(column => (
                      <TableHead
                        key={column.key}
                        className='cursor-pointer hover:bg-muted/50'
                        onClick={() => handleSort(column.key)}
                      >
                        <div className='flex items-center gap-2'>
                          {column.label}
                          {getSortIcon(column.key)}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className='text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={displayColumns.length + 1}
                        className='text-center py-8 text-muted-foreground'
                      >
                        データがありません
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map(item => (
                      <TableRow key={item.id}>
                        {displayColumns.map(column => (
                          <TableCell key={column.key}>
                            {formatCellValue(item[column.key], column.type)}
                          </TableCell>
                        ))}
                        <TableCell className='text-right'>
                          <div className='flex items-center justify-end gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => onEdit(item)}
                            >
                              <Pencil className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() =>
                                onDelete(item.id, String(item.name || item.id))
                              }
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ページネーション */}
            {pagination.total_pages > 1 && (
              <div className='flex items-center justify-between mt-4'>
                <p className='text-sm text-muted-foreground'>
                  {pagination.total}件中{' '}
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}
                  件を表示
                </p>

                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onPageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </Button>

                  <span className='text-sm'>
                    {pagination.page} / {pagination.total_pages}
                  </span>

                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.total_pages}
                  >
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

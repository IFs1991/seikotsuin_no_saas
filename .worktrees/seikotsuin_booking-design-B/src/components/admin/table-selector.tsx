'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Table } from 'lucide-react';
import { TableSelectorProps } from '@/types/admin';

export const TableSelector: React.FC<TableSelectorProps> = ({
  tableList,
  selectedTable,
  onTableSelect,
  loading,
}) => {
  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Database className='h-5 w-5' />
          テーブル選択
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {tableList.map(table => (
              <Button
                key={table.table_name}
                variant={
                  selectedTable === table.table_name ? 'default' : 'outline'
                }
                className='h-auto p-4 flex flex-col items-start justify-start text-left'
                onClick={() => onTableSelect(table.table_name)}
                disabled={loading}
              >
                <div className='flex items-center gap-2 mb-2'>
                  <Table className='h-4 w-4' />
                  <span className='font-medium text-sm'>
                    {table.display_name}
                  </span>
                </div>
                <span className='text-xs text-muted-foreground'>
                  {table.columns}カラム
                </span>
              </Button>
            ))}
          </div>
        )}

        {!loading && tableList.length === 0 && (
          <div className='text-center py-8 text-muted-foreground'>
            <Database className='h-12 w-12 mx-auto mb-4 opacity-50' />
            <p>利用可能なテーブルがありません</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

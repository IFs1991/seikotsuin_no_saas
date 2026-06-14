'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import TableEditor from '@/components/admin/table-editor';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Table } from 'lucide-react';
import {
  MASTER_DATA_DEPRECATION_MESSAGE,
  MASTER_DATA_REPLACEMENT_ROUTE,
} from '@/lib/admin/master-data-deprecation';

const AdminMasterPage: React.FC = () => {
  const [currentTable, setCurrentTable] = useState<string>('');

  return (
    <div className='bg-background min-h-screen py-8'>
      <div className='container mx-auto px-4 max-w-7xl'>
        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-2xl font-semibold bg-card flex items-center'>
              <Database className='h-6 w-6 mr-2' />
              データベース管理
            </CardTitle>
            <CardDescription className='text-gray-500 bg-card'>
              テーブル管理は継続し、旧 master-data 導線のみ廃止しています。
              {currentTable && ` | 現在選択中: ${currentTable}`}
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card p-6'>
            <Tabs defaultValue='tables'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='tables' className='flex items-center'>
                  <Table className='h-4 w-4 mr-2' />
                  テーブル管理
                </TabsTrigger>
                <TabsTrigger value='settings' className='flex items-center'>
                  <Settings className='h-4 w-4 mr-2' />
                  旧システム設定
                </TabsTrigger>
              </TabsList>

              <TabsContent value='tables' className='mt-6'>
                <TableEditor onTableChange={setCurrentTable} />
              </TabsContent>

              <TabsContent value='settings' className='mt-6'>
                <div className='mx-auto max-w-md rounded-lg border border-yellow-300 bg-yellow-50 p-6 text-center'>
                  <h2 className='mb-4 text-xl font-bold text-yellow-800'>
                    この導線は廃止されました
                  </h2>
                  <p className='mb-4 text-yellow-700'>
                    {MASTER_DATA_DEPRECATION_MESSAGE}
                  </p>
                  <Link
                    href={MASTER_DATA_REPLACEMENT_ROUTE}
                    className='inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700'
                  >
                    設定管理ページへ移動
                  </Link>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminMasterPage;

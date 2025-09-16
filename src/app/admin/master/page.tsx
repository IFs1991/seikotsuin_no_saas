"use client";

import React, { useState } from 'react';
import TableEditor from '@/components/admin/table-editor';
import AdminMasterForm from '@/components/master/admin-master-form';
import { useAdminMaster } from '@/hooks/useAdminMaster';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Table } from 'lucide-react';

const AdminMasterPage: React.FC = () => {
  const {
    masterData,
    loading,
    error,
    createMasterData,
    updateMasterData,
    deleteMasterData,
  } = useAdminMaster();

  const [currentTable, setCurrentTable] = useState<string>('');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-gray-800">
        <p className="text-gray-700 dark:text-gray-300">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-gray-800">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        <Card className="w-full bg-card">
          <CardHeader className="bg-card">
            <CardTitle className="text-2xl font-semibold bg-card flex items-center">
              <Database className="h-6 w-6 mr-2" />
              データベース管理
            </CardTitle>
            <CardDescription className="text-gray-500 bg-card">
              システムのテーブルデータとマスターデータを管理します。
              {currentTable && ` | 現在選択中: ${currentTable}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-card p-6">
            <Tabs defaultValue="tables">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tables" className="flex items-center">
                  <Table className="h-4 w-4 mr-2" />
                  テーブル管理
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  システム設定
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="tables" className="mt-6">
                <TableEditor onTableChange={setCurrentTable} />
              </TabsContent>
              
              <TabsContent value="settings" className="mt-6">
                <AdminMasterForm
                  masterData={masterData}
                  onCreate={createMasterData}
                  onUpdate={updateMasterData}
                  onDelete={deleteMasterData}
                  onImport={() => {}} // TODO: インポート機能の実装
                  onExport={() => {}} // TODO: エクスポート機能の実装
                  onRollback={() => {}} // TODO: ロールバック機能の実装
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminMasterPage;
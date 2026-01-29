'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Save,
  Upload,
  Download,
  FileText,
  Database,
  Archive,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';

interface ImportSettings {
  csvEncoding: string;
  dateFormat: string;
  allowDuplicates: boolean;
  validateData: boolean;
  skipFirstRow: boolean;
}

interface ExportSettings {
  defaultFormat: 'csv' | 'excel' | 'pdf';
  includeHeaders: boolean;
  dateFormat: string;
  encoding: string;
  maxRecords: number;
}

interface MasterData {
  id: string;
  type: string;
  name: string;
  items: number;
  lastUpdated: string;
}

interface DataManagementData {
  importSettings: ImportSettings;
  exportSettings: ExportSettings;
}

const initialData: DataManagementData = {
  importSettings: {
    csvEncoding: 'UTF-8',
    dateFormat: 'YYYY-MM-DD',
    allowDuplicates: false,
    validateData: true,
    skipFirstRow: true,
  },
  exportSettings: {
    defaultFormat: 'csv',
    includeHeaders: true,
    dateFormat: 'YYYY-MM-DD',
    encoding: 'UTF-8',
    maxRecords: 10000,
  },
};

export function DataManagementSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = profile?.clinicId;

  const {
    data: formData,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(
    initialData,
    clinicId
      ? {
          clinicId,
          category: 'data_management',
          autoLoad: true,
        }
      : undefined
  );

  const [masterData] = useState<MasterData[]>([
    {
      id: '1',
      type: '傷病名',
      name: '傷病名マスター',
      items: 342,
      lastUpdated: '2024-07-15',
    },
    {
      id: '2',
      type: '保険種別',
      name: '保険種別マスター',
      items: 12,
      lastUpdated: '2024-06-20',
    },
    {
      id: '3',
      type: '地域',
      name: '地域・住所マスター',
      items: 1847,
      lastUpdated: '2024-08-01',
    },
    {
      id: '4',
      type: '施術部位',
      name: '施術部位マスター',
      items: 28,
      lastUpdated: '2024-05-10',
    },
  ]);

  const [exportLoading, setExportLoading] = useState(false);

  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  const importSettings = formData.importSettings;
  const exportSettings = formData.exportSettings;

  const updateImport = (updates: Partial<ImportSettings>) => {
    updateData({ importSettings: { ...importSettings, ...updates } });
  };

  const updateExport = (updates: Partial<ExportSettings>) => {
    updateData({ exportSettings: { ...exportSettings, ...updates } });
  };

  const onSave = async () => {
    await handleSave();
  };

  const handleExportData = async (type: string) => {
    setExportLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Note: エクスポート完了通知は別途実装が必要
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type='error' />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type='success' />
      )}

      {/* データインポート設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Upload className='w-5 h-5 mr-2' />
          データインポート設定
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              CSVエンコーディング
            </Label>
            <select
              value={importSettings.csvEncoding}
              onChange={e => updateImport({ csvEncoding: e.target.value })}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='UTF-8'>UTF-8</option>
              <option value='Shift_JIS'>Shift_JIS</option>
              <option value='EUC-JP'>EUC-JP</option>
            </select>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              日付フォーマット
            </Label>
            <select
              value={importSettings.dateFormat}
              onChange={e => updateImport({ dateFormat: e.target.value })}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='YYYY-MM-DD'>YYYY-MM-DD (2024-08-14)</option>
              <option value='MM/DD/YYYY'>MM/DD/YYYY (08/14/2024)</option>
              <option value='DD/MM/YYYY'>DD/MM/YYYY (14/08/2024)</option>
              <option value='YYYY/MM/DD'>YYYY/MM/DD (2024/08/14)</option>
            </select>
          </div>
        </div>

        <div className='mt-6 space-y-3'>
          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={importSettings.skipFirstRow}
              onChange={e => updateImport({ skipFirstRow: e.target.checked })}
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>
              1行目（ヘッダー行）をスキップする
            </span>
          </label>

          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={importSettings.validateData}
              onChange={e => updateImport({ validateData: e.target.checked })}
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>
              データ形式の検証を行う
            </span>
          </label>

          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={importSettings.allowDuplicates}
              onChange={e =>
                updateImport({ allowDuplicates: e.target.checked })
              }
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>
              重複データの取り込みを許可する
            </span>
          </label>
        </div>
      </Card>

      {/* データエクスポート設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Download className='w-5 h-5 mr-2' />
          データエクスポート設定
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              デフォルト形式
            </Label>
            <select
              value={exportSettings.defaultFormat}
              onChange={e =>
                updateExport({
                  defaultFormat: e.target.value as 'csv' | 'excel' | 'pdf',
                })
              }
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='csv'>CSV</option>
              <option value='excel'>Excel (.xlsx)</option>
              <option value='pdf'>PDF</option>
            </select>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              エンコーディング
            </Label>
            <select
              value={exportSettings.encoding}
              onChange={e => updateExport({ encoding: e.target.value })}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='UTF-8'>UTF-8</option>
              <option value='Shift_JIS'>Shift_JIS</option>
              <option value='EUC-JP'>EUC-JP</option>
            </select>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              日付フォーマット
            </Label>
            <select
              value={exportSettings.dateFormat}
              onChange={e => updateExport({ dateFormat: e.target.value })}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              <option value='YYYY-MM-DD'>YYYY-MM-DD</option>
              <option value='MM/DD/YYYY'>MM/DD/YYYY</option>
              <option value='DD/MM/YYYY'>DD/MM/YYYY</option>
              <option value='YYYY/MM/DD'>YYYY/MM/DD</option>
            </select>
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              最大レコード数
            </Label>
            <Input
              type='number'
              value={exportSettings.maxRecords}
              onChange={e =>
                updateExport({ maxRecords: parseInt(e.target.value) })
              }
              min='100'
              max='100000'
              step='1000'
            />
          </div>
        </div>

        <div className='mt-6'>
          <label className='flex items-center space-x-2'>
            <input
              type='checkbox'
              checked={exportSettings.includeHeaders}
              onChange={e => updateExport({ includeHeaders: e.target.checked })}
              className='rounded border-gray-300'
            />
            <span className='text-sm text-gray-700'>ヘッダー行を含める</span>
          </label>
        </div>
      </Card>

      {/* マスターデータ管理 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Database className='w-5 h-5 mr-2' />
          マスターデータ管理
        </h3>

        <div className='space-y-4'>
          {masterData.map(data => (
            <div key={data.id} className='p-4 bg-gray-50 rounded-lg'>
              <div className='flex items-center justify-between'>
                <div className='flex-1'>
                  <h4 className='font-medium text-gray-900'>{data.name}</h4>
                  <div className='flex items-center space-x-4 mt-1 text-sm text-gray-500'>
                    <span>種別: {data.type}</span>
                    <span>登録数: {data.items.toLocaleString()}件</span>
                    <span>最終更新: {data.lastUpdated}</span>
                  </div>
                </div>
                <div className='flex items-center space-x-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => handleExportData(data.name)}
                    disabled={exportLoading}
                    className='flex items-center space-x-1'
                  >
                    <Download className='w-4 h-4' />
                    <span>エクスポート</span>
                  </Button>

                  <Button
                    variant='outline'
                    size='sm'
                    className='flex items-center space-x-1'
                  >
                    <Upload className='w-4 h-4' />
                    <span>インポート</span>
                  </Button>

                  <Button
                    variant='outline'
                    size='sm'
                    className='text-blue-600 hover:text-blue-700'
                  >
                    <FileText className='w-4 h-4' />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* データクリーンアップ */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Trash2 className='w-5 h-5 mr-2' />
          データクリーンアップ
        </h3>

        <div className='space-y-4'>
          <div className='p-4 bg-yellow-50 border border-yellow-200 rounded-lg'>
            <div className='flex items-start space-x-3'>
              <Archive className='w-5 h-5 text-yellow-600 mt-0.5' />
              <div className='flex-1'>
                <h4 className='font-medium text-yellow-800'>
                  古いデータのアーカイブ
                </h4>
                <p className='text-sm text-yellow-700 mt-1'>
                  1年以上前のデータを自動的にアーカイブし、システムの動作速度を向上させます。
                </p>
                <Button variant='outline' size='sm' className='mt-3'>
                  今すぐアーカイブ
                </Button>
              </div>
            </div>
          </div>

          <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
            <div className='flex items-start space-x-3'>
              <Trash2 className='w-5 h-5 text-red-600 mt-0.5' />
              <div className='flex-1'>
                <h4 className='font-medium text-red-800'>不要データの削除</h4>
                <p className='text-sm text-red-700 mt-1'>
                  重複データや不完全なレコードを検出・削除します。この操作は元に戻せません。
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-3 text-red-600 border-red-300'
                >
                  クリーンアップ実行
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          onClick={onSave}
          disabled={loadingState.isLoading}
          className='flex items-center space-x-2'
        >
          {loadingState.isLoading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Save className='w-4 h-4' />
          )}
          <span>{loadingState.isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}

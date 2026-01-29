'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MasterDataDetail } from '@/types/admin';

interface AdminMasterFormProps {
  masterData: MasterDataDetail[];
  onCreate: (
    data: Partial<MasterDataDetail>
  ) => Promise<Partial<MasterDataDetail>>;
  onUpdate: (id: string, data: Partial<MasterDataDetail>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImport: (items: MasterDataDetail[]) => Promise<boolean>;
  onExport: () => Promise<{ items: MasterDataDetail[]; snapshot_key: string }>;
  onRollback: () => Promise<boolean>;
}

const AdminMasterForm: React.FC<AdminMasterFormProps> = ({
  masterData,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
  onExport,
  onRollback,
}) => {
  const [activeTab, setActiveTab] = useState('common');
  const [formData, setFormData] = useState({
    menuName: '',
    price: '',
    duration: '',
    category: '',
    description: '',
  });
  const [previewMode, setPreviewMode] = useState(false);
  const [impactedStores, setImpactedStores] = useState([]);
  const [needsApproval, setNeedsApproval] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // フォーム送信処理
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = String(reader.result ?? '');
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(items)) {
          throw new Error('インポート形式が不正です');
        }
        await onImport(items);
      } catch (error) {
        console.error('インポート失敗:', error);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRollback = async () => {
    try {
      await onRollback();
    } catch (error) {
      console.error('ロールバック失敗:', error);
    }
  };

  const handleExport = async () => {
    try {
      const result = await onExport();
      const payload = JSON.stringify(result, null, 2);
      const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `system_settings_export_${safeTimestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('エクスポート失敗:', error);
    }
  };

  return (
    <div className='p-6 bg-[#ffffff] dark:bg-[#1a1a1a] min-h-screen'>
      <Card className='w-[800px] mx-auto bg-[#f8fafc] dark:bg-[#2d2d2d]'>
        <CardHeader>
          <CardTitle className='text-[#1e3a8a] dark:text-[#60a5fa]'>
            マスタデータ管理
          </CardTitle>
          <CardDescription>
            全店舗共通の設定とカスタマイズを管理します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='mb-4'>
              <TabsTrigger value='common'>共通設定</TabsTrigger>
              <TabsTrigger value='custom'>店舗別設定</TabsTrigger>
              <TabsTrigger value='validation'>バリデーション</TabsTrigger>
            </TabsList>

            <TabsContent value='common'>
              <form onSubmit={handleSubmit}>
                <div className='space-y-4'>
                  <div>
                    <Label htmlFor='menuName'>メニュー名</Label>
                    <Input
                      id='menuName'
                      value={formData.menuName}
                      onChange={e =>
                        setFormData({ ...formData, menuName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor='price'>料金</Label>
                    <Input
                      id='price'
                      type='number'
                      value={formData.price}
                      onChange={e =>
                        setFormData({ ...formData, price: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor='duration'>所要時間（分）</Label>
                    <Input
                      id='duration'
                      type='number'
                      value={formData.duration}
                      onChange={e =>
                        setFormData({ ...formData, duration: e.target.value })
                      }
                    />
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value='custom'>
              <div className='space-y-4'>
                <Label>店舗別カスタマイズ</Label>
                <div className='border border-[#e2e8f0] dark:border-[#4a5568] rounded-lg p-4'>
                  {/* 店舗別設定フォーム */}
                </div>
              </div>
            </TabsContent>

            <TabsContent value='validation'>
              <div className='space-y-4'>
                <Label>バリデーションルール</Label>
                <div className='border border-[#e2e8f0] dark:border-[#4a5568] rounded-lg p-4'>
                  {/* バリデーションルール設定 */}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className='mt-6 space-y-4'>
            <div className='flex items-center gap-4'>
              <Button
                onClick={() => setPreviewMode(!previewMode)}
                variant='outline'
              >
                プレビュー表示
              </Button>
              <Button onClick={handleExport} variant='outline'>
                エクスポート
              </Button>
              <Button onClick={handleRollback} variant='outline'>
                ロールバック
              </Button>
              <input
                type='file'
                onChange={handleBulkUpload}
                className='hidden'
                id='bulkUpload'
              />
              <Button
                type='button'
                variant='outline'
                onClick={() => document.getElementById('bulkUpload')?.click()}
              >
                一括アップロード
              </Button>
            </div>

            {impactedStores.length > 0 && (
              <div className='bg-[#fff3cd] dark:bg-[#433619] text-[#856404] dark:text-[#ffd970] p-4 rounded-lg'>
                <h4 className='font-semibold mb-2'>変更の影響範囲</h4>
                <ul className='list-disc list-inside'>
                  {impactedStores.map((store, index) => (
                    <li key={index}>{store}</li>
                  ))}
                </ul>
              </div>
            )}

            {needsApproval && (
              <div className='bg-[#cce5ff] dark:bg-[#1e3a8a] text-[#004085] dark:text-[#93c5fd] p-4 rounded-lg'>
                承認が必要な変更です
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className='flex justify-end gap-4'>
          <Button variant='outline'>キャンセル</Button>
          <Button type='submit'>保存</Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AdminMasterForm;

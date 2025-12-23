'use client';

import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useMasterData } from '@/hooks/useMasterData';
import type { MasterDataItem } from '@/lib/api/admin/master-data-client';

function coerceValue(type: string, raw: string): unknown {
  switch (type) {
    case 'number':
      return Number(raw);
    case 'boolean':
      return raw === 'true';
    case 'json':
    case 'array':
      return JSON.parse(raw || 'null');
    default:
      return raw;
  }
}

interface MasterDataRowProps {
  item: MasterDataItem;
  onUpdate: (id: string, payload: Partial<Omit<MasterDataItem, 'id'>>) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

function MasterDataRow({
  item,
  onUpdate,
  onDelete,
  disabled,
}: MasterDataRowProps) {
  const [value, setValue] = useState(() =>
    typeof item.value === 'string' ? item.value : JSON.stringify(item.value)
  );

  const handleBlur = async () => {
    try {
      const parsed = coerceValue(item.data_type, value);
      await onUpdate(item.id, { value: parsed });
    } catch (error) {
      console.error(error);
      alert('値の更新に失敗しました。形式を確認してください。');
      setValue(
        typeof item.value === 'string' ? item.value : JSON.stringify(item.value)
      );
    }
  };

  return (
    <div className='grid grid-cols-[1fr_1fr_auto_auto] gap-4 items-center border-b py-3 text-sm'>
      <div>
        <div className='font-medium'>{item.name}</div>
        <div className='text-xs text-muted-foreground'>
          {item.description || '説明なし'}
        </div>
      </div>
      <Input
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={handleBlur}
        disabled={disabled || !item.is_editable}
      />
      <div className='flex items-center gap-2'>
        <Switch
          checked={item.is_public}
          disabled={disabled}
          onCheckedChange={async checked => {
            try {
              await onUpdate(item.id, { is_public: checked });
            } catch (error) {
              console.error(error);
              alert('公開設定の更新に失敗しました');
            }
          }}
        />
        <span className='text-xs text-muted-foreground'>公開</span>
      </div>
      <div className='flex gap-2 justify-end'>
        <Button
          variant='outline'
          size='sm'
          disabled={disabled || !item.is_editable}
          onClick={async () => {
            try {
              await onDelete(item.id);
            } catch (error) {
              console.error(error);
              alert('削除に失敗しました');
            }
          }}
        >
          削除
        </Button>
      </div>
    </div>
  );
}

export default function MasterDataPage() {
  const {
    data,
    items,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    createItem,
    updateItem,
    deleteItem,
    importData,
    exportData,
    isMutating,
  } = useMasterData();

  const categories = useMemo(() => Object.keys(data).sort(), [data]);
  const [activeTab, setActiveTab] = useState(() => categories[0] || '');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    if (!activeTab && categories.length > 0) {
      setActiveTab(categories[0]);
    } else if (
      activeTab &&
      categories.length > 0 &&
      !categories.includes(activeTab)
    ) {
      setActiveTab(categories[0]);
    }
  }, [activeTab, categories]);

  const activeItems = data[activeTab] ?? [];

  const handleCreate = async () => {
    if (!activeTab) return;
    if (!newName.trim()) {
      alert('名称を入力してください');
      return;
    }

    try {
      await createItem({
        clinic_id: null,
        name: newName,
        category: activeTab,
        value: newValue,
        data_type: 'string',
        description: newDescription || null,
        is_editable: true,
        is_public: false,
      });
    } catch (error) {
      console.error(error);
      alert('登録に失敗しました');
      return;
    }

    setNewName('');
    setNewValue('');
    setNewDescription('');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importData(file);
    event.target.value = '';
  };

  return (
    <div className='p-6 min-h-screen bg-[#f9fafb] dark:bg-[#1f2937]'>
      <div className='max-w-5xl mx-auto space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>マスターデータ管理</CardTitle>
            <CardDescription>
              システム設定値を更新・管理します。クリニック固有の設定もここで調整できます。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
              <Input
                placeholder='キーワードで検索'
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className='md:max-w-sm'
              />
              <div className='flex items-center gap-3'>
                <Label className='sr-only' htmlFor='master-data-import'>
                  インポート
                </Label>
                <Input
                  id='master-data-import'
                  type='file'
                  accept='application/json'
                  onChange={handleImport}
                  className='md:w-48'
                />
                <Button
                  variant='outline'
                  onClick={exportData}
                  disabled={items.length === 0}
                >
                  エクスポート
                </Button>
              </div>
            </div>

            {error ? (
              <div className='rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className='py-10 text-center text-sm text-muted-foreground'>
                ローディング中...
              </div>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className='mt-2'
              >
                <TabsList className='w-full justify-start overflow-x-auto'>
                  {categories.map(category => (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className='capitalize'
                    >
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {categories.map(category => (
                  <TabsContent
                    key={category}
                    value={category}
                    className='mt-4 space-y-4'
                  >
                    <div className='rounded border bg-background p-4 shadow-sm'>
                      <div className='text-sm text-muted-foreground mb-3'>
                        {category} の登録件数: {data[category]?.length ?? 0}
                      </div>
                      <div className='divide-y'>
                        {(data[category] ?? []).map(item => (
                          <MasterDataRow
                            key={item.id}
                            item={item}
                            onUpdate={updateItem}
                            onDelete={deleteItem}
                            disabled={isMutating}
                          />
                        ))}
                        {(data[category] ?? []).length === 0 ? (
                          <div className='py-6 text-center text-sm text-muted-foreground'>
                            データがありません
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {activeTab ? (
              <div className='rounded border border-dashed bg-muted/30 p-4 space-y-3'>
                <div className='text-sm font-medium'>
                  新規登録 ({activeTab})
                </div>
                <div className='grid gap-3 md:grid-cols-3'>
                  <Input
                    placeholder='名称'
                    value={newName}
                    onChange={event => setNewName(event.target.value)}
                  />
                  <Input
                    placeholder='値 (例: text または JSON)'
                    value={newValue}
                    onChange={event => setNewValue(event.target.value)}
                  />
                  <Input
                    placeholder='説明 (任意)'
                    value={newDescription}
                    onChange={event => setNewDescription(event.target.value)}
                  />
                </div>
                <Button onClick={handleCreate} disabled={isMutating}>
                  追加
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

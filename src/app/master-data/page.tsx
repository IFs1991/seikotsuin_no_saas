'use client';

import React, { useState } from 'react';
import { MasterDataForm } from '@/components/master/master-data-form';
import { useMasterData } from '@/hooks/useMasterData';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

const MasterDataPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('treatment');
  const { masterData, updateMasterData, importData, exportData, history } =
    useMasterData();

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1f2937] min-h-screen'>
      <div className='max-w-[800px] mx-auto'>
        <Card className='bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-[#111827] dark:text-[#f9fafb]'>
              マスタデータ管理
            </CardTitle>
            <CardDescription className='text-[#6b7280] dark:text-[#9ca3af]'>
              施術メニュー、支払方法、患者区分、カテゴリーの管理が可能です
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <Tabs
              defaultValue='treatment'
              onValueChange={value => setActiveTab(value)}
            >
              <TabsList className='w-full'>
                <TabsTrigger value='treatment'>施術メニュー</TabsTrigger>
                <TabsTrigger value='payment'>支払方法</TabsTrigger>
                <TabsTrigger value='patient'>患者区分</TabsTrigger>
                <TabsTrigger value='category'>カテゴリー</TabsTrigger>
              </TabsList>

              <TabsContent value='treatment'>
                <MasterDataForm
                  type='treatment'
                  data={masterData.treatment}
                  onUpdate={updateMasterData}
                />
              </TabsContent>

              <TabsContent value='payment'>
                <MasterDataForm
                  type='payment'
                  data={masterData.payment}
                  onUpdate={updateMasterData}
                />
              </TabsContent>

              <TabsContent value='patient'>
                <MasterDataForm
                  type='patient'
                  data={masterData.patient}
                  onUpdate={updateMasterData}
                />
              </TabsContent>

              <TabsContent value='category'>
                <MasterDataForm
                  type='category'
                  data={masterData.category}
                  onUpdate={updateMasterData}
                />
              </TabsContent>
            </Tabs>

            <div className='mt-6 flex gap-4'>
              <Button
                onClick={() => importData()}
                className='bg-[#1e3a8a] text-white hover:bg-[#1e40af]'
              >
                データインポート
              </Button>
              <Button
                onClick={() => exportData()}
                className='bg-[#10b981] text-white hover:bg-[#059669]'
              >
                データエクスポート
              </Button>
            </div>

            <Separator className='my-6' />

            <div>
              <h3 className='text-lg font-semibold mb-4 text-[#111827] dark:text-[#f9fafb]'>
                変更履歴
              </h3>
              <div className='space-y-2'>
                {history.map((item, index) => (
                  <div
                    key={index}
                    className='p-3 rounded-lg bg-[#f3f4f6] dark:bg-[#374151] text-[#111827] dark:text-[#f9fafb]'
                  >
                    <p className='text-sm'>{item.description}</p>
                    <p className='text-xs text-[#6b7280] dark:text-[#9ca3af] mt-1'>
                      {item.timestamp}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MasterDataPage;

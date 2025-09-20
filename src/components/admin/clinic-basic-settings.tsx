'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { AdminMessage } from './AdminMessage';
import { AdminSaveButton } from './AdminSaveButton';
import { AdminCard } from './AdminCard';

interface ClinicBasicData {
  clinicName: string;
  zipCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  description: string;
  logo: File | null;
}

interface ClinicBasicSettingsProps {
  onSave?: (data: ClinicBasicData) => void;
}

const initialData: ClinicBasicData = {
  clinicName: '整骨院グループ本店',
  zipCode: '150-0001',
  address: '東京都渋谷区神宮前1-1-1',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@seikotsuin.com',
  website: 'https://www.seikotsuin.com',
  description:
    '地域密着型の整骨院として、患者様一人ひとりに寄り添った治療を心がけています。',
  logo: null,
};

export function ClinicBasicSettings({ onSave }: ClinicBasicSettingsProps) {
  const {
    data: formData,
    updateData,
    loadingState,
    handleSave,
  } = useAdminSettings(initialData);

  const handleInputChange = (field: keyof ClinicBasicData, value: string) => {
    updateData({ [field]: value });
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      updateData({ logo: file });
    }
  };

  const handleSaveClick = () => {
    handleSave(async data => {
      if (onSave) {
        onSave(data);
      }
      return { success: true, message: '設定を保存しました' };
    });
  };

  return (
    <div className='space-y-6'>
      <AdminMessage
        message={loadingState.savedMessage}
        type={loadingState.error ? 'error' : 'success'}
      />

      <AdminCard title='基本情報'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label
              htmlFor='clinicName'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              院名 <span className='text-red-500'>*</span>
            </Label>
            <Input
              id='clinicName'
              type='text'
              value={formData.clinicName}
              onChange={e => handleInputChange('clinicName', e.target.value)}
              placeholder='整骨院名を入力'
              required
            />
          </div>

          <div>
            <Label
              htmlFor='phone'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              電話番号 <span className='text-red-500'>*</span>
            </Label>
            <Input
              id='phone'
              type='tel'
              value={formData.phone}
              onChange={e => handleInputChange('phone', e.target.value)}
              placeholder='03-1234-5678'
              required
            />
          </div>

          <div>
            <Label
              htmlFor='zipCode'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              郵便番号
            </Label>
            <Input
              id='zipCode'
              type='text'
              value={formData.zipCode}
              onChange={e => handleInputChange('zipCode', e.target.value)}
              placeholder='150-0001'
            />
          </div>

          <div>
            <Label
              htmlFor='fax'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              FAX番号
            </Label>
            <Input
              id='fax'
              type='tel'
              value={formData.fax}
              onChange={e => handleInputChange('fax', e.target.value)}
              placeholder='03-1234-5679'
            />
          </div>
        </div>

        <div className='mt-6'>
          <Label
            htmlFor='address'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            住所 <span className='text-red-500'>*</span>
          </Label>
          <Input
            id='address'
            type='text'
            value={formData.address}
            onChange={e => handleInputChange('address', e.target.value)}
            placeholder='東京都渋谷区神宮前1-1-1'
            required
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mt-6'>
          <div>
            <Label
              htmlFor='email'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              メールアドレス
            </Label>
            <Input
              id='email'
              type='email'
              value={formData.email}
              onChange={e => handleInputChange('email', e.target.value)}
              placeholder='info@seikotsuin.com'
            />
          </div>

          <div>
            <Label
              htmlFor='website'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              ウェブサイト
            </Label>
            <Input
              id='website'
              type='url'
              value={formData.website}
              onChange={e => handleInputChange('website', e.target.value)}
              placeholder='https://www.seikotsuin.com'
            />
          </div>
        </div>
      </AdminCard>

      <AdminCard title='ロゴ画像'>
        <div className='flex items-center space-x-4'>
          <div className='w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300'>
            {formData.logo ? (
              <img
                src={URL.createObjectURL(formData.logo)}
                alt='ロゴプレビュー'
                className='w-full h-full object-contain rounded-lg'
              />
            ) : (
              <Upload className='w-8 h-8 text-gray-400' />
            )}
          </div>

          <div className='flex-1'>
            <input
              type='file'
              id='logo'
              accept='image/*'
              onChange={handleLogoUpload}
              className='hidden'
            />
            <Label htmlFor='logo'>
              <Button variant='outline' className='cursor-pointer'>
                <Upload className='w-4 h-4 mr-2' />
                ロゴを選択
              </Button>
            </Label>

            {formData.logo && (
              <Button
                variant='outline'
                onClick={() => updateData({ logo: null })}
                className='ml-2'
              >
                <X className='w-4 h-4 mr-2' />
                削除
              </Button>
            )}

            <p className='text-sm text-gray-500 mt-2'>
              推奨サイズ: 200x200px、PNG/JPG形式、最大2MB
            </p>
          </div>
        </div>
      </AdminCard>

      <AdminCard title='院の紹介'>
        <div>
          <Label
            htmlFor='description'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            紹介文
          </Label>
          <textarea
            id='description'
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            rows={4}
            className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            placeholder='院の特色やアピールポイントを入力してください'
          />
          <p className='text-sm text-gray-500 mt-1'>
            患者向けサイトやアプリで表示される紹介文です（最大500文字）
          </p>
        </div>
      </AdminCard>

      <AdminSaveButton
        onSave={handleSaveClick}
        isLoading={loadingState.isLoading}
      />
    </div>
  );
}

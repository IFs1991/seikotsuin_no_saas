'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';
import { AdminSaveButton } from './AdminSaveButton';
import { AdminCard } from './AdminCard';

interface ClinicBasicData {
  name: string;
  zipCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  description: string;
  logoUrl: string | null;
  logo?: File | null; // ローカル用
}

interface ClinicBasicSettingsProps {
  onSave?: (data: ClinicBasicData) => void;
}

const initialData: ClinicBasicData = {
  name: '',
  zipCode: '',
  address: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  description: '',
  logoUrl: null,
  logo: null,
};

export function ClinicBasicSettings({ onSave }: ClinicBasicSettingsProps) {
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
          category: 'clinic_basic',
          autoLoad: true,
        }
      : undefined
  );

  // プロファイルとデータのローディング中
  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  const handleInputChange = (field: keyof ClinicBasicData, value: string) => {
    updateData({ [field]: value });
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      updateData({ logo: file });
    }
  };

  const handleSaveClick = async () => {
    // clinicIdがない場合はカスタムsave関数を使用（互換性維持）
    if (!clinicId) {
      await handleSave(async data => {
        if (onSave) {
          onSave(data);
        }
        return { success: true, message: '設定を保存しました' };
      });
    } else {
      // clinicIdがある場合はAPI経由で保存
      const result = await handleSave();
      if (result.success && onSave) {
        onSave(formData);
      }
    }
  };

  return (
    <div className='space-y-6'>
      <AdminMessage message={loadingState.error ?? ''} type='error' />
      <AdminMessage message={loadingState.savedMessage} type='success' />

      <AdminCard title='基本情報'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label
              htmlFor='name'
              variant='required'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              院名
            </Label>
            <Input
              id='name'
              type='text'
              value={formData.name}
              onChange={e => handleInputChange('name', e.target.value)}
              placeholder='整骨院名を入力'
              required
            />
          </div>

          <div>
            <Label
              htmlFor='phone'
              variant='required'
              className='block text-sm font-medium text-gray-700 mb-1'
            >
              電話番号
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
            variant='required'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            住所
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
              /* eslint-disable-next-line @next/next/no-img-element */
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

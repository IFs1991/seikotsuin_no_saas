'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

function MenuSettingsLoading() {
  return (
    <div className='flex items-center justify-center py-12 text-gray-600'>
      <Loader2 className='mr-2 h-6 w-6 animate-spin text-blue-500' />
      <span>メニュー設定を読み込み中...</span>
    </div>
  );
}

const ServicesPricingSettings = dynamic(
  () =>
    import('@/components/admin/services-pricing-settings').then(
      module => module.ServicesPricingSettings
    ),
  {
    loading: MenuSettingsLoading,
  }
);

export default function MenuSettingsPage() {
  return (
    <div className='mx-auto max-w-6xl p-4 sm:p-6'>
      <ServicesPricingSettings />
    </div>
  );
}

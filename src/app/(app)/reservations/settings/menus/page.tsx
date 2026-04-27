'use client';

import { ServicesPricingSettings } from '@/components/admin/services-pricing-settings';

export default function MenuSettingsPage() {
  return (
    <div className='mx-auto max-w-6xl p-4 sm:p-6'>
      <ServicesPricingSettings />
    </div>
  );
}

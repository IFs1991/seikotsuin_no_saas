'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Save,
  FileText,
  CreditCard,
  Settings,
  Loader2,
} from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';

interface InsuranceType {
  id: string;
  name: string;
  code: string;
  isEnabled: boolean;
  coPaymentRate: number;
  maxAmount?: number;
}

interface BillingConfig {
  receiptPrefix: string;
  receiptStartNumber: number;
  taxRate: number;
  paymentMethods: string[];
  autoReceiptGeneration: boolean;
  reminderDays: number;
}

interface ClinicReceiptInfo {
  receiptClinicName: string;
  receiptAddress: string;
  receiptPhone: string;
  medicallicense: string;
  directorName: string;
  licenseNumber: string;
}

interface InsuranceBillingData {
  insuranceTypes: InsuranceType[];
  billingConfig: BillingConfig;
  clinicInfo: ClinicReceiptInfo;
}

const initialData: InsuranceBillingData = {
  insuranceTypes: [
    { id: '1', name: '社会保険', code: 'SHAKAI', isEnabled: true, coPaymentRate: 30, maxAmount: undefined },
    { id: '2', name: '国民健康保険', code: 'KOKUHO', isEnabled: true, coPaymentRate: 30, maxAmount: undefined },
    { id: '3', name: '労災保険', code: 'ROUSAI', isEnabled: true, coPaymentRate: 0, maxAmount: undefined },
    { id: '4', name: '交通事故（自賠責）', code: 'JIBAI', isEnabled: true, coPaymentRate: 0, maxAmount: 120000 },
    { id: '5', name: '後期高齢者医療', code: 'KOUKI', isEnabled: true, coPaymentRate: 10, maxAmount: undefined },
  ],
  billingConfig: {
    receiptPrefix: 'RC',
    receiptStartNumber: 1000,
    taxRate: 10,
    paymentMethods: ['cash', 'card', 'transfer', 'qr'],
    autoReceiptGeneration: true,
    reminderDays: 7,
  },
  clinicInfo: {
    receiptClinicName: '整骨院グループ本店',
    receiptAddress: '東京都渋谷区神宮前1-1-1',
    receiptPhone: '03-1234-5678',
    medicallicense: '東京都知事許可第12345号',
    directorName: '田中 太郎',
    licenseNumber: '柔道整復師免許 第67890号',
  },
};

export function InsuranceBillingSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = profile?.clinicId;

  const {
    data: formData,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(initialData, clinicId ? {
    clinicId,
    category: 'insurance_billing',
    autoLoad: true,
  } : undefined);

  const paymentMethodNames: Record<string, string> = {
    cash: '現金',
    card: 'クレジットカード',
    transfer: '銀行振込',
    qr: 'QRコード決済',
  };

  if (profileLoading || !isInitialized) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">設定を読み込み中...</span>
      </div>
    );
  }

  const insuranceTypes = formData.insuranceTypes;
  const billingConfig = formData.billingConfig;
  const clinicInfo = formData.clinicInfo;

  const onSave = async () => {
    await handleSave();
  };

  const toggleInsuranceType = (id: string) => {
    updateData({
      insuranceTypes: insuranceTypes.map(insurance =>
        insurance.id === id
          ? { ...insurance, isEnabled: !insurance.isEnabled }
          : insurance
      ),
    });
  };

  const updateInsuranceType = (
    id: string,
    field: keyof InsuranceType,
    value: any
  ) => {
    updateData({
      insuranceTypes: insuranceTypes.map(insurance =>
        insurance.id === id ? { ...insurance, [field]: value } : insurance
      ),
    });
  };

  const updateBilling = (updates: Partial<BillingConfig>) => {
    updateData({ billingConfig: { ...billingConfig, ...updates } });
  };

  const updateClinicInfo = (updates: Partial<ClinicReceiptInfo>) => {
    updateData({ clinicInfo: { ...clinicInfo, ...updates } });
  };

  const togglePaymentMethod = (method: string) => {
    updateData({
      billingConfig: {
        ...billingConfig,
        paymentMethods: billingConfig.paymentMethods.includes(method)
          ? billingConfig.paymentMethods.filter(m => m !== method)
          : [...billingConfig.paymentMethods, method],
      },
    });
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type="error" />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type="success" />
      )}

      {/* 取扱保険種別 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          取扱保険種別
        </h3>

        <div className='space-y-4'>
          {insuranceTypes.map(insurance => (
            <div key={insurance.id} className='p-4 bg-gray-50 rounded-lg'>
              <div className='flex items-start justify-between mb-3'>
                <div className='flex items-center space-x-3'>
                  <input
                    type='checkbox'
                    checked={insurance.isEnabled}
                    onChange={() => toggleInsuranceType(insurance.id)}
                    className='rounded border-gray-300'
                  />
                  <div>
                    <h4 className='font-medium text-gray-900'>
                      {insurance.name}
                    </h4>
                    <p className='text-sm text-gray-500'>
                      保険コード: {insurance.code}
                    </p>
                  </div>
                </div>

                {insurance.isEnabled && (
                  <div className='flex items-center space-x-4'>
                    <div>
                      <Label className='block text-sm text-gray-700 mb-1'>
                        自己負担率（%）
                      </Label>
                      <Input
                        type='number'
                        value={insurance.coPaymentRate}
                        onChange={e =>
                          updateInsuranceType(
                            insurance.id,
                            'coPaymentRate',
                            parseInt(e.target.value)
                          )
                        }
                        className='w-20'
                        min='0'
                        max='100'
                      />
                    </div>
                    {insurance.maxAmount !== undefined && (
                      <div>
                        <Label className='block text-sm text-gray-700 mb-1'>
                          上限額（円）
                        </Label>
                        <Input
                          type='number'
                          value={insurance.maxAmount}
                          onChange={e =>
                            updateInsuranceType(
                              insurance.id,
                              'maxAmount',
                              parseInt(e.target.value)
                            )
                          }
                          className='w-32'
                          min='0'
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* レセプト設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          レセプト・領収書設定
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              院名（レセプト用）
            </Label>
            <Input
              value={clinicInfo.receiptClinicName}
              onChange={e =>
                updateClinicInfo({ receiptClinicName: e.target.value })
              }
            />
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              管理者名
            </Label>
            <Input
              value={clinicInfo.directorName}
              onChange={e =>
                updateClinicInfo({ directorName: e.target.value })
              }
            />
          </div>

          <div className='md:col-span-2'>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              住所（レセプト用）
            </Label>
            <Input
              value={clinicInfo.receiptAddress}
              onChange={e =>
                updateClinicInfo({ receiptAddress: e.target.value })
              }
            />
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              電話番号
            </Label>
            <Input
              value={clinicInfo.receiptPhone}
              onChange={e =>
                updateClinicInfo({ receiptPhone: e.target.value })
              }
            />
          </div>

          <div>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              開設許可番号
            </Label>
            <Input
              value={clinicInfo.medicallicense}
              onChange={e =>
                updateClinicInfo({ medicallicense: e.target.value })
              }
            />
          </div>

          <div className='md:col-span-2'>
            <Label className='block text-sm font-medium text-gray-700 mb-1'>
              柔道整復師免許番号
            </Label>
            <Input
              value={clinicInfo.licenseNumber}
              onChange={e =>
                updateClinicInfo({ licenseNumber: e.target.value })
              }
            />
          </div>
        </div>
      </Card>

      {/* 請求・支払設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          請求・支払設定
        </h3>

        <div className='space-y-6'>
          {/* 領収書設定 */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3 flex items-center'>
              <FileText className='w-5 h-5 mr-2' />
              領収書設定
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  領収書番号プレフィックス
                </Label>
                <Input
                  value={billingConfig.receiptPrefix}
                  onChange={e =>
                    updateBilling({ receiptPrefix: e.target.value })
                  }
                  placeholder='RC'
                />
              </div>
              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  開始番号
                </Label>
                <Input
                  type='number'
                  value={billingConfig.receiptStartNumber}
                  onChange={e =>
                    updateBilling({ receiptStartNumber: parseInt(e.target.value) })
                  }
                  min='1'
                />
              </div>
              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  消費税率（%）
                </Label>
                <Input
                  type='number'
                  value={billingConfig.taxRate}
                  onChange={e =>
                    updateBilling({ taxRate: parseFloat(e.target.value) })
                  }
                  min='0'
                  max='100'
                  step='0.1'
                />
              </div>
            </div>
          </div>

          {/* 支払方法 */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3 flex items-center'>
              <CreditCard className='w-5 h-5 mr-2' />
              利用可能な支払方法
            </h4>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
              {Object.entries(paymentMethodNames).map(([key, name]) => (
                <label key={key} className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={billingConfig.paymentMethods.includes(key)}
                    onChange={() => togglePaymentMethod(key)}
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>{name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 自動処理設定 */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3 flex items-center'>
              <Settings className='w-5 h-5 mr-2' />
              自動処理設定
            </h4>
            <div className='space-y-4'>
              <label className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  checked={billingConfig.autoReceiptGeneration}
                  onChange={e =>
                    updateBilling({ autoReceiptGeneration: e.target.checked })
                  }
                  className='rounded border-gray-300'
                />
                <span className='text-sm text-gray-700'>
                  レセプト自動生成を有効にする
                </span>
              </label>

              <div className='flex items-center space-x-4'>
                <Label className='text-sm text-gray-700'>
                  支払いリマインダー（日前）
                </Label>
                <Input
                  type='number'
                  value={billingConfig.reminderDays}
                  onChange={e =>
                    updateBilling({ reminderDays: parseInt(e.target.value) })
                  }
                  className='w-20'
                  min='1'
                  max='30'
                />
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

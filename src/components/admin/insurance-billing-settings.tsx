'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Save,
  Plus,
  Edit,
  FileText,
  CreditCard,
  Building2,
  Settings,
} from 'lucide-react';

interface InsuranceType {
  id: string;
  name: string;
  code: string;
  isEnabled: boolean;
  coPaymentRate: number; // 自己負担割合
  maxAmount?: number; // 上限額
}

interface BillingConfig {
  receiptPrefix: string;
  receiptStartNumber: number;
  taxRate: number;
  paymentMethods: string[];
  autoReceiptGeneration: boolean;
  reminderDays: number;
}

export function InsuranceBillingSettings() {
  const [insuranceTypes, setInsuranceTypes] = useState<InsuranceType[]>([
    {
      id: '1',
      name: '社会保険',
      code: 'SHAKAI',
      isEnabled: true,
      coPaymentRate: 30,
      maxAmount: undefined,
    },
    {
      id: '2',
      name: '国民健康保険',
      code: 'KOKUHO',
      isEnabled: true,
      coPaymentRate: 30,
      maxAmount: undefined,
    },
    {
      id: '3',
      name: '労災保険',
      code: 'ROUSAI',
      isEnabled: true,
      coPaymentRate: 0,
      maxAmount: undefined,
    },
    {
      id: '4',
      name: '交通事故（自賠責）',
      code: 'JIBAI',
      isEnabled: true,
      coPaymentRate: 0,
      maxAmount: 120000,
    },
    {
      id: '5',
      name: '後期高齢者医療',
      code: 'KOUKI',
      isEnabled: true,
      coPaymentRate: 10,
      maxAmount: undefined,
    },
  ]);

  const [billingConfig, setBillingConfig] = useState<BillingConfig>({
    receiptPrefix: 'RC',
    receiptStartNumber: 1000,
    taxRate: 10,
    paymentMethods: ['cash', 'card', 'transfer', 'qr'],
    autoReceiptGeneration: true,
    reminderDays: 7,
  });

  const [clinicInfo, setClinicInfo] = useState({
    receiptClinicName: '整骨院グループ本店',
    receiptAddress: '東京都渋谷区神宮前1-1-1',
    receiptPhone: '03-1234-5678',
    medicallicense: '東京都知事許可第12345号',
    directorName: '田中 太郎',
    licenseNumber: '柔道整復師免許 第67890号',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const paymentMethodNames = {
    cash: '現金',
    card: 'クレジットカード',
    transfer: '銀行振込',
    qr: 'QRコード決済',
  };

  const toggleInsuranceType = (id: string) => {
    setInsuranceTypes(prev =>
      prev.map(insurance =>
        insurance.id === id
          ? { ...insurance, isEnabled: !insurance.isEnabled }
          : insurance
      )
    );
  };

  const updateInsuranceType = (
    id: string,
    field: keyof InsuranceType,
    value: any
  ) => {
    setInsuranceTypes(prev =>
      prev.map(insurance =>
        insurance.id === id ? { ...insurance, [field]: value } : insurance
      )
    );
  };

  const togglePaymentMethod = (method: string) => {
    setBillingConfig(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter(m => m !== method)
        : [...prev.paymentMethods, method],
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('保険・請求設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {savedMessage && (
        <div
          className={`p-4 rounded-md ${
            savedMessage.includes('失敗')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {savedMessage}
        </div>
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
                setClinicInfo(prev => ({
                  ...prev,
                  receiptClinicName: e.target.value,
                }))
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
                setClinicInfo(prev => ({
                  ...prev,
                  directorName: e.target.value,
                }))
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
                setClinicInfo(prev => ({
                  ...prev,
                  receiptAddress: e.target.value,
                }))
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
                setClinicInfo(prev => ({
                  ...prev,
                  receiptPhone: e.target.value,
                }))
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
                setClinicInfo(prev => ({
                  ...prev,
                  medicallicense: e.target.value,
                }))
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
                setClinicInfo(prev => ({
                  ...prev,
                  licenseNumber: e.target.value,
                }))
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
                    setBillingConfig(prev => ({
                      ...prev,
                      receiptPrefix: e.target.value,
                    }))
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
                    setBillingConfig(prev => ({
                      ...prev,
                      receiptStartNumber: parseInt(e.target.value),
                    }))
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
                    setBillingConfig(prev => ({
                      ...prev,
                      taxRate: parseFloat(e.target.value),
                    }))
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
                    setBillingConfig(prev => ({
                      ...prev,
                      autoReceiptGeneration: e.target.checked,
                    }))
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
                    setBillingConfig(prev => ({
                      ...prev,
                      reminderDays: parseInt(e.target.value),
                    }))
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
          onClick={handleSave}
          disabled={isLoading}
          className='flex items-center space-x-2'
        >
          <Save className='w-4 h-4' />
          <span>{isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}

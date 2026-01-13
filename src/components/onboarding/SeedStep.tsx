'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { SeedFormData, SeedResponse, TreatmentMenu } from '@/types/onboarding';

// デフォルトの初期データ
const DEFAULT_PAYMENT_METHODS = ['現金', 'クレジットカード', '電子マネー'];
const DEFAULT_PATIENT_TYPES = ['初診', '再診', '自費'];
const DEFAULT_TREATMENT_MENUS: TreatmentMenu[] = [
  { name: '保険施術', price: 0, description: '各種保険適用' },
  { name: '肩こり改善', price: 3000, description: '' },
  { name: '腰痛治療', price: 3500, description: '' },
];

interface SeedStepProps {
  onSubmit: (data: SeedFormData) => Promise<SeedResponse>;
}

export function SeedStep({ onSubmit }: SeedStepProps) {
  const [treatmentMenus, setTreatmentMenus] = useState<TreatmentMenu[]>(DEFAULT_TREATMENT_MENUS);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [patientTypes, setPatientTypes] = useState<string[]>(DEFAULT_PATIENT_TYPES);

  const [newMenu, setNewMenu] = useState<TreatmentMenu>({ name: '', price: 0, description: '' });
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [newPatientType, setNewPatientType] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // 施術メニュー管理
  const handleAddMenu = () => {
    if (!newMenu.name.trim()) return;
    setTreatmentMenus([...treatmentMenus, newMenu]);
    setNewMenu({ name: '', price: 0, description: '' });
  };

  const handleRemoveMenu = (index: number) => {
    setTreatmentMenus(treatmentMenus.filter((_, i) => i !== index));
  };

  // 支払方法管理
  const handleAddPaymentMethod = () => {
    if (!newPaymentMethod.trim()) return;
    if (!paymentMethods.includes(newPaymentMethod)) {
      setPaymentMethods([...paymentMethods, newPaymentMethod]);
    }
    setNewPaymentMethod('');
  };

  const handleRemovePaymentMethod = (method: string) => {
    setPaymentMethods(paymentMethods.filter((m) => m !== method));
  };

  // 患者タイプ管理
  const handleAddPatientType = () => {
    if (!newPatientType.trim()) return;
    if (!patientTypes.includes(newPatientType)) {
      setPatientTypes([...patientTypes, newPatientType]);
    }
    setNewPatientType('');
  };

  const handleRemovePatientType = (type: string) => {
    setPatientTypes(patientTypes.filter((t) => t !== type));
  };

  const handleSubmit = async () => {
    setApiError(null);

    if (treatmentMenus.length === 0) {
      setApiError('少なくとも1つの施術メニューを登録してください');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        treatment_menus: treatmentMenus,
        payment_methods: paymentMethods,
        patient_types: patientTypes,
      });
      if (!result.success) {
        setApiError(result.error || 'エラーが発生しました');
      }
    } catch {
      setApiError('予期しないエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>初期設定</CardTitle>
        <CardDescription>
          基本的なマスタデータを設定しましょう。後から変更できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {/* 施術メニュー */}
          <section>
            <h3 className="text-lg font-medium mb-4">施術メニュー</h3>
            <div className="space-y-4">
              {treatmentMenus.map((menu, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <span className="flex-1">{menu.name}</span>
                  <span className="text-gray-600">{menu.price.toLocaleString()}円</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMenu(index)}
                    disabled={isSubmitting}
                  >
                    削除
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="メニュー名"
                  value={newMenu.name}
                  onChange={(e) => setNewMenu({ ...newMenu, name: e.target.value })}
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Input
                  type="number"
                  placeholder="価格"
                  value={newMenu.price || ''}
                  onChange={(e) => setNewMenu({ ...newMenu, price: parseInt(e.target.value) || 0 })}
                  disabled={isSubmitting}
                  className="w-32"
                />
                <Button type="button" variant="outline" onClick={handleAddMenu} disabled={isSubmitting}>
                  追加
                </Button>
              </div>
            </div>
          </section>

          {/* 支払方法 */}
          <section>
            <h3 className="text-lg font-medium mb-4">支払方法</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <span
                    key={method}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {method}
                    <button
                      type="button"
                      onClick={() => handleRemovePaymentMethod(method)}
                      disabled={isSubmitting}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="新しい支払方法"
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleAddPaymentMethod} disabled={isSubmitting}>
                  追加
                </Button>
              </div>
            </div>
          </section>

          {/* 患者タイプ */}
          <section>
            <h3 className="text-lg font-medium mb-4">患者タイプ</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {patientTypes.map((type) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {type}
                    <button
                      type="button"
                      onClick={() => handleRemovePatientType(type)}
                      disabled={isSubmitting}
                      className="ml-1 text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="新しい患者タイプ"
                  value={newPatientType}
                  onChange={(e) => setNewPatientType(e.target.value)}
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleAddPatientType} disabled={isSubmitting}>
                  追加
                </Button>
              </div>
            </div>
          </section>

          {apiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{apiError}</p>
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '設定中...' : '設定を完了する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

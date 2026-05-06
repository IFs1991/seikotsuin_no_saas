'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { useUserProfileContext } from '@/providers/user-profile-context';

type BillingType = 'insurance' | 'private';

interface DailyReportItem {
  id: string;
  clinicId: string;
  dailyReportId: string;
  reportDate: string;
  reservationId: string | null;
  customerId: string | null;
  menuId: string | null;
  staffResourceId: string | null;
  patientName: string;
  treatmentName: string;
  durationMinutes: number;
  fee: number;
  billingType: BillingType;
  paymentMethodId: string | null;
  nextReservationStartTime: string | null;
  nextReservationEndTime: string | null;
  nextReservationId: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  isActive: boolean;
}

interface NewItemForm {
  patientName: string;
  treatmentName: string;
  durationMinutes: number;
  fee: number;
  billingType: BillingType;
  paymentMethodId: string;
}

type ItemPatchPayload = {
  patientName?: string;
  treatmentName?: string;
  durationMinutes?: number;
  fee?: number;
  billingType?: BillingType;
  paymentMethodId?: string | null;
  nextReservationStartTime?: string | null;
  notes?: string | null;
};

const emptyNewItem: NewItemForm = {
  patientName: '',
  treatmentName: '',
  durationMinutes: 0,
  fee: 0,
  billingType: 'insurance',
  paymentMethodId: '',
};

const managerRoles = new Set(['admin', 'clinic_admin', 'manager']);

function getTodayDateInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBillingType(value: unknown): value is BillingType {
  return value === 'insurance' || value === 'private';
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isActive === 'boolean'
  );
}

function isDailyReportItem(value: unknown): value is DailyReportItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clinicId === 'string' &&
    typeof value.dailyReportId === 'string' &&
    typeof value.reportDate === 'string' &&
    typeof value.patientName === 'string' &&
    typeof value.treatmentName === 'string' &&
    typeof value.durationMinutes === 'number' &&
    typeof value.fee === 'number' &&
    isBillingType(value.billingType)
  );
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback;
  }

  const error = payload.error;
  if (typeof error === 'string') {
    return error;
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromDatetimeLocal(value: string) {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function buildNextReservationDrafts(items: DailyReportItem[]) {
  return items.reduce<Record<string, string>>((drafts, item) => {
    drafts[item.id] = toDatetimeLocalValue(item.nextReservationStartTime);
    return drafts;
  }, {});
}

function canUseNextReservation(item: DailyReportItem) {
  return Boolean(item.customerId && item.menuId && item.staffResourceId);
}

export default function DailyReportInputPage() {
  const router = useRouter();
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;
  const canDeleteItems = managerRoles.has(profile?.role ?? '');

  const [date, setDate] = useState(getTodayDateInputValue());
  const [staffName, setStaffName] = useState('');
  const [items, setItems] = useState<DailyReportItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [newItem, setNewItem] = useState<NewItemForm>(emptyNewItem);
  const [nextReservationDrafts, setNextReservationDrafts] = useState<
    Record<string, string>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const hasClinic = Boolean(clinicId);
  const isLoading = profileLoading || isLoadingItems;
  const errorMessage = profileError;

  const loadItems = useCallback(async () => {
    if (!clinicId) {
      setItems([]);
      setPaymentMethods([]);
      setNextReservationDrafts({});
      return;
    }

    setIsLoadingItems(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        clinic_id: clinicId,
        report_date: date,
      });
      const response = await fetch(`/api/daily-reports/items?${params}`);
      const payload = await readJson(response);

      if (!response.ok) {
        setLoadError(
          getApiErrorMessage(payload, '日報明細の取得に失敗しました')
        );
        return;
      }

      if (!isRecord(payload) || payload.success !== true) {
        setLoadError('日報明細の取得に失敗しました');
        return;
      }

      const data = payload.data;
      if (!isRecord(data)) {
        setLoadError('日報明細の取得に失敗しました');
        return;
      }

      const nextItems = Array.isArray(data.items)
        ? data.items.filter(isDailyReportItem)
        : [];
      const nextPaymentMethods = Array.isArray(data.paymentMethods)
        ? data.paymentMethods.filter(isPaymentMethod)
        : [];

      setItems(nextItems);
      setPaymentMethods(nextPaymentMethods);
      setNextReservationDrafts(buildNextReservationDrafts(nextItems));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : '日報明細の取得に失敗しました'
      );
    } finally {
      setIsLoadingItems(false);
    }
  }, [clinicId, date]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const updateItemLocal = (id: string, partial: Partial<DailyReportItem>) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...partial } : item))
    );
  };

  const persistItemPatch = async (id: string, patch: ItemPatchPayload) => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    setSavingItemId(id);
    setFormError(null);

    try {
      const response = await fetch('/api/daily-reports/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          id,
          ...patch,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '明細の保存に失敗しました'));
        await loadItems();
        return;
      }

      if (
        isRecord(payload) &&
        payload.success === true &&
        isDailyReportItem(payload.data)
      ) {
        const savedItem = payload.data;
        updateItemLocal(id, savedItem);
        setNextReservationDrafts(prev => ({
          ...prev,
          [id]: toDatetimeLocalValue(savedItem.nextReservationStartTime),
        }));
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '明細の保存に失敗しました'
      );
      await loadItems();
    } finally {
      setSavingItemId(null);
    }
  };

  const addItem = async () => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    if (!newItem.patientName.trim() || !newItem.treatmentName.trim()) {
      setFormError('患者名と施術内容を入力してください');
      return;
    }

    setIsAddingItem(true);
    setFormError(null);

    try {
      const response = await fetch('/api/daily-reports/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          report_date: date,
          patientName: newItem.patientName,
          treatmentName: newItem.treatmentName,
          durationMinutes: newItem.durationMinutes,
          fee: newItem.fee,
          billingType: newItem.billingType,
          paymentMethodId: newItem.paymentMethodId || null,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '明細の追加に失敗しました'));
        return;
      }

      if (
        isRecord(payload) &&
        payload.success === true &&
        isDailyReportItem(payload.data)
      ) {
        const createdItem = payload.data;
        setItems(prev => [...prev, createdItem]);
        setNextReservationDrafts(prev => ({
          ...prev,
          [createdItem.id]: '',
        }));
        setNewItem(emptyNewItem);
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '明細の追加に失敗しました'
      );
    } finally {
      setIsAddingItem(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    setDeletingItemId(id);
    setFormError(null);

    try {
      const params = new URLSearchParams({
        clinic_id: clinicId,
        id,
      });
      const response = await fetch(`/api/daily-reports/items?${params}`, {
        method: 'DELETE',
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '明細の削除に失敗しました'));
        return;
      }

      setItems(prev => prev.filter(item => item.id !== id));
      setNextReservationDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '明細の削除に失敗しました'
      );
    } finally {
      setDeletingItemId(null);
    }
  };

  const persistNextReservation = async (item: DailyReportItem) => {
    const draft = nextReservationDrafts[item.id] ?? '';
    const isoValue = toIsoFromDatetimeLocal(draft);

    if (isoValue === undefined) {
      setFormError('次回予約日時の形式が正しくありません');
      return;
    }

    await persistItemPatch(item.id, {
      nextReservationStartTime: isoValue,
    });
  };

  const handleSubmit = async () => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    if (items.length === 0) {
      setFormError('最低1名の患者情報を入力してください');
      return;
    }

    setIsSavingReport(true);
    setFormError(null);

    try {
      const insuranceRevenue = items
        .filter(item => item.billingType === 'insurance')
        .reduce((sum, item) => sum + item.fee, 0);
      const privateRevenue = totalRevenue - insuranceRevenue;

      const response = await fetch('/api/daily-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          report_date: date,
          total_patients: totalPatients,
          new_patients: 0,
          total_revenue: totalRevenue,
          insurance_revenue: insuranceRevenue,
          private_revenue: privateRevenue,
          report_text: `担当: ${staffName || '未設定'}、入力件数: ${items.length}`,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '日報の保存に失敗しました'));
        return;
      }

      alert('日報明細を保存しました');
      router.push('/daily-reports');
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '日報の保存に失敗しました'
      );
    } finally {
      setIsSavingReport(false);
    }
  };

  const totalRevenue = items.reduce((sum, item) => sum + item.fee, 0);
  const totalPatients = items.length;

  const isSubmitDisabled = useMemo(() => {
    if (!hasClinic || isLoading || errorMessage) return true;
    return (
      items.length === 0 ||
      savingItemId !== null ||
      isAddingItem ||
      isSavingReport
    );
  }, [
    hasClinic,
    isLoading,
    errorMessage,
    items.length,
    savingItemId,
    isAddingItem,
    isSavingReport,
  ]);

  if (profileLoading) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <div className='text-gray-500'>プロフィール情報を読み込み中です...</div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>
              プロフィール取得に失敗しました
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-gray-700 dark:text-gray-300'>{errorMessage}</p>
            <Button
              onClick={() => window.location.reload()}
              className='bg-blue-600 text-white'
            >
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasClinic) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>クリニック情報が見つかりません</CardTitle>
            <CardDescription>
              権限が付与されたクリニックが設定されていないため、日報を登録できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300'>
              管理者にお問い合わせください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 p-4'>
      <div className='max-w-6xl mx-auto space-y-6'>
        {(formError || loadError) && (
          <Card className='border-red-200 bg-red-50 dark:bg-red-950/40'>
            <CardContent className='py-4'>
              <p className='text-red-700 dark:text-red-300 font-medium'>
                {formError ?? loadError}
              </p>
            </CardContent>
          </Card>
        )}

        <div className='flex items-center justify-between gap-4'>
          <div className='flex items-center space-x-4'>
            <Link href='/daily-reports'>
              <Button variant='outline' size='sm'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                戻る
              </Button>
            </Link>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              日報入力
            </h1>
          </div>
          <Button
            onClick={handleSubmit}
            className='bg-blue-600 text-white'
            disabled={isSubmitDisabled}
          >
            <Save className='h-4 w-4 mr-2' />
            {isSavingReport ? '保存中...' : '保存'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>
              来院済み予約は同日の明細に自動で反映されます
            </CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='date'>日付</Label>
              <Input
                id='date'
                type='date'
                value={date}
                onChange={event => setDate(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='staffName'>担当スタッフ</Label>
              <Input
                id='staffName'
                placeholder='山田太郎'
                value={staffName}
                onChange={event => setStaffName(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>患者追加</CardTitle>
            <CardDescription>
              予約に紐づかない施術記録を手動で追加します
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='patientName'>患者名</Label>
                <Input
                  id='patientName'
                  placeholder='田中花子'
                  value={newItem.patientName}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      patientName: event.target.value,
                    }))
                  }
                  disabled={isAddingItem}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='treatmentName'>施術内容</Label>
                <Input
                  id='treatmentName'
                  placeholder='整体、マッサージ'
                  value={newItem.treatmentName}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      treatmentName: event.target.value,
                    }))
                  }
                  disabled={isAddingItem}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='newPaymentMethod'>決済方法</Label>
                <select
                  id='newPaymentMethod'
                  className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                  value={newItem.paymentMethodId}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      paymentMethodId: event.target.value,
                    }))
                  }
                  disabled={isAddingItem}
                >
                  <option value=''>未選択</option>
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-5 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='duration'>施術時間（分）</Label>
                <Input
                  id='duration'
                  type='number'
                  min={0}
                  value={newItem.durationMinutes || ''}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      durationMinutes: Number(event.target.value),
                    }))
                  }
                  disabled={isAddingItem}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='fee'>料金（円）</Label>
                <Input
                  id='fee'
                  type='number'
                  min={0}
                  value={newItem.fee || ''}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      fee: Number(event.target.value),
                    }))
                  }
                  disabled={isAddingItem}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='billingType'>区分</Label>
                <select
                  id='billingType'
                  className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                  value={newItem.billingType}
                  onChange={event =>
                    setNewItem(prev => ({
                      ...prev,
                      billingType: isBillingType(event.target.value)
                        ? event.target.value
                        : 'private',
                    }))
                  }
                  disabled={isAddingItem}
                >
                  <option value='insurance'>保険診療</option>
                  <option value='private'>自費診療</option>
                </select>
              </div>
              <div className='md:col-span-2 flex items-end'>
                <Button
                  onClick={addItem}
                  className='w-full'
                  disabled={isAddingItem}
                >
                  <Plus className='h-4 w-4 mr-2' />
                  {isAddingItem ? '追加中...' : '追加'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>施術記録一覧</CardTitle>
            <CardDescription>
              本日の患者数: {totalPatients}名 | 合計売上: ¥
              {totalRevenue.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingItems ? (
              <div className='text-center py-8 text-gray-500'>
                明細を読み込み中です...
              </div>
            ) : items.length === 0 ? (
              <div className='text-center py-8 text-gray-500'>
                まだ患者が登録されていません
              </div>
            ) : (
              <div className='space-y-3'>
                {items.map(item => {
                  const itemSaving = savingItemId === item.id;
                  const nextReservationEnabled = canUseNextReservation(item);
                  return (
                    <div key={item.id} className='p-4 border rounded-lg'>
                      <div className='grid grid-cols-1 lg:grid-cols-12 gap-3 items-end'>
                        <div className='lg:col-span-2 space-y-1'>
                          <Label htmlFor={`patient-${item.id}`}>患者名</Label>
                          <Input
                            id={`patient-${item.id}`}
                            value={item.patientName}
                            onChange={event =>
                              updateItemLocal(item.id, {
                                patientName: event.target.value,
                              })
                            }
                            onBlur={() =>
                              persistItemPatch(item.id, {
                                patientName: item.patientName,
                              })
                            }
                            disabled={itemSaving}
                          />
                        </div>
                        <div className='lg:col-span-2 space-y-1'>
                          <Label htmlFor={`treatment-${item.id}`}>
                            施術内容
                          </Label>
                          <Input
                            id={`treatment-${item.id}`}
                            value={item.treatmentName}
                            onChange={event =>
                              updateItemLocal(item.id, {
                                treatmentName: event.target.value,
                              })
                            }
                            onBlur={() =>
                              persistItemPatch(item.id, {
                                treatmentName: item.treatmentName,
                              })
                            }
                            disabled={itemSaving}
                          />
                        </div>
                        <div className='space-y-1'>
                          <Label htmlFor={`duration-${item.id}`}>分</Label>
                          <Input
                            id={`duration-${item.id}`}
                            type='number'
                            min={0}
                            value={item.durationMinutes}
                            onChange={event =>
                              updateItemLocal(item.id, {
                                durationMinutes: Number(event.target.value),
                              })
                            }
                            onBlur={() =>
                              persistItemPatch(item.id, {
                                durationMinutes: item.durationMinutes,
                              })
                            }
                            disabled={itemSaving}
                          />
                        </div>
                        <div className='space-y-1'>
                          <Label htmlFor={`fee-${item.id}`}>料金</Label>
                          <Input
                            id={`fee-${item.id}`}
                            type='number'
                            min={0}
                            value={item.fee}
                            onChange={event =>
                              updateItemLocal(item.id, {
                                fee: Number(event.target.value),
                              })
                            }
                            onBlur={() =>
                              persistItemPatch(item.id, {
                                fee: item.fee,
                              })
                            }
                            disabled={itemSaving}
                          />
                        </div>
                        <div className='space-y-1'>
                          <Label htmlFor={`billing-${item.id}`}>区分</Label>
                          <select
                            id={`billing-${item.id}`}
                            className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                            value={item.billingType}
                            onChange={event => {
                              const billingType = isBillingType(
                                event.target.value
                              )
                                ? event.target.value
                                : 'private';
                              updateItemLocal(item.id, { billingType });
                              void persistItemPatch(item.id, { billingType });
                            }}
                            disabled={itemSaving}
                          >
                            <option value='insurance'>保険</option>
                            <option value='private'>自費</option>
                          </select>
                        </div>
                        <div className='lg:col-span-2 space-y-1'>
                          <Label htmlFor={`payment-${item.id}`}>決済方法</Label>
                          <select
                            id={`payment-${item.id}`}
                            className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                            value={item.paymentMethodId ?? ''}
                            onChange={event => {
                              const paymentMethodId =
                                event.target.value || null;
                              updateItemLocal(item.id, { paymentMethodId });
                              void persistItemPatch(item.id, {
                                paymentMethodId,
                              });
                            }}
                            disabled={itemSaving}
                          >
                            <option value=''>未選択</option>
                            {paymentMethods.map(method => (
                              <option key={method.id} value={method.id}>
                                {method.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className='lg:col-span-2 space-y-1'>
                          <Label htmlFor={`next-${item.id}`}>
                            次回予約日時
                          </Label>
                          <Input
                            id={`next-${item.id}`}
                            type='datetime-local'
                            value={
                              nextReservationDrafts[item.id] ??
                              toDatetimeLocalValue(
                                item.nextReservationStartTime
                              )
                            }
                            onChange={event =>
                              setNextReservationDrafts(prev => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            onBlur={() => persistNextReservation(item)}
                            disabled={itemSaving || !nextReservationEnabled}
                          />
                        </div>
                        <div className='flex gap-2 justify-end'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => loadItems()}
                            disabled={itemSaving}
                          >
                            更新
                          </Button>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => deleteItem(item.id)}
                            className='text-red-600 hover:text-red-800'
                            disabled={
                              !canDeleteItems || deletingItemId === item.id
                            }
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>
                      <div className='mt-2 flex flex-wrap gap-2 text-xs text-gray-500'>
                        <span>
                          {item.source === 'reservation'
                            ? '予約から自動反映'
                            : '手動追加'}
                        </span>
                        {item.nextReservationId && (
                          <span>次回予約作成済み</span>
                        )}
                        {!nextReservationEnabled && (
                          <span>
                            手動追加行は予約に紐づかないため次回予約を作成できません
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card className='bg-blue-50 border-blue-200'>
            <CardContent className='pt-6'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-center'>
                <div>
                  <p className='text-2xl font-bold text-blue-600'>
                    {totalPatients}
                  </p>
                  <p className='text-sm text-blue-800'>総患者数</p>
                </div>
                <div>
                  <p className='text-2xl font-bold text-blue-600'>
                    {totalRevenue.toLocaleString()}
                  </p>
                  <p className='text-sm text-blue-800'>総売上</p>
                </div>
                <div>
                  <p className='text-2xl font-bold text-blue-600'>
                    ¥
                    {totalPatients > 0
                      ? Math.round(
                          totalRevenue / totalPatients
                        ).toLocaleString()
                      : 0}
                  </p>
                  <p className='text-sm text-blue-800'>平均単価</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

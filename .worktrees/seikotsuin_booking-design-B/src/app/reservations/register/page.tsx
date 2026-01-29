'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ReservationService } from '@/lib/services/reservation-service';

// 型定義
import type { Customer, Menu, TimeSlot } from '@/types/reservation';

// 通知関数
const showNotification = (
  message: string,
  type: 'success' | 'error' = 'success'
) => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (type === 'error') {
    alert(message);
  } else {
    console.info(message);
  }
};

interface Staff {
  id: string;
  name: string;
  workingHours: { start: string; end: string };
  supportedMenus: string[];
}

// サンプルデータ
const sampleMenus: Menu[] = [
  {
    id: 'menu1',
    name: '整体60分',
    durationMinutes: 60,
    price: 6000,
    description: '全身の調整を行います',
    isActive: true,
  },
  {
    id: 'menu2',
    name: '鍼灸45分',
    durationMinutes: 45,
    price: 5000,
    description: '鍼と灸による施術',
    isActive: true,
  },
  {
    id: 'menu3',
    name: 'マッサージ30分',
    durationMinutes: 30,
    price: 3500,
    description: 'リラクゼーション重視',
    isActive: true,
  },
  {
    id: 'menu4',
    name: '初回カウンセリング90分',
    durationMinutes: 90,
    price: 8000,
    description: '初回限定メニュー',
    isActive: true,
  },
];

const sampleStaff: Staff[] = [
  {
    id: 'staff1',
    name: '田中先生',
    workingHours: { start: '09:00', end: '18:00' },
    supportedMenus: ['menu1', 'menu2'],
  },
  {
    id: 'staff2',
    name: '佐藤先生',
    workingHours: { start: '10:00', end: '19:00' },
    supportedMenus: ['menu1', 'menu3'],
  },
  {
    id: 'staff3',
    name: '鈴木先生',
    workingHours: { start: '09:00', end: '21:00' },
    supportedMenus: ['menu2', 'menu4'],
  },
];

export default function ReservationRegisterPage() {
  const router = useRouter();
  const reservationService = useMemo(() => new ReservationService(), []);

  const [step, setStep] = useState<
    'customer' | 'menu' | 'datetime' | 'confirm'
  >('customer');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    customAttributes: {} as Record<string, any>,
  });
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [channel] = useState<'phone'>('phone'); // 電話予約固定
  const [isMultipleReservation, setIsMultipleReservation] = useState(false);
  const [multipleReservationDates, setMultipleReservationDates] = useState<
    string[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 顧客検索（モック）
  const searchCustomers = (query: string): Partial<Customer>[] => {
    if (!query) return [];
    return [
      {
        id: 'cust1',
        name: '山田太郎',
        phone: '090-1234-5678',
        email: 'yamada@example.com',
      },
      {
        id: 'cust2',
        name: '田中花子',
        phone: '080-9876-5432',
        lineUserId: 'line123',
      },
    ].filter(
      customer =>
        (customer.name && customer.name.includes(query)) ||
        (customer.phone && customer.phone.includes(query))
    );
  };

  // 利用可能時間スロット生成
  const generateTimeSlots = (
    menuDuration: number,
    staffId: string
  ): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const staff = sampleStaff.find(s => s.id === staffId);
    if (!staff) return slots;

    const timeParts = staff.workingHours.start.split(':');
    const endTimeParts = staff.workingHours.end.split(':');

    const startHour = Number(timeParts[0]);
    const startMinute = Number(timeParts[1]);
    const endHour = Number(endTimeParts[0]);
    const endMinute = Number(endTimeParts[1]);

    if (
      isNaN(startHour) ||
      isNaN(startMinute) ||
      isNaN(endHour) ||
      isNaN(endMinute)
    ) {
      return slots;
    }

    let currentTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute - menuDuration; // メニュー時間を考慮

    while (currentTime <= endTime) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      const isAvailable = Math.random() > 0.3;
      slots.push({
        time: timeString,
        available: isAvailable,
        ...(Math.random() > 0.7 && { conflictReason: '他の予約あり' }),
      });

      currentTime += 15; // 15分刻み
    }

    return slots;
  };

  const availableTimeSlots =
    selectedMenu && selectedStaff
      ? generateTimeSlots(selectedMenu.durationMinutes, selectedStaff.id)
      : [];

  // 予約確定処理（F101: 複数日予約対応）
  const handleSubmit = async (isTentative: boolean = false) => {
    if (!selectedMenu || !selectedStaff || !selectedTime) {
      showNotification('必要な情報が不足しています', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const customer = selectedCustomer || {
        id: `temp-${Date.now()}`, // 新規顧客の場合は仮ID
        ...newCustomer,
      };

      const [hours, minutes] = selectedTime.split(':').map(Number);
      if (hours === undefined || minutes === undefined) {
        throw new Error('無効な時刻形式です');
      }

      const baseStartTime = new Date(selectedDate);
      baseStartTime.setHours(hours, minutes, 0, 0);

      if (isMultipleReservation && multipleReservationDates.length > 0) {
        // 複数日予約の場合
        const allDates = [
          new Date(selectedDate),
          ...multipleReservationDates.map(d => new Date(d)),
        ];

        const result = await reservationService.createMultipleReservations({
          customerId: customer.id,
          menuId: selectedMenu.id,
          staffId: selectedStaff.id,
          dates: allDates,
          baseStartTime,
          duration: selectedMenu.durationMinutes,
          channel,
          notes,
          createdBy: 'current-user-id', // TODO: 実際のユーザーIDに置き換え
        });

        showNotification(
          `${result.length}件の予約を${isTentative ? '仮' : ''}確定しました`,
          'success'
        );
      } else {
        // 単一予約の場合
        const endTime = new Date(
          baseStartTime.getTime() + selectedMenu.durationMinutes * 60000
        );

        const result = await reservationService.createReservation({
          customerId: customer.id,
          menuId: selectedMenu.id,
          staffId: selectedStaff.id,
          startTime: baseStartTime,
          endTime,
          channel,
          notes,
          createdBy: 'current-user-id', // TODO: 実際のユーザーIDに置き換え
        });

        showNotification(
          `予約を${isTentative ? '仮' : ''}確定しました（ID: ${result.id}）`,
          'success'
        );
      }

      // 予約一覧ページにリダイレクト
      setTimeout(() => {
        router.push('/reservations/list');
      }, 1500);
    } catch (error) {
      console.error('Reservation creation error:', error);
      showNotification(
        error instanceof Error ? error.message : '予約の登録に失敗しました',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ステップ別レンダリング
  const renderCustomerStep = () => (
    <Card>
      <CardHeader>
        <CardTitle>顧客選択・登録</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div>
          <Label htmlFor='customer-search'>顧客検索（名前・電話番号）</Label>
          <Input
            id='customer-search'
            placeholder='山田太郎 または 090-1234-5678'
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
          />
        </div>

        {customerSearch && (
          <div className='border rounded-lg p-3'>
            <h4 className='font-medium mb-2'>検索結果</h4>
            {searchCustomers(customerSearch).map(customer => (
              <div
                key={customer.id}
                className={cn(
                  'p-3 border rounded cursor-pointer mb-2',
                  selectedCustomer?.id === customer.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                )}
                onClick={() => setSelectedCustomer(customer)}
              >
                <div className='font-medium'>{customer.name}</div>
                <div className='text-sm text-gray-600'>{customer.phone}</div>
                {customer.lineUserId && (
                  <Badge variant='secondary'>LINE連携済み</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div>
          <h4 className='font-medium mb-3'>新規顧客登録</h4>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='new-name'>お名前（必須）</Label>
              <Input
                id='new-name'
                value={newCustomer.name}
                onChange={e =>
                  setNewCustomer(prev => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor='new-phone'>電話番号（必須）</Label>
              <Input
                id='new-phone'
                placeholder='090-1234-5678'
                value={newCustomer.phone}
                onChange={e =>
                  setNewCustomer(prev => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor='new-email'>メールアドレス</Label>
              <Input
                id='new-email'
                type='email'
                value={newCustomer.email}
                onChange={e =>
                  setNewCustomer(prev => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <div className='flex justify-end'>
          <Button
            onClick={() => setStep('menu')}
            disabled={
              !selectedCustomer && (!newCustomer.name || !newCustomer.phone)
            }
          >
            次へ：メニュー選択
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderMenuStep = () => (
    <Card>
      <CardHeader>
        <CardTitle>メニュー・スタッフ選択</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div>
          <Label>メニュー選択</Label>
          <div className='grid grid-cols-2 gap-3 mt-2'>
            {sampleMenus.map(menu => (
              <div
                key={menu.id}
                className={cn(
                  'p-4 border rounded-lg cursor-pointer',
                  selectedMenu?.id === menu.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                )}
                onClick={() => setSelectedMenu(menu)}
              >
                <div className='font-medium'>{menu.name}</div>
                <div className='text-sm text-gray-600'>
                  {menu.durationMinutes}分
                </div>
                <div className='text-sm font-medium text-blue-600'>
                  ¥{menu.price.toLocaleString()}
                </div>
                {menu.description && (
                  <div className='text-xs text-gray-500 mt-1'>
                    {menu.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {selectedMenu && (
          <div>
            <Label>担当スタッフ選択</Label>
            <div className='grid grid-cols-3 gap-3 mt-2'>
              {sampleStaff
                .filter(staff => staff.supportedMenus.includes(selectedMenu.id))
                .map(staff => (
                  <div
                    key={staff.id}
                    className={cn(
                      'p-3 border rounded-lg cursor-pointer text-center',
                      selectedStaff?.id === staff.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    )}
                    onClick={() => setSelectedStaff(staff)}
                  >
                    <div className='font-medium'>{staff.name}</div>
                    <div className='text-xs text-gray-600'>
                      {staff.workingHours.start}〜{staff.workingHours.end}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className='flex justify-between'>
          <Button variant='outline' onClick={() => setStep('customer')}>
            戻る
          </Button>
          <Button
            onClick={() => setStep('datetime')}
            disabled={!selectedMenu || !selectedStaff}
          >
            次へ：日時選択
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderDateTimeStep = () => (
    <Card>
      <CardHeader>
        <CardTitle>日時選択</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-6'>
          <div>
            <Label htmlFor='date'>希望日</Label>
            <Input
              id='date'
              type='date'
              value={selectedDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>

          <div>
            <Label>複数回予約</Label>
            <div className='flex items-center space-x-2 mt-2'>
              <input
                type='checkbox'
                id='multiple'
                checked={isMultipleReservation}
                onChange={e => setIsMultipleReservation(e.target.checked)}
              />
              <label htmlFor='multiple' className='text-sm'>
                継続予約（複数回分）
              </label>
            </div>
          </div>
        </div>

        {selectedDate && (
          <div>
            <Label>利用可能時間</Label>
            <div className='grid grid-cols-6 gap-2 mt-2 max-h-60 overflow-y-auto'>
              {availableTimeSlots.map(slot => (
                <Button
                  key={slot.time}
                  variant={selectedTime === slot.time ? 'default' : 'outline'}
                  size='sm'
                  disabled={!slot.available}
                  onClick={() => setSelectedTime(slot.time)}
                  className={cn('text-xs', !slot.available && 'opacity-50')}
                  title={slot.conflictReason}
                >
                  {slot.time}
                </Button>
              ))}
            </div>
            <div className='text-xs text-gray-500 mt-2'>
              ※ グレーアウトされた時間は予約済みです
            </div>
          </div>
        )}

        {isMultipleReservation && (
          <div>
            <Label>追加予約日</Label>
            <div className='space-y-2 mt-2'>
              {[1, 2, 3, 4, 5].map(week => {
                const futureDate = new Date(selectedDate);
                futureDate.setDate(futureDate.getDate() + week * 7);
                const dateString = futureDate.toISOString().split('T')[0];
                const isChecked = multipleReservationDates.includes(dateString);

                return (
                  <div key={week} className='flex items-center space-x-2'>
                    <input
                      type='checkbox'
                      id={`date-${week}`}
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) {
                          setMultipleReservationDates(prev => [
                            ...prev,
                            dateString,
                          ]);
                        } else {
                          setMultipleReservationDates(prev =>
                            prev.filter(d => d !== dateString)
                          );
                        }
                      }}
                    />
                    <label htmlFor={`date-${week}`} className='text-sm flex-1'>
                      {futureDate.toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      })}
                      <span className='text-gray-500 ml-2'>
                        （{week}週間後）
                      </span>
                    </label>
                    {isChecked && (
                      <Badge variant='secondary' className='text-xs'>
                        選択済み
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {multipleReservationDates.length > 0 && (
              <div className='mt-3 p-3 bg-blue-50 rounded-lg'>
                <div className='text-sm font-medium text-blue-800 mb-2'>
                  選択中の予約: {multipleReservationDates.length + 1}件
                </div>
                <div className='text-xs text-blue-700'>
                  初回 + {multipleReservationDates.length}
                  回の追加予約が登録されます
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor='notes'>備考・要望</Label>
          <Textarea
            id='notes'
            placeholder='特別な要望や注意事項があればご記入ください'
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className='flex justify-between'>
          <Button variant='outline' onClick={() => setStep('menu')}>
            戻る
          </Button>
          <Button onClick={() => setStep('confirm')} disabled={!selectedTime}>
            次へ：確認
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderConfirmStep = () => {
    const customer = selectedCustomer || newCustomer;
    const startTime = new Date(`${selectedDate}T${selectedTime}`);
    const endTime = new Date(
      startTime.getTime() + selectedMenu!.durationMinutes * 60000
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle>予約内容確認</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-2 gap-6'>
            <div>
              <h4 className='font-medium mb-3'>顧客情報</h4>
              <div className='space-y-2 text-sm'>
                <div>
                  <span className='font-medium'>お名前:</span> {customer.name}
                </div>
                <div>
                  <span className='font-medium'>電話番号:</span>{' '}
                  {customer.phone}
                </div>
                {customer.email && (
                  <div>
                    <span className='font-medium'>メール:</span>{' '}
                    {customer.email}
                  </div>
                )}
                <div>
                  <span className='font-medium'>予約チャネル:</span> 電話予約
                </div>
              </div>
            </div>

            <div>
              <h4 className='font-medium mb-3'>予約詳細</h4>
              <div className='space-y-2 text-sm'>
                <div>
                  <span className='font-medium'>メニュー:</span>{' '}
                  {selectedMenu!.name}
                </div>
                <div>
                  <span className='font-medium'>担当:</span>{' '}
                  {selectedStaff!.name}
                </div>
                <div>
                  <span className='font-medium'>日時:</span>{' '}
                  {startTime.toLocaleDateString('ja-JP')} {selectedTime}〜
                  {endTime.toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div>
                  <span className='font-medium'>所要時間:</span>{' '}
                  {selectedMenu!.durationMinutes}分
                </div>
                <div>
                  <span className='font-medium'>料金:</span> ¥
                  {selectedMenu!.price.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {isMultipleReservation && multipleReservationDates.length > 0 && (
            <div>
              <h4 className='font-medium mb-3'>追加予約日程</h4>
              <div className='space-y-1 text-sm'>
                {multipleReservationDates.map(date => (
                  <div
                    key={date}
                    className='flex items-center justify-between py-1'
                  >
                    <span>
                      {new Date(date).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      })}{' '}
                      {selectedTime}〜
                    </span>
                    <Badge variant='outline'>
                      ¥{selectedMenu!.price.toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </div>
              <Separator className='my-3' />
              <div className='flex items-center justify-between font-medium text-lg'>
                <span>
                  合計料金（{multipleReservationDates.length + 1}回分）:
                </span>
                <span className='text-blue-600'>
                  ¥
                  {(
                    (multipleReservationDates.length + 1) *
                    selectedMenu!.price
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {notes && (
            <div>
              <h4 className='font-medium mb-2'>備考</h4>
              <div className='text-sm bg-gray-50 p-3 rounded'>{notes}</div>
            </div>
          )}

          <div className='bg-blue-50 p-4 rounded-lg'>
            <h4 className='font-medium text-blue-800 mb-2'>予約確定について</h4>
            <ul className='text-sm text-blue-700 space-y-1'>
              <li>• 予約確定後、自動リマインドが前日19:00に送信されます</li>
              <li>• キャンセル・変更は前日までにお電話ください</li>
              <li>• 15分以上の遅刻は無断キャンセル扱いとなる場合があります</li>
            </ul>
          </div>

          <div className='flex justify-between'>
            <Button
              variant='outline'
              onClick={() => setStep('datetime')}
              disabled={isSubmitting}
            >
              戻る
            </Button>
            <div className='space-x-2'>
              <Button
                variant='outline'
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
              >
                {isSubmitting ? '処理中...' : '仮予約として保存'}
              </Button>
              <Button
                className='bg-blue-600 hover:bg-blue-700'
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
              >
                {isSubmitting ? '処理中...' : '予約を確定する'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className='min-h-screen bg-gray-50 p-4'>
      <div className='max-w-4xl mx-auto'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-800'>新規予約登録</h1>

          {/* ステップインジケーター */}
          <div className='flex items-center mt-4'>
            {[
              { key: 'customer', label: '顧客情報' },
              { key: 'menu', label: 'メニュー' },
              { key: 'datetime', label: '日時' },
              { key: 'confirm', label: '確認' },
            ].map((stepInfo, index) => (
              <React.Fragment key={stepInfo.key}>
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium',
                    step === stepInfo.key
                      ? 'bg-blue-600 text-white'
                      : index <
                          ['customer', 'menu', 'datetime', 'confirm'].indexOf(
                            step
                          )
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-300 text-gray-600'
                  )}
                >
                  {index + 1}
                </div>
                <span
                  className={cn(
                    'ml-2 text-sm font-medium',
                    step === stepInfo.key ? 'text-blue-600' : 'text-gray-600'
                  )}
                >
                  {stepInfo.label}
                </span>
                {index < 3 && <div className='flex-1 mx-4 h-px bg-gray-300' />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ステップコンテンツ */}
        {step === 'customer' && renderCustomerStep()}
        {step === 'menu' && renderMenuStep()}
        {step === 'datetime' && renderDateTimeStep()}
        {step === 'confirm' && renderConfirmStep()}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ReservationService } from '@/lib/services/reservation-service';

// シンプルな通知関数（後でToastシステムに置き換え可能）
const showNotification = (
  message: string,
  type: 'success' | 'error' = 'success'
) => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // 開発時は視覚的なフィードバックのためアラートを使用
  if (type === 'error') {
    alert(message);
  }
};

// 型定義
import type { Reservation } from '@/types/reservation';

interface TimeSlot {
  time: string;
  displayTime: string;
}

interface ExtendedReservation extends Omit<
  Reservation,
  'startTime' | 'endTime'
> {
  customerName: string;
  menuName: string;
  staffName: string;
  startTime: Date;
  endTime: Date;
}

interface ExtendedResource {
  id: string;
  name: string;
  type: 'staff' | 'room' | 'bed' | 'device';
  workingHours: {
    start: string;
    end: string;
  };
  isActive: boolean;
}

// ステータス色定義（要件定義準拠）
const STATUS_COLORS = {
  tentative: '#E0E0E0', // 薄いグレー
  confirmed: '#B3E5FC', // 水色
  arrived: '#81C784', // 緑
  completed: '#4CAF50', // 濃い緑
  cancelled: '#EF5350', // 赤
  no_show: '#C62828', // 濃い赤
  unconfirmed: '#FFF176', // 黄色
  trial: '#BA68C8', // 紫
};

// アクセシビリティ対応パターン（将来的に色覚サポートモードで使用予定）
// const STATUS_PATTERNS = {
//   tentative: 'none',
//   confirmed: 'diagonal_stripes',
//   arrived: 'dots',
//   cancelled: 'cross_hatch',
//   completed: 'none',
//   no_show: 'cross_hatch',
//   unconfirmed: 'none',
//   trial: 'none',
// };

const STATUS_LABELS = {
  tentative: '仮予約',
  confirmed: '確定',
  arrived: '来院',
  completed: '完了',
  cancelled: 'キャンセル',
  no_show: '無断欠席',
  unconfirmed: '未確認',
  trial: '体験',
};

// 時間軸生成（5分刻み対応）
const generateTimeSlots = (granularity: number = 10): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startHour = 9; // 9:00開始
  const endHour = 21; // 21:00終了

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += granularity) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push({
        time: timeString,
        displayTime: timeString,
      });
    }
  }
  return slots;
};

// 現在時刻の計算
const getCurrentTimePosition = (granularity: number) => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 営業時間外の場合はnullを返す
  if (hour < 9 || hour >= 21) return null;

  const totalMinutes = (hour - 9) * 60 + minute;
  const position = (totalMinutes / granularity) * 40; // 40px per slot
  return position;
};

// サンプルデータ
const sampleResources: ExtendedResource[] = [
  {
    id: 'staff1',
    name: '田中先生',
    type: 'staff',
    workingHours: { start: '09:00', end: '18:00' },
    isActive: true,
  },
  {
    id: 'staff2',
    name: '佐藤先生',
    type: 'staff',
    workingHours: { start: '10:00', end: '19:00' },
    isActive: true,
  },
  {
    id: 'staff3',
    name: '鈴木先生',
    type: 'staff',
    workingHours: { start: '09:00', end: '21:00' },
    isActive: true,
  },
  {
    id: 'room1',
    name: '施術室A',
    type: 'room',
    workingHours: { start: '09:00', end: '21:00' },
    isActive: true,
  },
  {
    id: 'room2',
    name: '施術室B',
    type: 'room',
    workingHours: { start: '09:00', end: '21:00' },
    isActive: true,
  },
];

// サンプルデータ生成（今日の日付ベース）
const generateSampleReservations = (): ExtendedReservation[] => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return [
    {
      id: 'res1',
      customerId: 'cust1',
      customerName: '山田太郎',
      menuId: 'menu1',
      menuName: '整体60分',
      staffId: 'staff1',
      staffName: '田中先生',
      startTime: new Date(`${year}-${month}-${day}T10:00:00`),
      endTime: new Date(`${year}-${month}-${day}T11:00:00`),
      status: 'confirmed',
      channel: 'line',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user1',
    },
    {
      id: 'res2',
      customerId: 'cust2',
      customerName: '田中花子',
      menuId: 'menu2',
      menuName: '鍼灸45分',
      staffId: 'staff2',
      staffName: '佐藤先生',
      startTime: new Date(`${year}-${month}-${day}T14:30:00`),
      endTime: new Date(`${year}-${month}-${day}T15:15:00`),
      status: 'arrived',
      channel: 'phone',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user1',
    },
    {
      id: 'res3',
      customerId: 'cust3',
      customerName: '佐々木一郎',
      menuId: 'menu3',
      menuName: 'マッサージ30分',
      staffId: 'staff1',
      staffName: '田中先生',
      startTime: new Date(`${year}-${month}-${day}T13:00:00`),
      endTime: new Date(`${year}-${month}-${day}T13:30:00`),
      status: 'tentative',
      channel: 'web',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user1',
    },
    {
      id: 'res4',
      customerId: 'cust4',
      customerName: '鈴木美咲',
      menuId: 'menu4',
      menuName: 'リピーター割引 施術',
      staffId: 'staff3',
      staffName: '鈴木先生',
      startTime: new Date(`${year}-${month}-${day}T15:00:00`),
      endTime: new Date(`${year}-${month}-${day}T16:00:00`),
      status: 'unconfirmed',
      channel: 'line',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user1',
    },
    {
      id: 'res5',
      customerId: 'cust5',
      customerName: '高橋健太',
      menuId: 'menu5',
      menuName: '整体90分',
      staffId: 'staff2',
      staffName: '佐藤先生',
      startTime: new Date(`${year}-${month}-${day}T16:00:00`),
      endTime: new Date(`${year}-${month}-${day}T17:30:00`),
      status: 'confirmed',
      channel: 'phone',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user1',
    },
  ];
};

const sampleReservations: ExtendedReservation[] = generateSampleReservations();

export default function ReservationTimelinePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timeGranularity, setTimeGranularity] = useState(10);
  const [viewOrientation, setViewOrientation] = useState<
    'horizontal' | 'vertical'
  >('horizontal');
  const [filterStaff, setFilterStaff] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [reservations, setReservations] =
    useState<ExtendedReservation[]>(sampleReservations);
  const [resources] = useState<ExtendedResource[]>(sampleResources);
  const [draggedReservation, setDraggedReservation] = useState<string | null>(
    null
  );
  const [dragOverSlot, setDragOverSlot] = useState<{
    resourceId: string;
    time: string;
  } | null>(null);
  const [colorBlindMode, setColorBlindMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const reservationService = useMemo(() => new ReservationService(), []);
  const timeSlots = useMemo(
    () => generateTimeSlots(timeGranularity),
    [timeGranularity]
  );

  // 日付ナビゲーション
  const navigateDate = (direction: 'prev' | 'next' | 'today') => {
    const newDate = new Date(selectedDate);
    switch (direction) {
      case 'prev':
        newDate.setDate(newDate.getDate() - 1);
        break;
      case 'next':
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'today':
        return setSelectedDate(new Date());
    }
    setSelectedDate(newDate);
  };

  // D&D: 予約の時刻・担当変更処理（300ms以内の楽観的更新）
  const handleReservationDrop = useCallback(
    async (
      reservationId: string,
      newResourceId: string,
      newTimeSlot: string
    ) => {
      if (isUpdating) return;

      setIsUpdating(true);
      const startTime = performance.now();

      // 元の予約を取得
      const originalReservation = reservations.find(
        r => r.id === reservationId
      );
      if (!originalReservation) {
        setIsUpdating(false);
        return;
      }

      // 新しい開始・終了時刻を計算
      const [hours, minutes] = newTimeSlot.split(':').map(Number);
      if (hours === undefined || minutes === undefined) {
        setIsUpdating(false);
        return;
      }
      const newStartTime = new Date(selectedDate);
      newStartTime.setHours(hours, minutes, 0, 0);

      const duration =
        originalReservation.endTime.getTime() -
        originalReservation.startTime.getTime();
      const newEndTime = new Date(newStartTime.getTime() + duration);

      // 楽観的更新：即座にUIを更新（性能目標: 300ms以内）
      setReservations(prevReservations =>
        prevReservations.map(r =>
          r.id === reservationId
            ? {
                ...r,
                staffId: newResourceId,
                startTime: newStartTime,
                endTime: newEndTime,
                updatedAt: new Date(),
              }
            : r
        )
      );

      try {
        // 衝突検出
        const validation = await reservationService.validateTimeSlot(
          newResourceId,
          newStartTime,
          newEndTime
        );

        if (!validation.isValid) {
          // 衝突がある場合はロールバック
          setReservations(prevReservations =>
            prevReservations.map(r =>
              r.id === reservationId ? originalReservation : r
            )
          );
          showNotification(
            `予約の移動に失敗しました: ${validation.reason}`,
            'error'
          );
          setIsUpdating(false);
          return;
        }

        // バックエンド更新
        if (newResourceId !== originalReservation.staffId) {
          await reservationService.updateReservationStaff(
            reservationId,
            newResourceId
          );
        }

        await reservationService.updateReservationTime(
          reservationId,
          newStartTime,
          newEndTime
        );

        const endTime = performance.now();
        const elapsed = endTime - startTime;

        showNotification(
          `予約を更新しました（${Math.round(elapsed)}ms）`,
          'success'
        );

        // 性能目標チェック（開発時のみ）
        if (elapsed > 300) {
          console.warn(
            `Performance warning: D&D update took ${elapsed}ms (target: <300ms)`
          );
        }
      } catch (error) {
        // エラー時はロールバック
        setReservations(prevReservations =>
          prevReservations.map(r =>
            r.id === reservationId ? originalReservation : r
          )
        );
        showNotification('予約の更新に失敗しました', 'error');
        console.error('Reservation update error:', error);
      } finally {
        setIsUpdating(false);
      }
    },
    [reservations, selectedDate, reservationService, isUpdating]
  );

  // 予約カードの描画（改善版）
  const ReservationCard = ({
    reservation,
  }: {
    reservation: ExtendedReservation;
  }) => {
    const duration =
      (reservation.endTime.getTime() - reservation.startTime.getTime()) /
      (1000 * 60);
    const cardHeight = (duration / timeGranularity) * 40; // 40px per time slot
    const isCompact = cardHeight < 60; // 60px未満の場合はコンパクト表示

    // 色覚サポートモード用のパターン
    const getStatusPattern = (status: string) => {
      if (!colorBlindMode) return '';

      const patterns: Record<string, string> = {
        tentative: '⚪',
        confirmed: '✓',
        arrived: '●',
        completed: '■',
        cancelled: '✕',
        no_show: '✕✕',
        unconfirmed: '?',
        trial: '◆',
      };
      return patterns[status] || '';
    };

    return (
      <div
        draggable
        onDragStart={() => setDraggedReservation(reservation.id)}
        onDragEnd={() => setDraggedReservation(null)}
        className={cn(
          'absolute left-1 right-1 rounded-lg p-2 text-xs cursor-move shadow-md border-2 transition-all duration-200',
          'hover:shadow-xl hover:scale-[1.02] hover:z-10',
          draggedReservation === reservation.id &&
            'opacity-50 scale-105 ring-2 ring-blue-500'
        )}
        style={{
          backgroundColor: STATUS_COLORS[reservation.status],
          height: `${cardHeight}px`,
          top: `${getTimeSlotIndex(reservation.startTime) * 40}px`,
          minHeight: '40px',
          borderColor: colorBlindMode ? '#1f2937' : 'rgba(0,0,0,0.1)',
        }}
        title={`${reservation.customerName} - ${reservation.menuName}\n${reservation.startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${reservation.endTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}\nステータス: ${STATUS_LABELS[reservation.status]}`}
        role='button'
        tabIndex={0}
        aria-label={`予約: ${reservation.customerName}, ${reservation.menuName}, ${STATUS_LABELS[reservation.status]}`}
      >
        {isCompact ? (
          // コンパクト表示
          <div className='flex items-center justify-between h-full'>
            <div className='flex-1 min-w-0'>
              <span className='font-bold text-gray-900'>
                {reservation.customerName}
              </span>
              {colorBlindMode && (
                <span className='ml-1 font-bold'>
                  {getStatusPattern(reservation.status)}
                </span>
              )}
            </div>
            <span className='text-xs text-gray-700 ml-1 whitespace-nowrap'>
              {reservation.startTime.toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ) : (
          // 詳細表示
          <>
            <div className='flex items-start justify-between mb-1'>
              <div className='font-semibold text-gray-900 flex items-center gap-1'>
                {reservation.startTime.toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <span className='text-gray-500'>-</span>
                {reservation.endTime.toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {colorBlindMode && (
                  <span className='ml-1 font-bold text-base'>
                    {getStatusPattern(reservation.status)}
                  </span>
                )}
              </div>
              <span className='text-xs text-gray-600 bg-white/50 px-1.5 py-0.5 rounded'>
                {reservation.channel === 'line'
                  ? 'LINE'
                  : reservation.channel === 'phone'
                    ? '電話'
                    : reservation.channel === 'web'
                      ? 'Web'
                      : '来院'}
              </span>
            </div>
            <div className='font-bold text-sm text-gray-900 mb-0.5 line-clamp-1'>
              {reservation.customerName}
            </div>
            <div className='text-xs text-gray-700 line-clamp-1 mb-1'>
              {reservation.menuName}
            </div>
            <div className='flex items-center justify-between'>
              <Badge
                variant='secondary'
                className='text-xs font-medium px-2 py-0.5'
                style={{
                  backgroundColor: 'rgba(255,255,255,0.7)',
                  color: '#1f2937',
                  border: `1px solid ${STATUS_COLORS[reservation.status]}`,
                }}
              >
                {STATUS_LABELS[reservation.status]}
              </Badge>
            </div>
          </>
        )}
      </div>
    );
  };

  // 時間スロットのインデックス取得
  const getTimeSlotIndex = (time: Date) => {
    const hour = time.getHours();
    const minute = time.getMinutes();
    const totalMinutes = (hour - 9) * 60 + minute; // 9:00を基準とする
    return Math.floor(totalMinutes / timeGranularity);
  };

  // リソース行のレンダリング（改善版）
  const ResourceRow = ({ resource }: { resource: ExtendedResource }) => {
    const resourceReservations = reservations.filter(
      res => res.staffId === resource.id
    );
    const currentTimePos = getCurrentTimePosition(timeGranularity);

    // 営業時間外判定
    const isOutsideWorkingHours = (slotTime: string) => {
      const [workStartHour, workStartMin] = resource.workingHours.start
        .split(':')
        .map(Number);
      const [workEndHour, workEndMin] = resource.workingHours.end
        .split(':')
        .map(Number);
      const [slotHour, slotMin] = slotTime.split(':').map(Number);

      if (
        workStartHour === undefined ||
        workStartMin === undefined ||
        workEndHour === undefined ||
        workEndMin === undefined ||
        slotHour === undefined ||
        slotMin === undefined
      ) {
        return false;
      }

      const slotMinutes = slotHour * 60 + slotMin;
      const workStartMinutes = workStartHour * 60 + workStartMin;
      const workEndMinutes = workEndHour * 60 + workEndMin;

      return slotMinutes < workStartMinutes || slotMinutes >= workEndMinutes;
    };

    return (
      <div className='flex border-b border-gray-300'>
        {/* リソース名列 */}
        <div className='w-44 p-3 bg-gradient-to-r from-gray-50 to-gray-100 border-r-2 border-gray-300 flex items-center sticky left-0 z-10'>
          <div className='w-full'>
            <div className='font-semibold text-sm text-gray-900'>
              {resource.name}
            </div>
            <div className='text-xs text-gray-600 mt-0.5 flex items-center gap-1'>
              <span>⏰</span>
              <span>
                {resource.workingHours.start} - {resource.workingHours.end}
              </span>
            </div>
          </div>
        </div>

        {/* タイムライン列 */}
        <div
          className='flex-1 relative'
          style={{ height: `${timeSlots.length * 40}px` }}
        >
          {/* 時間グリッド */}
          {timeSlots.map((slot, index) => {
            const isHourBoundary = index % (60 / timeGranularity) === 0;
            const isHalfHourBoundary = index % (30 / timeGranularity) === 0;
            const isOutside = isOutsideWorkingHours(slot.time);

            return (
              <div
                key={slot.time}
                className={cn(
                  'absolute w-full transition-colors',
                  dragOverSlot?.resourceId === resource.id &&
                    dragOverSlot?.time === slot.time
                    ? 'bg-blue-200 ring-2 ring-blue-400'
                    : isOutside
                      ? 'bg-gray-100'
                      : 'bg-white hover:bg-gray-50'
                )}
                style={{
                  top: `${index * 40}px`,
                  height: '40px',
                  borderBottom: isHourBoundary
                    ? '2px solid #9ca3af'
                    : isHalfHourBoundary
                      ? '1px solid #d1d5db'
                      : '1px solid #e5e7eb',
                  borderRight: '1px solid #e5e7eb',
                }}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  if (draggedReservation && !isOutside) {
                    handleReservationDrop(
                      draggedReservation,
                      resource.id,
                      slot.time
                    );
                  }
                }}
                onDragOver={e => {
                  e.preventDefault();
                  if (!isOutside) {
                    setDragOverSlot({
                      resourceId: resource.id,
                      time: slot.time,
                    });
                  }
                }}
                onDragLeave={() => setDragOverSlot(null)}
                role='gridcell'
                aria-label={`${resource.name} ${slot.time} ${isOutside ? '営業時間外' : ''}`}
              >
                {/* 30分刻みで時間表示 */}
                {isHalfHourBoundary && (
                  <span className='absolute left-1 top-0 text-xs text-gray-400 font-medium pointer-events-none'>
                    {slot.time}
                  </span>
                )}
              </div>
            );
          })}

          {/* 現在時刻インジケーター */}
          {currentTimePos !== null && (
            <div
              className='absolute left-0 right-0 z-20 pointer-events-none'
              style={{ top: `${currentTimePos}px` }}
            >
              <div className='relative'>
                <div className='absolute left-0 w-full h-0.5 bg-red-500 shadow-lg' />
                <div className='absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full shadow-lg' />
              </div>
            </div>
          )}

          {/* 予約カード */}
          {resourceReservations.map(reservation => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* ヘッダー・ツールバー（改善版） */}
      <div className='bg-white border-b-2 border-gray-300 p-4 sticky top-0 z-30 shadow-md'>
        <div className='flex items-center justify-between mb-4'>
          <h1 className='text-2xl font-bold text-gray-900 flex items-center gap-2'>
            <span className='text-3xl'>📅</span>
            予約管理タイムライン
          </h1>

          {/* 日付ナビゲーション */}
          <div className='flex items-center space-x-3'>
            <Button
              variant='outline'
              onClick={() => navigateDate('prev')}
              className='font-medium hover:bg-gray-100'
            >
              ← 前日
            </Button>
            <Button
              variant='outline'
              onClick={() => navigateDate('today')}
              className='font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300'
            >
              今日
            </Button>
            <Button
              variant='outline'
              onClick={() => navigateDate('next')}
              className='font-medium hover:bg-gray-100'
            >
              翌日 →
            </Button>
            <div className='ml-4 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200'>
              <div className='text-lg font-bold text-gray-900'>
                {selectedDate.toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className='text-sm text-gray-600'>
                {selectedDate.toLocaleDateString('ja-JP', { weekday: 'long' })}
              </div>
            </div>
          </div>

          {/* アクション */}
          <div className='flex items-center space-x-2'>
            <Button className='bg-blue-600 hover:bg-blue-700 font-semibold shadow-md'>
              ➕ 新規予約
            </Button>
            <Button variant='outline' className='font-medium'>
              🖨️ 印刷
            </Button>
            <Button
              variant='outline'
              className='font-medium text-green-700 border-green-300 hover:bg-green-50'
            >
              🔄 自動更新: 30秒
            </Button>
          </div>
        </div>

        {/* フィルタ・設定（改善版） */}
        <div className='flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200'>
          <div className='flex items-center gap-2'>
            <label className='text-sm font-semibold text-gray-700 whitespace-nowrap'>
              🔍 検索:
            </label>
            <Input
              placeholder='顧客名・電話番号'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='w-48 bg-white'
            />
          </div>

          <div className='h-6 w-px bg-gray-300' />

          <div className='flex items-center gap-2'>
            <label className='text-sm font-semibold text-gray-700 whitespace-nowrap'>
              👤 スタッフ:
            </label>
            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className='w-32 bg-white'>
                <SelectValue placeholder='全て' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>全て</SelectItem>
                {resources
                  .filter(r => r.type === 'staff')
                  .map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-center gap-2'>
            <label className='text-sm font-semibold text-gray-700 whitespace-nowrap'>
              📊 ステータス:
            </label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className='w-32 bg-white'>
                <SelectValue placeholder='全て' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>全て</SelectItem>
                {Object.entries(STATUS_LABELS).map(([status, label]) => (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-center gap-2'>
            <label className='text-sm font-semibold text-gray-700 whitespace-nowrap'>
              ⏱️ 時間間隔:
            </label>
            <Select
              value={timeGranularity.toString()}
              onValueChange={value => setTimeGranularity(Number(value))}
            >
              <SelectTrigger className='w-24 bg-white'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='5'>5分</SelectItem>
                <SelectItem value='10'>10分</SelectItem>
                <SelectItem value='15'>15分</SelectItem>
                <SelectItem value='30'>30分</SelectItem>
                <SelectItem value='60'>60分</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='h-6 w-px bg-gray-300' />

          <div className='flex items-center gap-2'>
            <Button
              variant={viewOrientation === 'horizontal' ? 'default' : 'outline'}
              onClick={() => setViewOrientation('horizontal')}
              size='sm'
              className={cn(
                'font-medium',
                viewOrientation === 'horizontal'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'hover:bg-gray-100'
              )}
            >
              ↔️ 横表示
            </Button>
            <Button
              variant={viewOrientation === 'vertical' ? 'default' : 'outline'}
              onClick={() => setViewOrientation('vertical')}
              size='sm'
              className={cn(
                'font-medium',
                viewOrientation === 'vertical'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'hover:bg-gray-100'
              )}
            >
              ↕️ 縦表示
            </Button>
          </div>

          <Button
            variant={colorBlindMode ? 'default' : 'outline'}
            onClick={() => setColorBlindMode(!colorBlindMode)}
            size='sm'
            className={cn(
              'font-medium',
              colorBlindMode
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'hover:bg-purple-50 text-purple-700 border-purple-300'
            )}
          >
            {colorBlindMode ? '✓' : '○'} 色覚サポート
          </Button>
        </div>
      </div>

      {/* 通知バナー（改善版） */}
      <div className='bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 p-4 shadow-sm'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <span className='text-2xl'>⚠️</span>
            <div>
              <p className='text-sm font-semibold text-yellow-900'>
                未確認の予約が3件あります
              </p>
              <p className='text-xs text-yellow-700 mt-0.5'>
                予約を確認して対応してください
              </p>
            </div>
          </div>
          <Button
            variant='outline'
            className='bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border-yellow-400 font-medium'
          >
            確認する →
          </Button>
        </div>
      </div>

      {/* メインタイムライン */}
      <div className='flex overflow-hidden'>
        {/* 時間軸ヘッダー */}
        <div className='w-44 bg-gradient-to-r from-gray-100 to-gray-200 border-r-2 border-gray-300 sticky left-0 z-20'>
          <div className='p-3 border-b-2 border-gray-300 font-semibold text-center text-gray-800 h-16 flex items-center justify-center'>
            リソース / 時間
          </div>
        </div>

        <div className='flex-1 overflow-x-auto'>
          {/* 時間ヘッダー（改善版） */}
          <div className='bg-gradient-to-b from-gray-100 to-gray-200 border-b-2 border-gray-300 sticky top-0 z-10 h-16'>
            <div className='flex h-full'>
              {timeSlots
                .filter((_, index) => index % (30 / timeGranularity) === 0)
                .map((slot, idx) => {
                  const isHourMark = idx % 2 === 0;
                  return (
                    <div
                      key={slot.time}
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center border-r',
                        isHourMark ? 'border-gray-400' : 'border-gray-300'
                      )}
                      style={{
                        width: `${(30 / timeGranularity) * 40}px`, // 30分分の幅
                      }}
                    >
                      <span
                        className={cn(
                          'font-medium',
                          isHourMark
                            ? 'text-base text-gray-900'
                            : 'text-sm text-gray-600'
                        )}
                      >
                        {slot.displayTime}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* リソース行 */}
          <div role='grid' aria-label='予約タイムライン'>
            {resources.map(resource => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      </div>

      {/* ステータス凡例（改善版） */}
      <div className='bg-white border-t-2 border-gray-300 p-4 shadow-inner'>
        <div className='flex flex-wrap items-center gap-4'>
          <span className='text-sm font-semibold text-gray-800 mr-2'>
            ステータス凡例:
          </span>
          {Object.entries(STATUS_LABELS).map(([status, label]) => {
            const patterns: Record<string, string> = {
              tentative: '⚪',
              confirmed: '✓',
              arrived: '●',
              completed: '■',
              cancelled: '✕',
              no_show: '✕✕',
              unconfirmed: '?',
              trial: '◆',
            };

            return (
              <div
                key={status}
                className='flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200'
              >
                <div className='flex items-center gap-1.5'>
                  <div
                    className='w-5 h-5 rounded border-2'
                    style={{
                      backgroundColor:
                        STATUS_COLORS[status as keyof typeof STATUS_COLORS],
                      borderColor: colorBlindMode
                        ? '#1f2937'
                        : 'rgba(0,0,0,0.1)',
                    }}
                  />
                  {colorBlindMode && (
                    <span className='text-base font-bold text-gray-700'>
                      {patterns[status]}
                    </span>
                  )}
                </div>
                <span className='text-sm font-medium text-gray-700'>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {colorBlindMode && (
          <div className='mt-3 text-xs text-gray-600 flex items-center gap-1'>
            <span className='font-semibold'>ℹ️ 色覚サポートモード:</span>
            <span>各ステータスに記号が表示されています</span>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// 型定義
import type { Reservation } from '@/types/reservation';

interface ExtendedReservation extends Reservation {
  customerName: string;
  customerPhone: string;
  menuName: string;
  staffName: string;
}

// ステータス設定
const STATUS_COLORS = {
  tentative: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  arrived: 'bg-green-100 text-green-800',
  completed: 'bg-green-200 text-green-900',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-200 text-red-900',
  unconfirmed: 'bg-yellow-100 text-yellow-800',
  trial: 'bg-purple-100 text-purple-800',
};

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

const CHANNEL_LABELS = {
  line: 'LINE',
  web: 'Web',
  phone: '電話',
  walk_in: '来院',
};

// サンプルデータ
const sampleReservations: ExtendedReservation[] = [
  {
    id: 'res1',
    customerId: 'cust1',
    customerName: '山田太郎',
    customerPhone: '090-1234-5678',
    menuId: 'menu1',
    menuName: '整体60分',
    staffId: 'staff1',
    staffName: '田中先生',
    startTime: new Date('2025-10-25T10:00:00'),
    endTime: new Date('2025-10-25T11:00:00'),
    status: 'confirmed',
    channel: 'line',
    notes: '肩こりが気になるとのこと',
    createdAt: new Date('2025-10-24T14:30:00'),
    updatedAt: new Date('2025-10-24T14:30:00'),
    createdBy: 'user1',
  },
  {
    id: 'res2',
    customerId: 'cust2',
    customerName: '田中花子',
    customerPhone: '080-9876-5432',
    menuId: 'menu2',
    menuName: '鍼灸45分',
    staffId: 'staff2',
    staffName: '佐藤先生',
    startTime: new Date('2025-10-25T14:30:00'),
    endTime: new Date('2025-10-25T15:15:00'),
    status: 'arrived',
    channel: 'phone',
    createdAt: new Date('2025-10-25T13:45:00'),
    updatedAt: new Date('2025-10-25T13:45:00'),
    createdBy: 'user1',
  },
  {
    id: 'res3',
    customerId: 'cust3',
    customerName: '佐藤次郎',
    customerPhone: '070-5555-1111',
    menuId: 'menu3',
    menuName: 'マッサージ30分',
    staffId: 'staff1',
    staffName: '田中先生',
    startTime: new Date('2025-10-26T16:00:00'),
    endTime: new Date('2025-10-26T16:30:00'),
    status: 'unconfirmed',
    channel: 'line',
    createdAt: new Date('2025-10-25T20:15:00'),
    updatedAt: new Date('2025-10-25T20:15:00'),
    createdBy: 'user1',
  },
  {
    id: 'res4',
    customerId: 'cust4',
    customerName: '鈴木美香',
    customerPhone: '090-7777-8888',
    menuId: 'menu4',
    menuName: '初回カウンセリング90分',
    staffId: 'staff3',
    staffName: '鈴木先生',
    startTime: new Date('2025-10-27T11:00:00'),
    endTime: new Date('2025-10-27T12:30:00'),
    status: 'trial',
    channel: 'web',
    notes: '初回体験希望',
    createdAt: new Date('2025-10-25T10:20:00'),
    updatedAt: new Date('2025-10-25T10:20:00'),
    createdBy: 'user1',
  },
  {
    id: 'res5',
    customerId: 'cust5',
    customerName: '高橋健一',
    customerPhone: '080-3333-4444',
    menuId: 'menu1',
    menuName: '整体60分',
    staffId: 'staff2',
    staffName: '佐藤先生',
    startTime: new Date('2025-10-24T15:00:00'),
    endTime: new Date('2025-10-24T16:00:00'),
    status: 'no_show',
    channel: 'phone',
    createdAt: new Date('2025-10-23T16:30:00'),
    updatedAt: new Date('2025-10-23T16:30:00'),
    createdBy: 'user1',
  },
];

export default function ReservationListPage() {
  const [reservations, setReservations] =
    useState<ExtendedReservation[]>(sampleReservations);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStaff, setFilterStaff] = useState<string>('');
  const [filterChannel, setFilterChannel] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState<
    'startTime' | 'createdAt' | 'customerName'
  >('startTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedReservations, setSelectedReservations] = useState<string[]>(
    []
  );

  // フィルタリング処理
  const filteredReservations = reservations.filter(reservation => {
    // 検索クエリ
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !reservation.customerName.toLowerCase().includes(query) &&
        !reservation.customerPhone.includes(query) &&
        !reservation.id.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // ステータスフィルタ
    if (filterStatus && reservation.status !== filterStatus) return false;

    // スタッフフィルタ
    if (filterStaff && reservation.staffId !== filterStaff) return false;

    // チャネルフィルタ
    if (filterChannel && reservation.channel !== filterChannel) return false;

    // 日付フィルタ
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      if (reservation.startTime < fromDate) return false;
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59);
      if (reservation.startTime > toDate) return false;
    }

    return true;
  });

  // ソート処理
  const sortedReservations = [...filteredReservations].sort((a, b) => {
    let aValue: any, bValue: any;

    switch (sortBy) {
      case 'startTime':
        aValue = a.startTime.getTime();
        bValue = b.startTime.getTime();
        break;
      case 'createdAt':
        aValue = a.createdAt.getTime();
        bValue = b.createdAt.getTime();
        break;
      case 'customerName':
        aValue = a.customerName;
        bValue = b.customerName;
        break;
      default:
        return 0;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // ステータス更新
  const updateReservationStatus = (
    reservationId: string,
    newStatus: Reservation['status']
  ) => {
    setReservations(prev =>
      prev.map(res =>
        res.id === reservationId ? { ...res, status: newStatus } : res
      )
    );
  };

  // 一括操作
  const handleBulkAction = (action: 'confirm' | 'cancel' | 'delete') => {
    if (selectedReservations.length === 0) return;

    switch (action) {
      case 'confirm':
        setReservations(prev =>
          prev.map(res =>
            selectedReservations.includes(res.id)
              ? { ...res, status: 'confirmed' }
              : res
          )
        );
        break;
      case 'cancel':
        setReservations(prev =>
          prev.map(res =>
            selectedReservations.includes(res.id)
              ? { ...res, status: 'cancelled' }
              : res
          )
        );
        break;
      case 'delete':
        setReservations(prev =>
          prev.filter(res => !selectedReservations.includes(res.id))
        );
        break;
    }
    setSelectedReservations([]);
  };

  return (
    <div className='min-h-screen bg-gray-50 p-4'>
      <div className='max-w-7xl mx-auto'>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-800'>予約一覧・管理</h1>
          <p className='text-gray-600 mt-1'>
            予約の検索、フィルタリング、一括操作が可能です
          </p>
        </div>

        {/* フィルタ・検索セクション */}
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>検索・フィルタ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4'>
              <div>
                <Label htmlFor='search'>検索</Label>
                <Input
                  id='search'
                  placeholder='顧客名・電話・予約ID'
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor='status'>ステータス</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className='w-full'>
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

              <div>
                <Label htmlFor='staff'>スタッフ</Label>
                <Select value={filterStaff} onValueChange={setFilterStaff}>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='全て' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>全て</SelectItem>
                    <SelectItem value='staff1'>田中先生</SelectItem>
                    <SelectItem value='staff2'>佐藤先生</SelectItem>
                    <SelectItem value='staff3'>鈴木先生</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor='channel'>予約チャネル</Label>
                <Select value={filterChannel} onValueChange={setFilterChannel}>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='全て' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>全て</SelectItem>
                    {Object.entries(CHANNEL_LABELS).map(([channel, label]) => (
                      <SelectItem key={channel} value={channel}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor='date-from'>開始日</Label>
                <Input
                  id='date-from'
                  type='date'
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor='date-to'>終了日</Label>
                <Input
                  id='date-to'
                  type='date'
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className='flex items-center justify-between mt-4'>
              <div className='flex items-center space-x-4'>
                <div className='flex items-center space-x-2'>
                  <Label>並び順:</Label>
                  <Select
                    value={sortBy}
                    onValueChange={(value: any) => setSortBy(value)}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='startTime'>予約日時</SelectItem>
                      <SelectItem value='createdAt'>作成日時</SelectItem>
                      <SelectItem value='customerName'>顧客名</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
                    }
                  >
                    {sortOrder === 'asc' ? '昇順' : '降順'}
                  </Button>
                </div>
              </div>

              <div className='text-sm text-gray-600'>
                {filteredReservations.length}件 / 全{reservations.length}件
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 一括操作 */}
        {selectedReservations.length > 0 && (
          <Card className='mb-4 bg-blue-50 border-blue-200'>
            <CardContent className='py-3'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>
                  {selectedReservations.length}件選択中
                </span>
                <div className='space-x-2'>
                  <Button size='sm' onClick={() => handleBulkAction('confirm')}>
                    一括確定
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => handleBulkAction('cancel')}
                  >
                    一括キャンセル
                  </Button>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => handleBulkAction('delete')}
                  >
                    一括削除
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 予約一覧テーブル */}
        <Card>
          <CardContent className='p-0'>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-gray-50 border-b'>
                  <tr>
                    <th className='p-3 text-left'>
                      <input
                        type='checkbox'
                        checked={
                          selectedReservations.length ===
                            sortedReservations.length &&
                          sortedReservations.length > 0
                        }
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedReservations(
                              sortedReservations.map(r => r.id)
                            );
                          } else {
                            setSelectedReservations([]);
                          }
                        }}
                      />
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      予約ID
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      予約日時
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      顧客情報
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      メニュー
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      担当
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      ステータス
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      チャネル
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      作成日時
                    </th>
                    <th className='p-3 text-left text-sm font-medium text-gray-600'>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedReservations.map((reservation, index) => (
                    <tr
                      key={reservation.id}
                      className={cn(
                        'border-b hover:bg-gray-50',
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      )}
                    >
                      <td className='p-3'>
                        <input
                          type='checkbox'
                          checked={selectedReservations.includes(
                            reservation.id
                          )}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedReservations(prev => [
                                ...prev,
                                reservation.id,
                              ]);
                            } else {
                              setSelectedReservations(prev =>
                                prev.filter(id => id !== reservation.id)
                              );
                            }
                          }}
                        />
                      </td>
                      <td className='p-3 text-sm font-mono'>
                        {reservation.id}
                      </td>
                      <td className='p-3'>
                        <div className='text-sm'>
                          {reservation.startTime.toLocaleDateString('ja-JP')}
                        </div>
                        <div className='text-sm text-gray-600'>
                          {reservation.startTime.toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          -
                          {reservation.endTime.toLocaleTimeString('ja-JP', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className='p-3'>
                        <div className='text-sm font-medium'>
                          {reservation.customerName}
                        </div>
                        <div className='text-sm text-gray-600'>
                          {reservation.customerPhone}
                        </div>
                      </td>
                      <td className='p-3 text-sm'>{reservation.menuName}</td>
                      <td className='p-3 text-sm'>{reservation.staffName}</td>
                      <td className='p-3'>
                        <Badge className={STATUS_COLORS[reservation.status]}>
                          {STATUS_LABELS[reservation.status]}
                        </Badge>
                      </td>
                      <td className='p-3 text-sm'>
                        {CHANNEL_LABELS[reservation.channel]}
                      </td>
                      <td className='p-3 text-sm text-gray-600'>
                        {reservation.createdAt.toLocaleDateString('ja-JP')}
                        <br />
                        {reservation.createdAt.toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className='p-3'>
                        <div className='flex space-x-1'>
                          <Button size='sm' variant='outline'>
                            編集
                          </Button>
                          {reservation.status === 'unconfirmed' && (
                            <Button
                              size='sm'
                              onClick={() =>
                                updateReservationStatus(
                                  reservation.id,
                                  'confirmed'
                                )
                              }
                            >
                              確定
                            </Button>
                          )}
                          {reservation.status === 'confirmed' && (
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() =>
                                updateReservationStatus(
                                  reservation.id,
                                  'arrived'
                                )
                              }
                            >
                              来院
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedReservations.length === 0 && (
              <div className='text-center py-12 text-gray-500'>
                <p>条件に一致する予約が見つかりません</p>
                <Button
                  className='mt-4'
                  onClick={() => {
                    setSearchQuery('');
                    setFilterStatus('');
                    setFilterStaff('');
                    setFilterChannel('');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                >
                  フィルタをクリア
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 統計サマリー */}
        <div className='mt-6 grid grid-cols-2 md:grid-cols-4 gap-4'>
          {Object.entries(STATUS_LABELS).map(([status, label]) => {
            const count = filteredReservations.filter(
              r => r.status === status
            ).length;
            return (
              <Card key={status}>
                <CardContent className='p-4 text-center'>
                  <div className='text-2xl font-bold text-gray-800'>
                    {count}
                  </div>
                  <div className='text-sm text-gray-600'>{label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import { Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useManagerShiftRequests } from '@/hooks/useManagerShiftRequests';
import type {
  ShiftRequestStatus,
  ShiftRequestType,
} from '@/lib/staff/shift-requests/types';

const REQUEST_TYPE_LABELS: Record<ShiftRequestType, string> = {
  available: '勤務可能',
  preferred: '優先希望',
  unavailable: '勤務不可',
  day_off: '休み希望',
};

const STATUS_LABELS: Record<ShiftRequestStatus, string> = {
  draft: '下書き',
  submitted: '提出済み',
  approved: '承認',
  rejected: '却下',
  withdrawn: '取下げ',
  converted: '変換済み',
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function typeBadgeClass(type: ShiftRequestType): string {
  if (type === 'available') return 'bg-emerald-100 text-emerald-800';
  if (type === 'preferred') return 'bg-blue-100 text-blue-800';
  if (type === 'unavailable') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-200 text-slate-800';
}

export function ManagerShiftRequests() {
  const state = useManagerShiftRequests();

  return (
    <main className='min-h-screen bg-background p-4 pt-8 text-foreground'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>担当院希望シフト</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              担当院の希望シフトを確認し、承認・却下・シフト変換を行います。
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => void state.refetch()}
            disabled={state.loading}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </header>

        {state.message && (
          <Card>
            <CardContent
              className={
                state.message.type === 'error'
                  ? 'p-4 text-sm text-red-700'
                  : 'p-4 text-sm text-green-700'
              }
            >
              {state.message.text}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>フィルター</CardTitle>
            <CardDescription>担当院と提出期間を選択します。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2'>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>院</span>
              <select
                aria-label='院'
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={state.selectedClinicId}
                onChange={event =>
                  state.setSelectedClinicId(event.target.value)
                }
                disabled={state.loading || state.clinics.length === 0}
              >
                {state.clinics.map(clinic => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </label>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>提出期間</span>
              <select
                aria-label='提出期間'
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={state.selectedPeriodId}
                onChange={event =>
                  state.setSelectedPeriodId(event.target.value)
                }
                disabled={state.loading || state.periods.length === 0}
              >
                <option value=''>未選択</option>
                {state.periods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.title}
                  </option>
                ))}
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
              <div>
                <CardTitle className='text-base'>希望シフト一覧</CardTitle>
                <CardDescription>{state.requests.length}件</CardDescription>
              </div>
              <Button
                type='button'
                onClick={() => void state.convertSelectedRequests()}
                disabled={
                  state.loading || state.selectedRequestIds.length === 0
                }
              >
                <ShieldCheck className='mr-2 h-4 w-4' />
                シフトに変換
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {state.loading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : state.clinics.length === 0 ? (
              <p className='text-sm text-gray-600'>
                担当院がまだ設定されていません。
              </p>
            ) : state.periods.length === 0 ? (
              <p className='text-sm text-gray-600'>
                表示できる提出期間がありません。
              </p>
            ) : state.requests.length === 0 ? (
              <p className='text-sm text-gray-600'>
                表示できる希望シフトがありません。
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[980px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-gray-500'>
                      <th className='w-10 py-2'></th>
                      <th className='py-2'>スタッフ名</th>
                      <th className='py-2'>種別</th>
                      <th className='py-2'>日時</th>
                      <th className='py-2'>優先度</th>
                      <th className='py-2'>状態</th>
                      <th className='py-2'>備考</th>
                      <th className='py-2'>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.requests.map(request => (
                      <tr key={request.id} className='border-b align-top'>
                        <td className='py-3'>
                          <input
                            aria-label='変換対象'
                            type='checkbox'
                            checked={state.selectedRequestIds.includes(
                              request.id
                            )}
                            disabled={request.status !== 'approved'}
                            onChange={() =>
                              state.toggleRequestSelection(request.id)
                            }
                          />
                        </td>
                        <td className='py-3 font-medium'>
                          {state.staffNameById.get(request.staff_id) ??
                            request.staff_id}
                        </td>
                        <td className='py-3'>
                          <Badge
                            className={typeBadgeClass(request.request_type)}
                          >
                            {REQUEST_TYPE_LABELS[request.request_type]}
                          </Badge>
                        </td>
                        <td className='py-3'>
                          {formatDateTime(request.start_time)} -{' '}
                          {formatDateTime(request.end_time)}
                        </td>
                        <td className='py-3'>{request.priority}</td>
                        <td className='py-3'>
                          {STATUS_LABELS[request.status]}
                        </td>
                        <td className='max-w-[240px] py-3 text-gray-600'>
                          {request.note ?? request.rejection_reason ?? ''}
                        </td>
                        <td className='space-y-2 py-3'>
                          <div className='flex gap-2'>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              onClick={() =>
                                void state.approveRequest(request.id)
                              }
                              disabled={
                                state.loading || request.status !== 'submitted'
                              }
                            >
                              <Check className='mr-1 h-4 w-4' />
                              承認
                            </Button>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              onClick={() =>
                                void state.rejectRequest(request.id)
                              }
                              disabled={
                                state.loading || request.status !== 'submitted'
                              }
                            >
                              <X className='mr-1 h-4 w-4' />
                              却下
                            </Button>
                          </div>
                          {request.status === 'submitted' && (
                            <Input
                              aria-label={`${request.id} の却下理由`}
                              value={state.rejectionReasons[request.id] ?? ''}
                              onChange={event =>
                                state.setRejectionReason(
                                  request.id,
                                  event.target.value
                                )
                              }
                              placeholder='却下理由'
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

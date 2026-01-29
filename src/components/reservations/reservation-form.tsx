'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReservationOptionSelection } from '@/types/reservation';
import { useReservationFormData } from '@/hooks/useReservationFormData';

export interface ReservationFormProps {
  clinicId: string;
  initialCustomerId?: string;
  onCreated?: (reservationId: string) => void;
}

export function ReservationForm({
  clinicId,
  initialCustomerId,
  onCreated,
}: ReservationFormProps) {
  const router = useRouter();
  const { customers, menus, resources, loading } =
    useReservationFormData(clinicId);

  const [selectedCustomerId, setSelectedCustomerId] = useState<
    string | undefined
  >(initialCustomerId);
  const [selectedMenuId, setSelectedMenuId] = useState<string | undefined>();
  const [selectedStaffId, setSelectedStaffId] = useState<string | undefined>();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<
    ReservationOptionSelection[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedMenu = useMemo(
    () => menus.find(m => m.id === selectedMenuId),
    [menus, selectedMenuId]
  );
  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );
  const selectedStaff = useMemo(
    () => resources.find(r => r.id === selectedStaffId),
    [resources, selectedStaffId]
  );

  const availableOptions = selectedMenu?.options?.filter(o => o.isActive) ?? [];

  const handleToggleOption = (option: any) => {
    setSelectedOptions(prev => {
      const exists = prev.find(o => o.optionId === option.id);
      if (exists) return prev.filter(o => o.optionId !== option.id);
      return [
        ...prev,
        {
          optionId: option.id,
          name: option.name,
          priceDelta: option.priceDelta ?? 0,
          durationDeltaMinutes: option.durationDeltaMinutes ?? 0,
        },
      ];
    });
  };

  const handleSubmit = async () => {
    if (
      !selectedCustomerId ||
      !selectedMenuId ||
      !selectedStaffId ||
      !date ||
      !time
    )
      return;
    setSubmitting(true);
    try {
      const [hh, mm] = time.split(':').map(Number);
      const startTime = new Date(date);
      startTime.setHours(hh, mm, 0, 0);
      const duration =
        (selectedMenu?.durationMinutes ?? 0) +
        selectedOptions.reduce(
          (sum, o) => sum + (o.durationDeltaMinutes || 0),
          0
        );
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          customerId: selectedCustomerId,
          menuId: selectedMenuId,
          staffId: selectedStaffId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          channel: 'phone',
          notes,
          selectedOptions,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || '予約作成に失敗しました');
      const newId = json.data.id;
      onCreated?.(newId);
      router.push(`/reservations/${newId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : '予約作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>新規予約</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <Label>患者</Label>
            <Select
              value={selectedCustomerId}
              onValueChange={setSelectedCustomerId}
            >
              <SelectTrigger>
                <SelectValue placeholder='患者を選択' />
              </SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}（{c.phone}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomer && (
              <div className='text-xs text-slate-500 mt-1'>
                電話: {selectedCustomer.phone}
              </div>
            )}
          </div>

          <div>
            <Label>メニュー</Label>
            <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
              <SelectTrigger>
                <SelectValue placeholder='メニューを選択' />
              </SelectTrigger>
              <SelectContent>
                {menus
                  .filter(m => m.isActive)
                  .map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}（{m.durationMinutes}分 /{' '}
                      {m.price.toLocaleString()}円）
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>担当スタッフ</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder='スタッフを選択' />
              </SelectTrigger>
              <SelectContent>
                {resources
                  .filter(r => r.type === 'staff' && r.isActive)
                  .map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedStaff && (
              <div className='text-xs text-slate-500 mt-1'>
                対応メニュー数: {selectedStaff.supportedMenus?.length ?? 0}
              </div>
            )}
          </div>

          <div className='grid grid-cols-2 gap-2'>
            <div>
              <Label>日付</Label>
              <Input
                type='date'
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label>時間</Label>
              <Input
                type='time'
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        {availableOptions.length > 0 && (
          <div>
            <Label>オプション</Label>
            <div className='flex flex-wrap gap-2 mt-2'>
              {availableOptions.map(opt => {
                const active = selectedOptions.some(o => o.optionId === opt.id);
                return (
                  <Button
                    key={opt.id}
                    type='button'
                    variant={active ? 'medical-primary' : 'outline'}
                    size='sm'
                    onClick={() => handleToggleOption(opt)}
                  >
                    {opt.name}
                    {opt.priceDelta ? ` (+${opt.priceDelta}円)` : ''}
                    {opt.durationDeltaMinutes
                      ? ` (+${opt.durationDeltaMinutes}分)`
                      : ''}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Label>メモ</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder='施術内容や注意事項など'
          />
        </div>

        <div className='flex justify-end gap-2'>
          <Button
            variant='outline'
            onClick={() => router.back()}
            disabled={submitting}
          >
            戻る
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              submitting ||
              !selectedCustomerId ||
              !selectedMenuId ||
              !selectedStaffId ||
              !time
            }
          >
            {submitting ? '作成中...' : '予約確定'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

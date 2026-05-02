'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CalendarDays, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type PublicMenu = {
  id: string;
  name: string;
  description?: string | null;
  price: number | null;
  duration_minutes: number | null;
  category?: string | null;
  is_insurance_applicable?: boolean | null;
};

type PublicResource = {
  id: string;
  name: string;
  type: 'staff' | 'room' | 'bed' | 'device';
  max_concurrent: number | null;
};

type BookingData = {
  clinicName: string;
  menus: PublicMenu[];
  resources: PublicResource[];
};

type SubmitState =
  | { status: 'idle'; message: null; reservationId?: never }
  | { status: 'success'; message: string; reservationId: string }
  | { status: 'error'; message: string; reservationId?: never };

const EMPTY_MENUS: PublicMenu[] = [];
const EMPTY_RESOURCES: PublicResource[] = [];

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const createLocalDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPrice = (price: number | null) =>
  typeof price === 'number' ? `${price.toLocaleString()}円` : '料金未設定';

const fieldClassName = 'min-h-12 text-base';
const selectClassName =
  'min-h-12 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const labelClassName = 'space-y-2 text-sm font-semibold text-slate-800';

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json?.error || 'データの取得に失敗しました');
  }
  return json.data as T;
}

function buildPublicBookingUrls(clinicId: string) {
  const menuParams = new URLSearchParams({ clinic_id: clinicId });
  const resourceParams = new URLSearchParams({
    clinic_id: clinicId,
    type: 'staff',
  });

  return {
    menus: `/api/public/menus?${menuParams.toString()}`,
    resources: `/api/public/resources?${resourceParams.toString()}`,
  };
}

function createStartTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function BookingLoadingState() {
  return (
    <main className='min-h-screen bg-slate-50 px-0 py-0 sm:px-4 sm:py-10'>
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-0 sm:gap-4'>
        <div className='space-y-2 px-4 pb-3 pt-5 sm:px-0 sm:pb-0 sm:pt-0'>
          <div className='h-4 w-32 animate-pulse rounded bg-slate-200' />
          <div className='h-8 w-28 animate-pulse rounded bg-slate-200' />
        </div>
        <Card className='space-y-5 rounded-none border-x-0 p-4 shadow-none sm:rounded-lg sm:border-x sm:p-6 sm:shadow-sm'>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className='space-y-2'>
              <div className='h-4 w-24 animate-pulse rounded bg-slate-200' />
              <div className='h-12 animate-pulse rounded-md bg-slate-200' />
            </div>
          ))}
        </Card>
      </div>
    </main>
  );
}

export default function PublicBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clinicId = getFirstParam(params?.clinic_id);
  const channel = searchParams.get('channel') === 'line' ? 'line' : 'web';
  const todayString = useMemo(() => createLocalDateString(), []);

  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
    message: null,
  });

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    menuId: '',
    resourceId: '',
    date: todayString,
    time: '10:00',
    notes: '',
  });

  useEffect(() => {
    if (!clinicId) {
      setLoadError('予約ページが見つかりません');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const urls = buildPublicBookingUrls(clinicId);

        const [menuData, resourceData] = await Promise.all([
          fetchJson<{
            clinic_name: string;
            menus: PublicMenu[];
          }>(urls.menus, controller.signal),
          fetchJson<{
            clinic_name: string;
            resources: PublicResource[];
          }>(urls.resources, controller.signal),
        ]);

        const nextData = {
          clinicName: menuData.clinic_name || resourceData.clinic_name,
          menus: menuData.menus,
          resources: resourceData.resources,
        };

        setBookingData(nextData);
        setFormData(prev => ({
          ...prev,
          menuId: prev.menuId || nextData.menus[0]?.id || '',
          resourceId: prev.resourceId || nextData.resources[0]?.id || '',
        }));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setLoadError(
          error instanceof Error
            ? error.message
            : '予約情報の取得に失敗しました'
        );
        setBookingData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [clinicId]);

  const menus = bookingData?.menus ?? EMPTY_MENUS;
  const resources = bookingData?.resources ?? EMPTY_RESOURCES;

  const menuById = useMemo(
    () => new Map(menus.map(menu => [menu.id, menu])),
    [menus]
  );

  const resourceById = useMemo(
    () => new Map(resources.map(resource => [resource.id, resource])),
    [resources]
  );

  const menuOptions = useMemo(
    () =>
      menus.map(menu => (
        <option key={menu.id} value={menu.id}>
          {menu.name} / {menu.duration_minutes ?? 60}分 /{' '}
          {formatPrice(menu.price)}
        </option>
      )),
    [menus]
  );

  const resourceOptions = useMemo(
    () =>
      resources.map(resource => (
        <option key={resource.id} value={resource.id}>
          {resource.name}
        </option>
      )),
    [resources]
  );

  const selectedMenu = useMemo(
    () => menuById.get(formData.menuId) ?? null,
    [formData.menuId, menuById]
  );

  const selectedResource = useMemo(
    () => resourceById.get(formData.resourceId) ?? null,
    [formData.resourceId, resourceById]
  );

  const hasBookableChoices = menus.length > 0 && resources.length > 0;

  const canSubmit = useMemo(
    () =>
      Boolean(clinicId) &&
      hasBookableChoices &&
      Boolean(formData.customerName.trim()) &&
      Boolean(formData.customerPhone.trim()) &&
      Boolean(formData.menuId) &&
      Boolean(formData.resourceId) &&
      Boolean(formData.date) &&
      Boolean(formData.time) &&
      !submitting,
    [
      clinicId,
      formData.customerName,
      formData.customerPhone,
      formData.date,
      formData.menuId,
      formData.resourceId,
      formData.time,
      hasBookableChoices,
      submitting,
    ]
  );

  const handleChange = useCallback(
    (field: keyof typeof formData, value: string) => {
      setSubmitState({ status: 'idle', message: null });
      setFormData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!clinicId || !canSubmit) return;

      setSubmitting(true);
      setSubmitState({ status: 'idle', message: null });

      try {
        const response = await fetch('/api/public/reservations', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clinic_id: clinicId,
            customer_name: formData.customerName.trim(),
            customer_phone: formData.customerPhone.trim(),
            customer_email: formData.customerEmail.trim() || undefined,
            menu_id: formData.menuId,
            resource_id: formData.resourceId,
            start_time: createStartTimeIso(formData.date, formData.time),
            notes: formData.notes.trim() || undefined,
            channel,
          }),
        });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json?.error || '予約の作成に失敗しました');
        }

        setSubmitState({
          status: 'success',
          message: '予約リクエストを受け付けました。',
          reservationId: json.data.reservation_id,
        });
      } catch (error) {
        setSubmitState({
          status: 'error',
          message:
            error instanceof Error ? error.message : '予約の作成に失敗しました',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, channel, clinicId, formData]
  );

  if (loading) {
    return <BookingLoadingState />;
  }

  if (loadError || !bookingData) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-slate-50 p-4'>
        <Card className='w-full max-w-md p-6 text-center'>
          <h1 className='text-lg font-semibold text-slate-900'>
            予約情報を表示できません
          </h1>
          <p className='mt-3 text-sm text-slate-600'>{loadError}</p>
        </Card>
      </main>
    );
  }

  if (!hasBookableChoices) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-slate-50 p-4'>
        <Card className='w-full max-w-md p-6 text-center'>
          <h1 className='text-lg font-semibold text-slate-900'>
            現在予約できる枠がありません
          </h1>
          <p className='mt-3 text-sm text-slate-600'>
            公開メニューまたは予約可能な担当者が未設定です。
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-slate-50 px-0 py-0 sm:px-4 sm:py-10'>
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-0 sm:gap-4'>
        <header className='space-y-1 px-4 pb-3 pt-5 sm:px-0 sm:pb-0 sm:pt-0'>
          <p className='text-sm font-medium text-sky-700'>
            {bookingData.clinicName}
          </p>
          <h1 className='text-2xl font-semibold leading-tight text-slate-950'>
            予約受付
          </h1>
        </header>

        <Card className='rounded-none border-x-0 p-4 shadow-none sm:rounded-lg sm:border-x sm:p-6 sm:shadow-sm'>
          {submitState.status === 'success' ? (
            <div className='space-y-5 py-8 text-center'>
              <CheckCircle2 className='mx-auto h-12 w-12 text-emerald-600' />
              <div>
                <h2 className='text-xl font-semibold text-slate-950'>
                  {submitState.message}
                </h2>
                <p className='mt-2 text-sm text-slate-600'>
                  院側で確認後、予約一覧には未確定予約として表示されます。
                </p>
              </div>
              <div className='rounded-md bg-slate-50 p-3 text-sm text-slate-700'>
                予約番号: {submitState.reservationId}
              </div>
            </div>
          ) : (
            <form className='space-y-5' onSubmit={handleSubmit}>
              {submitState.status === 'error' && (
                <div
                  className='rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700'
                  role='alert'
                >
                  {submitState.message}
                </div>
              )}

              <div className='grid gap-4'>
                <label className={labelClassName}>
                  お名前
                  <Input
                    className={fieldClassName}
                    value={formData.customerName}
                    onChange={event =>
                      handleChange('customerName', event.target.value)
                    }
                    autoComplete='name'
                    enterKeyHint='next'
                    placeholder='山田 太郎'
                    required
                  />
                </label>

                <label className={labelClassName}>
                  電話番号
                  <Input
                    className={fieldClassName}
                    type='tel'
                    value={formData.customerPhone}
                    onChange={event =>
                      handleChange('customerPhone', event.target.value)
                    }
                    autoComplete='tel'
                    enterKeyHint='next'
                    inputMode='tel'
                    placeholder='09012345678'
                    required
                  />
                </label>
              </div>

              <label className={labelClassName}>
                メールアドレス
                <Input
                  className={fieldClassName}
                  type='email'
                  value={formData.customerEmail}
                  onChange={event =>
                    handleChange('customerEmail', event.target.value)
                  }
                  autoComplete='email'
                  enterKeyHint='next'
                  inputMode='email'
                  placeholder='任意'
                />
              </label>

              <label className={labelClassName}>
                メニュー
                <select
                  className={selectClassName}
                  value={formData.menuId}
                  onChange={event => handleChange('menuId', event.target.value)}
                  required
                >
                  {menuOptions}
                </select>
              </label>

              <label className={labelClassName}>
                担当
                <select
                  className={selectClassName}
                  value={formData.resourceId}
                  onChange={event =>
                    handleChange('resourceId', event.target.value)
                  }
                  required
                >
                  {resourceOptions}
                </select>
              </label>

              <div className='grid gap-4 sm:grid-cols-2'>
                <label className={labelClassName}>
                  <span className='inline-flex items-center gap-1'>
                    <CalendarDays className='h-4 w-4' />
                    日付
                  </span>
                  <Input
                    className={fieldClassName}
                    type='date'
                    min={todayString}
                    value={formData.date}
                    onChange={event => handleChange('date', event.target.value)}
                    required
                  />
                </label>

                <label className={labelClassName}>
                  <span className='inline-flex items-center gap-1'>
                    <Clock className='h-4 w-4' />
                    時間
                  </span>
                  <Input
                    className={fieldClassName}
                    type='time'
                    step={300}
                    value={formData.time}
                    onChange={event => handleChange('time', event.target.value)}
                    required
                  />
                </label>
              </div>

              {(selectedMenu || selectedResource) && (
                <div className='rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700'>
                  {selectedMenu && (
                    <div>
                      {selectedMenu.name}: {selectedMenu.duration_minutes ?? 60}
                      分 / {formatPrice(selectedMenu.price)}
                    </div>
                  )}
                  {selectedResource && <div>担当: {selectedResource.name}</div>}
                </div>
              )}

              <label className={labelClassName}>
                相談内容・メモ
                <Textarea
                  className='min-h-28 text-base'
                  value={formData.notes}
                  onChange={event => handleChange('notes', event.target.value)}
                  enterKeyHint='done'
                  placeholder='症状や相談したい内容があれば入力してください'
                  rows={4}
                />
              </label>

              <div className='sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-0'>
                <Button
                  type='submit'
                  className='min-h-12 w-full text-base font-semibold'
                  variant='patient-primary'
                  size='touch'
                  disabled={!canSubmit}
                >
                  {submitting ? '送信中...' : '予約リクエストを送信'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}

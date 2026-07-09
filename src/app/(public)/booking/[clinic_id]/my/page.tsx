'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { Button, buttonClassName } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: string };

type PublicBookingFormMetadata = {
  liff_id?: string;
};

type MyReservation = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  menu_name: string;
  staff_name: string;
  can_cancel: boolean;
  cancellation_deadline_at: string | null;
};

type MyReservationsData = {
  customer: {
    name: string;
    consent_marketing: boolean;
  } | null;
  reservations: MyReservation[];
};

type MyPageState =
  | { status: 'loading'; message: string }
  | { status: 'outside_liff'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; message: string | null }
  | { status: 'error'; message: string };

interface PublicBookingMyPageProps {
  clinicId: string | null | undefined;
}

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || json.success !== true) {
    throw new Error(
      json.success === false ? json.error : 'データの取得に失敗しました'
    );
  }
  return json.data;
}

function buildBookingFormUrl(clinicId: string): string {
  const params = new URLSearchParams({ clinic_id: clinicId });
  return `/api/public/booking-form?${params.toString()}`;
}

function buildMyReservationsUrl(clinicId: string): string {
  const params = new URLSearchParams({ clinic_id: clinicId });
  return `/api/public/my-reservations?${params.toString()}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function formatStatus(status: string): string {
  switch (status) {
    case 'unconfirmed':
      return '未確定';
    case 'confirmed':
      return '確定';
    case 'tentative':
      return '仮予約';
    case 'trial':
      return '体験';
    default:
      return status;
  }
}

function getAuthHeaders(lineIdToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${lineIdToken}`,
  };
}

function MessagePanel({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className='min-h-screen bg-slate-50 px-4 py-8'>
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-4'>
        <header className='space-y-1'>
          <p className='text-sm font-medium text-sky-700'>LINEマイページ</p>
          <h1 className='text-2xl font-semibold text-slate-950'>{title}</h1>
        </header>
        <Card className='space-y-4 rounded-lg p-5 shadow-sm'>
          <MessageCircle className='h-8 w-8 text-sky-700' />
          <p className='text-sm leading-6 text-slate-700'>{message}</p>
          {actionHref && actionLabel && (
            <a
              className={buttonClassName({
                variant: 'patient-primary',
                size: 'touch',
              })}
              href={actionHref}
            >
              {actionLabel}
            </a>
          )}
        </Card>
      </div>
    </main>
  );
}

export function PublicBookingMyPage({ clinicId }: PublicBookingMyPageProps) {
  const [state, setState] = useState<MyPageState>({
    status: 'loading',
    message: 'LINE連携を確認しています...',
  });
  const [lineIdToken, setLineIdToken] = useState<string | null>(null);
  const [data, setData] = useState<MyReservationsData | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const bookingHref = useMemo(
    () => (clinicId ? `/booking/${clinicId}` : '/'),
    [clinicId]
  );

  const loadReservations = useCallback(
    async (token: string) => {
      if (!clinicId) return;
      const nextData = await fetchJson<MyReservationsData>(
        buildMyReservationsUrl(clinicId),
        {
          headers: getAuthHeaders(token),
        }
      );
      setData(nextData);
    },
    [clinicId]
  );

  useEffect(() => {
    if (!clinicId) {
      setState({
        status: 'error',
        message: '予約ページが見つかりません',
      });
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      setState({
        status: 'loading',
        message: 'LINE連携を確認しています...',
      });
      setData(null);
      setLineIdToken(null);

      try {
        const bookingForm = await fetchJson<PublicBookingFormMetadata>(
          buildBookingFormUrl(clinicId)
        );
        if (!bookingForm.liff_id) {
          if (!cancelled) {
            setState({
              status: 'unavailable',
              message: 'この院のLINEマイページは現在利用できません。',
            });
          }
          return;
        }

        const liff = (await import('@line/liff')).default;
        if (!liff.isInClient()) {
          if (!cancelled) {
            setState({
              status: 'outside_liff',
              message: 'LINEアプリからマイページを開いてください。',
            });
          }
          return;
        }

        await liff.init({ liffId: bookingForm.liff_id });
        const token = liff.getIDToken();
        if (!token) {
          throw new Error('LINEログイン情報を取得できませんでした。');
        }

        if (cancelled) return;
        setLineIdToken(token);
        await loadReservations(token);
        if (!cancelled) {
          setState({ status: 'ready', message: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'マイページを読み込めませんでした。',
          });
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [clinicId, loadReservations]);

  const handleConsentChange = async (checked: boolean) => {
    if (!clinicId || !lineIdToken || !data?.customer) return;

    setSavingConsent(true);
    setState({ status: 'ready', message: null });
    try {
      const result = await fetchJson<{ consent_marketing: boolean }>(
        '/api/public/my-reservations',
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(lineIdToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clinic_id: clinicId,
            consent_marketing: checked,
          }),
        }
      );
      setData(prev =>
        prev?.customer
          ? {
              ...prev,
              customer: {
                ...prev.customer,
                consent_marketing: result.consent_marketing,
              },
            }
          : prev
      );
      setState({
        status: 'ready',
        message: checked
          ? 'お知らせ配信を受け取る設定にしました。'
          : 'お知らせ配信を停止しました。',
      });
    } catch (error) {
      setState({
        status: 'ready',
        message:
          error instanceof Error
            ? error.message
            : 'お知らせ設定を更新できませんでした。',
      });
    } finally {
      setSavingConsent(false);
    }
  };

  const handleCancel = async (reservationId: string) => {
    if (!clinicId || !lineIdToken) return;

    setCancelingId(reservationId);
    setState({ status: 'ready', message: null });
    try {
      await fetchJson<{ reservation_id: string; status: string }>(
        `/api/public/reservations/${reservationId}/cancel`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeaders(lineIdToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clinic_id: clinicId }),
        }
      );
      await loadReservations(lineIdToken);
      setState({
        status: 'ready',
        message: '予約をキャンセルしました。必要に応じて再予約してください。',
      });
    } catch (error) {
      setState({
        status: 'ready',
        message:
          error instanceof Error
            ? error.message
            : '予約をキャンセルできませんでした。',
      });
    } finally {
      setCancelingId(null);
    }
  };

  if (state.status === 'loading') {
    return (
      <MessagePanel
        title='読み込み中'
        message={state.message}
        actionHref={undefined}
        actionLabel={undefined}
      />
    );
  }

  if (state.status === 'outside_liff') {
    return (
      <MessagePanel
        title='LINEアプリから開いてください'
        message={state.message}
      />
    );
  }

  if (state.status === 'unavailable' || state.status === 'error') {
    return (
      <MessagePanel
        title='マイページを利用できません'
        message={state.message}
        actionHref={bookingHref}
        actionLabel='予約ページへ'
      />
    );
  }

  return (
    <main className='min-h-screen bg-slate-50 px-0 py-0 sm:px-4 sm:py-8'>
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-4'>
        <header className='space-y-1 px-4 pt-5 sm:px-0 sm:pt-0'>
          <p className='text-sm font-medium text-sky-700'>LINEマイページ</p>
          <h1 className='text-2xl font-semibold leading-tight text-slate-950'>
            予約の確認
          </h1>
          {data?.customer && (
            <p className='text-sm text-slate-600'>{data.customer.name} 様</p>
          )}
        </header>

        {state.message && (
          <div
            className='mx-4 rounded-md border border-sky-100 bg-sky-50 px-3 py-3 text-sm leading-6 text-sky-800 sm:mx-0'
            role='status'
          >
            {state.message}
          </div>
        )}

        <section className='space-y-3 px-4 sm:px-0'>
          <div className='flex items-center gap-2 text-sm font-semibold text-slate-900'>
            <CalendarDays className='h-4 w-4' />
            今後の予約
          </div>

          {data?.reservations.length === 0 && (
            <Card className='space-y-4 rounded-lg p-5 shadow-sm'>
              <p className='text-sm leading-6 text-slate-700'>
                現在、今後の予約はありません。
              </p>
              <a
                className={buttonClassName({
                  variant: 'patient-primary',
                  size: 'touch',
                })}
                href={bookingHref}
              >
                予約する
                <ChevronRight className='ml-2 h-4 w-4' />
              </a>
            </Card>
          )}

          {data?.reservations.map(reservation => (
            <Card
              key={reservation.id}
              className='space-y-4 rounded-lg p-4 shadow-sm'
            >
              <div className='space-y-1'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='font-semibold text-slate-950'>
                      {formatDateTime(reservation.start_time)}
                    </p>
                    <p className='mt-1 text-sm text-slate-600'>
                      {reservation.menu_name || 'メニュー未設定'}
                    </p>
                  </div>
                  <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700'>
                    {formatStatus(reservation.status)}
                  </span>
                </div>
                <p className='text-sm text-slate-600'>
                  担当: {reservation.staff_name || '未設定'}
                </p>
              </div>

              {reservation.can_cancel ? (
                <Button
                  type='button'
                  variant='outline'
                  size='touch'
                  className='w-full border-red-200 text-red-700 hover:bg-red-50'
                  disabled={cancelingId === reservation.id}
                  onClick={() => void handleCancel(reservation.id)}
                >
                  {cancelingId === reservation.id ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      キャンセル中...
                    </>
                  ) : (
                    'キャンセルする'
                  )}
                </Button>
              ) : (
                <p className='rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600'>
                  この予約はマイページからキャンセルできません。
                </p>
              )}
            </Card>
          ))}
        </section>

        <section className='px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-0'>
          <Card className='rounded-lg p-4 shadow-sm'>
            <div className='flex items-center justify-between gap-4'>
              <div className='min-w-0 space-y-1'>
                <div className='flex items-center gap-2 text-sm font-semibold text-slate-900'>
                  <Bell className='h-4 w-4' />
                  お知らせ配信
                </div>
                <p className='text-xs leading-5 text-slate-600'>
                  キャンペーンなどのお知らせ配信を受け取ります。
                </p>
              </div>
              <Switch
                aria-label='お知らせ配信を受け取る'
                checked={data?.customer?.consent_marketing === true}
                disabled={!data?.customer || savingConsent}
                onCheckedChange={checked => void handleConsentChange(checked)}
              />
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default function PublicBookingMyPageRoute() {
  const params = useParams();
  const clinicId = getFirstParam(params?.clinic_id);

  return <PublicBookingMyPage clinicId={clinicId} />;
}

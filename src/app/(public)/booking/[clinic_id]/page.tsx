'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addJSTCalendarDays, toJSTDateString } from '@/lib/jst';
import type {
  BookingFormQuestion,
  BookingFormResponseValue,
  PublicBookingFormSettings,
} from '@/lib/booking-form/settings';

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

type AvailabilitySlot = {
  start: string;
  available: boolean;
  resource_ids: string[];
};

type AvailabilityDay = {
  date: string;
  is_closed: boolean;
  slots: AvailabilitySlot[];
};

type AvailabilityData = {
  slot_minutes: number;
  days: AvailabilityDay[];
};

type BookingData = {
  clinicName: string;
  menus: PublicMenu[];
  resources: PublicResource[];
  bookingForm: PublicBookingFormSettings;
};

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: string };

type SubmitState =
  | { status: 'idle'; message: null; reservationId?: never }
  | { status: 'success'; message: string; reservationId: string }
  | { status: 'error'; message: string; reservationId?: never };

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface PublicBookingFormProps {
  clinicId: string | null | undefined;
  channel?: 'web' | 'line';
  embedded?: boolean;
  previewMode?: boolean;
  bookingFormOverride?: PublicBookingFormSettings;
  campaignId?: string | null;
}

const EMPTY_MENUS: PublicMenu[] = [];
const EMPTY_RESOURCES: PublicResource[] = [];
const EMPTY_DAYS: AvailabilityDay[] = [];
const ANY_RESOURCE_ID = 'any';
const DEFAULT_PUBLIC_BOOKING_FORM: PublicBookingFormSettings = {
  fields: {
    nameKana: { enabled: true, required: false },
    phone: { enabled: true, required: true },
    email: { enabled: true, required: false },
    birthDate: { enabled: false, required: false },
    gender: { enabled: false, required: false },
    notes: { enabled: true, required: false },
  },
  staffSelection: 'optional',
  questions: [],
  consents: [],
  completionMessage: '',
};
const STEP_LABELS = [
  'メニュー',
  '担当者',
  '日時',
  '患者情報',
  '質問',
  '確認',
  '完了',
] as const;
const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-api';
const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme: 'light' | 'dark' | 'auto';
  size: 'normal' | 'compact' | 'flexible';
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

const getFirstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const formatPrice = (price: number | null) =>
  typeof price === 'number' ? `${price.toLocaleString()}円` : '料金未設定';

const formatDateLabel = (date: string) => {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(parsed);
};

const getResourceLabel = (
  resourceId: string,
  resources: PublicResource[],
  fallback = '指名なし'
) =>
  resourceId === ANY_RESOURCE_ID
    ? fallback
    : (resources.find(resource => resource.id === resourceId)?.name ?? '');

const createStartTimeIso = (date: string, time: string) =>
  `${date}T${time}:00+09:00`;

const normalizeCampaignId = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : undefined;
};

const buildLineFriendAddUrl = (oaBasicId: string) =>
  `https://line.me/R/ti/p/${encodeURIComponent(oaBasicId)}`;

const formatResponseValue = (value: BookingFormResponseValue | undefined) => {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if (Array.isArray(value)) return value.join('、');
  return value;
};

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Turnstile script failed to load')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Turnstile script failed to load')),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !json.success) {
    throw new Error(
      json.success === false ? json.error : 'データの取得に失敗しました'
    );
  }
  return json.data;
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
    bookingForm: `/api/public/booking-form?${menuParams.toString()}`,
  };
}

function buildAvailabilityUrl(params: {
  clinicId: string;
  menuId: string;
  resourceId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const query = new URLSearchParams({
    clinic_id: params.clinicId,
    menu_id: params.menuId,
    resource_id: params.resourceId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  });
  return `/api/public/availability?${query.toString()}`;
}

function BookingLoadingState({ embedded = false }: { embedded?: boolean }) {
  return (
    <main
      className={
        embedded
          ? 'min-h-full bg-slate-50 px-0 py-0'
          : 'min-h-screen bg-slate-50 px-0 py-0 sm:px-4 sm:py-8'
      }
    >
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-0 sm:gap-4'>
        <div className='space-y-2 px-4 pb-3 pt-5 sm:px-0 sm:pb-0 sm:pt-0'>
          <div className='h-4 w-32 animate-pulse rounded bg-slate-200' />
          <div className='h-8 w-28 animate-pulse rounded bg-slate-200' />
        </div>
        <Card className='space-y-5 rounded-none border-x-0 p-4 shadow-none sm:rounded-lg sm:border-x sm:p-6 sm:shadow-sm'>
          {Array.from({ length: 5 }).map((_, index) => (
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

function Stepper({ step }: { step: WizardStep }) {
  return (
    <nav aria-label='予約手順' className='px-4 sm:px-0'>
      <ol className='grid grid-cols-7 gap-1'>
        {STEP_LABELS.map((label, index) => {
          const current = index + 1;
          const active = current === step;
          const complete = current < step;
          return (
            <li key={label} className='min-w-0'>
              <div
                className={[
                  'h-1.5 rounded-full',
                  active || complete ? 'bg-sky-600' : 'bg-slate-200',
                ].join(' ')}
              />
              <div
                className={[
                  'mt-1 truncate text-center text-[11px] font-medium',
                  active ? 'text-sky-700' : 'text-slate-500',
                ].join(' ')}
              >
                {label}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WizardShell({
  embedded,
  clinicName,
  step,
  children,
}: {
  embedded: boolean;
  clinicName: string;
  step: WizardStep;
  children: ReactNode;
}) {
  return (
    <main
      className={
        embedded
          ? 'min-h-full bg-slate-50 px-0 py-0'
          : 'min-h-screen bg-slate-50 px-0 py-0 sm:px-4 sm:py-8'
      }
    >
      <div className='mx-auto flex w-full max-w-2xl flex-col gap-3 sm:gap-4'>
        <header className='space-y-1 px-4 pt-5 sm:px-0 sm:pt-0'>
          <p className='text-sm font-medium text-sky-700'>{clinicName}</p>
          <h1 className='text-2xl font-semibold leading-tight text-slate-950'>
            予約受付
          </h1>
        </header>
        <Stepper step={step} />
        <Card className='rounded-none border-x-0 p-4 shadow-none sm:rounded-lg sm:border-x sm:p-6 sm:shadow-sm'>
          {children}
        </Card>
      </div>
    </main>
  );
}

function NavigationButtons({
  step,
  canGoNext,
  submitting,
  onBack,
  onNext,
}: {
  step: WizardStep;
  canGoNext: boolean;
  submitting?: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className='sticky bottom-0 -mx-4 mt-5 grid grid-cols-[auto_1fr] gap-2 border-t border-slate-200 bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-0'>
      <Button
        type='button'
        variant='outline'
        size='touch'
        disabled={step === 1 || submitting}
        onClick={onBack}
        aria-label='前のステップへ戻る'
      >
        <ChevronLeft className='h-4 w-4' />
      </Button>
      <Button
        type='button'
        className='min-h-12 text-base font-semibold'
        variant='patient-primary'
        size='touch'
        disabled={!canGoNext || submitting}
        onClick={onNext}
      >
        {submitting ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            送信中...
          </>
        ) : step === 6 ? (
          '予約リクエストを送信'
        ) : (
          <>
            次へ
            <ChevronRight className='ml-2 h-4 w-4' />
          </>
        )}
      </Button>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: BookingFormQuestion;
  value: BookingFormResponseValue | undefined;
  onChange: (value: BookingFormResponseValue) => void;
}) {
  if (question.type === 'textarea') {
    return (
      <Textarea
        className='min-h-28 text-base'
        value={typeof value === 'string' ? value : ''}
        onChange={event => onChange(event.target.value)}
        rows={4}
        required={question.required}
      />
    );
  }

  if (question.type === 'select') {
    return (
      <select
        className='min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base'
        value={typeof value === 'string' ? value : ''}
        onChange={event => onChange(event.target.value)}
        required={question.required}
      >
        <option value=''>選択してください</option>
        {question.options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (question.type === 'multiselect') {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div className='grid gap-2'>
        {question.options.map(option => (
          <label
            key={option}
            className='flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700'
          >
            <input
              type='checkbox'
              checked={selectedValues.includes(option)}
              onChange={event => {
                const nextValues = event.target.checked
                  ? [...selectedValues, option]
                  : selectedValues.filter(item => item !== option);
                onChange(nextValues);
              }}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === 'boolean') {
    return (
      <label className='flex min-h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700'>
        <input
          type='checkbox'
          checked={value === true}
          onChange={event => onChange(event.target.checked)}
        />
        はい
      </label>
    );
  }

  return (
    <Input
      className='min-h-12 text-base'
      value={typeof value === 'string' ? value : ''}
      onChange={event => onChange(event.target.value)}
      required={question.required}
    />
  );
}

function TurnstileWidget({
  siteKey,
  resetSignal,
  onTokenChange,
}: {
  siteKey: string;
  resetSignal: number;
  onTokenChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    onTokenChangeRef.current(null);

    const renderWidget = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled) return;

        const container = containerRef.current;
        const api = window.turnstile;
        if (!container || !api) {
          throw new Error('Turnstile API is unavailable');
        }

        if (widgetIdRef.current && api.remove) {
          api.remove(widgetIdRef.current);
        }
        container.replaceChildren();

        widgetIdRef.current = api.render(container, {
          sitekey: siteKey,
          callback: token => {
            if (!cancelled) {
              onTokenChangeRef.current(token);
            }
          },
          'expired-callback': () => {
            if (!cancelled) {
              onTokenChangeRef.current(null);
            }
          },
          'error-callback': () => {
            if (!cancelled) {
              onTokenChangeRef.current(null);
              setLoadError(true);
            }
          },
          theme: 'light',
          size: 'flexible',
        });
      } catch {
        if (!cancelled) {
          setLoadError(true);
          onTokenChangeRef.current(null);
        }
      }
    };

    void renderWidget();

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      const api = window.turnstile;
      if (widgetId && api?.remove) {
        api.remove(widgetId);
      }
      widgetIdRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, [siteKey]);

  useEffect(() => {
    const widgetId = widgetIdRef.current;
    const api = window.turnstile;
    if (!widgetId || !api) return;
    api.reset(widgetId);
    onTokenChangeRef.current(null);
  }, [resetSignal]);

  return (
    <div className='rounded-md border border-slate-200 bg-white p-3'>
      <div ref={containerRef} className='min-h-[65px]' />
      {loadError && (
        <p className='mt-2 text-sm text-amber-700' role='status'>
          スパム対策の確認を読み込めません。ページを再読み込みしてください。
        </p>
      )}
    </div>
  );
}

export function PublicBookingForm({
  clinicId,
  embedded = false,
  previewMode = false,
  bookingFormOverride,
  campaignId,
}: PublicBookingFormProps) {
  const todayString = useMemo(() => toJSTDateString(), []);
  const dateOptions = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) =>
        addJSTCalendarDays(todayString, index)
      ),
    [todayString]
  );

  const [step, setStep] = useState<WizardStep>(1);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
    message: null,
  });

  const [formData, setFormData] = useState({
    customerName: '',
    customerNameKana: '',
    customerPhone: '',
    customerEmail: '',
    birthDate: '',
    gender: '',
    menuId: '',
    resourceId: ANY_RESOURCE_ID,
    date: todayString,
    time: '',
    notes: '',
  });
  const [questionResponses, setQuestionResponses] = useState<
    Record<string, BookingFormResponseValue>
  >({});
  const [consentResponses, setConsentResponses] = useState<
    Record<string, boolean>
  >({});
  const [lineIdToken, setLineIdToken] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

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
        const [menuData, resourceData, bookingFormData] = await Promise.all([
          fetchJson<{ clinic_name: string; menus: PublicMenu[] }>(
            urls.menus,
            controller.signal
          ),
          fetchJson<{ clinic_name: string; resources: PublicResource[] }>(
            urls.resources,
            controller.signal
          ),
          bookingFormOverride
            ? Promise.resolve(bookingFormOverride)
            : fetchJson<PublicBookingFormSettings>(
                urls.bookingForm,
                controller.signal
              ).catch(() => DEFAULT_PUBLIC_BOOKING_FORM),
        ]);

        const nextData = {
          clinicName: menuData.clinic_name || resourceData.clinic_name,
          menus: menuData.menus,
          resources: resourceData.resources,
          bookingForm: bookingFormData,
        };

        setBookingData(nextData);
        setFormData(prev => ({
          ...prev,
          menuId: prev.menuId || nextData.menus[0]?.id || '',
          resourceId: ANY_RESOURCE_ID,
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
  }, [bookingFormOverride, clinicId]);

  useEffect(() => {
    const liffId = bookingData?.bookingForm.liff_id;
    setLineIdToken(null);

    if (!liffId || previewMode) {
      return;
    }

    let cancelled = false;

    const initializeLiff = async () => {
      try {
        const liff = (await import('@line/liff')).default;
        if (!liff.isInClient()) {
          return;
        }

        await liff.init({ liffId });
        if (cancelled) {
          return;
        }

        const idToken = liff.getIDToken();
        if (idToken) {
          setLineIdToken(idToken);
        }

        try {
          const profile = await liff.getProfile();
          if (cancelled || !profile.displayName) {
            return;
          }
          setFormData(prev =>
            prev.customerName.trim()
              ? prev
              : { ...prev, customerName: profile.displayName }
          );
        } catch {
          // Profile prefill is optional. Web booking must keep working.
        }
      } catch {
        setLineIdToken(null);
      }
    };

    void initializeLiff();

    return () => {
      cancelled = true;
    };
  }, [bookingData?.bookingForm.liff_id, previewMode]);

  useEffect(() => {
    setTurnstileToken(null);
    setTurnstileResetSignal(value => value + 1);
  }, [bookingData?.bookingForm.turnstile_site_key, lineIdToken]);

  useEffect(() => {
    if (!clinicId || !formData.menuId || !formData.resourceId) return;

    const controller = new AbortController();
    const loadAvailability = async () => {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      try {
        const data = await fetchJson<AvailabilityData>(
          buildAvailabilityUrl({
            clinicId,
            menuId: formData.menuId,
            resourceId: formData.resourceId,
            dateFrom: todayString,
            dateTo: addJSTCalendarDays(todayString, 13),
          }),
          controller.signal
        );
        setAvailability(data);
        setFormData(prev => {
          const selectedDay = data.days.find(day => day.date === prev.date);
          const selectedSlot = selectedDay?.slots.find(
            slot => slot.start === prev.time
          );
          if (selectedSlot?.available) return prev;
          return { ...prev, time: '' };
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAvailability(null);
        setAvailabilityError(
          error instanceof Error ? error.message : '空き枠の取得に失敗しました'
        );
      } finally {
        if (!controller.signal.aborted) {
          setAvailabilityLoading(false);
        }
      }
    };

    loadAvailability();

    return () => controller.abort();
  }, [clinicId, formData.menuId, formData.resourceId, todayString]);

  const menus = bookingData?.menus ?? EMPTY_MENUS;
  const resources = bookingData?.resources ?? EMPTY_RESOURCES;
  const bookingForm = bookingData?.bookingForm ?? DEFAULT_PUBLIC_BOOKING_FORM;
  const days = availability?.days ?? EMPTY_DAYS;

  const selectedMenu = useMemo(
    () => menus.find(menu => menu.id === formData.menuId) ?? null,
    [formData.menuId, menus]
  );

  const selectedResource = useMemo(
    () =>
      resources.find(resource => resource.id === formData.resourceId) ?? null,
    [formData.resourceId, resources]
  );

  const selectedDay = useMemo(
    () => days.find(day => day.date === formData.date) ?? null,
    [days, formData.date]
  );

  const selectedSlot = useMemo(
    () =>
      selectedDay?.slots.find(
        slot => slot.start === formData.time && slot.available
      ) ?? null,
    [formData.time, selectedDay]
  );
  const hasQuestionStep =
    bookingForm.questions.length > 0 || bookingForm.consents.length > 0;
  const isTurnstileRequired = Boolean(
    bookingForm.turnstile_site_key && !lineIdToken && !previewMode
  );
  const normalizedCampaignId = useMemo(
    () => normalizeCampaignId(campaignId),
    [campaignId]
  );

  const hasBookableChoices = menus.length > 0 && resources.length > 0;
  const canContinue = useMemo(() => {
    if (step === 1) return Boolean(formData.menuId);
    if (step === 2) {
      if (bookingForm.staffSelection === 'hidden') return true;
      if (bookingForm.staffSelection === 'required') {
        return Boolean(
          formData.resourceId && formData.resourceId !== ANY_RESOURCE_ID
        );
      }
      return Boolean(formData.resourceId);
    }
    if (step === 3) return Boolean(formData.date && formData.time);
    if (step === 4) {
      if (!formData.customerName.trim()) return false;
      if (
        bookingForm.fields.nameKana.enabled &&
        bookingForm.fields.nameKana.required &&
        !formData.customerNameKana.trim()
      ) {
        return false;
      }
      if (
        bookingForm.fields.phone.enabled &&
        bookingForm.fields.phone.required &&
        !formData.customerPhone.trim()
      ) {
        return false;
      }
      if (
        bookingForm.fields.email.enabled &&
        bookingForm.fields.email.required &&
        !formData.customerEmail.trim()
      ) {
        return false;
      }
      if (
        bookingForm.fields.birthDate.enabled &&
        bookingForm.fields.birthDate.required &&
        !formData.birthDate.trim()
      ) {
        return false;
      }
      if (
        bookingForm.fields.gender.enabled &&
        bookingForm.fields.gender.required &&
        !formData.gender.trim()
      ) {
        return false;
      }
      if (
        bookingForm.fields.notes.enabled &&
        bookingForm.fields.notes.required &&
        !formData.notes.trim()
      ) {
        return false;
      }
      return formData.customerPhone.trim().length <= 20;
    }
    if (step === 5) {
      const questionsOk = bookingForm.questions.every(question => {
        if (!question.required) return true;
        const value = questionResponses[question.id];
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'boolean') return true;
        return Array.isArray(value) && value.length > 0;
      });
      const consentsOk = bookingForm.consents.every(
        consent => !consent.required || consentResponses[consent.id] === true
      );
      return questionsOk && consentsOk;
    }
    if (step === 6) {
      return (
        !submitting &&
        !previewMode &&
        (!isTurnstileRequired || Boolean(turnstileToken))
      );
    }
    return false;
  }, [
    bookingForm,
    consentResponses,
    formData,
    isTurnstileRequired,
    previewMode,
    questionResponses,
    step,
    submitting,
    turnstileToken,
  ]);

  const setField = useCallback(
    (field: keyof typeof formData, value: string) => {
      setSubmitState({ status: 'idle', message: null });
      setFormData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const setQuestionResponse = useCallback(
    (questionId: string, value: BookingFormResponseValue) => {
      setSubmitState({ status: 'idle', message: null });
      setQuestionResponses(prev => ({ ...prev, [questionId]: value }));
    },
    []
  );

  const setConsentResponse = useCallback(
    (consentId: string, value: boolean) => {
      setSubmitState({ status: 'idle', message: null });
      setConsentResponses(prev => ({ ...prev, [consentId]: value }));
    },
    []
  );

  const validateSelectedSlot = useCallback(async () => {
    if (
      !clinicId ||
      !formData.menuId ||
      !formData.resourceId ||
      !formData.time
    ) {
      return false;
    }
    const data = await fetchJson<AvailabilityData>(
      buildAvailabilityUrl({
        clinicId,
        menuId: formData.menuId,
        resourceId: formData.resourceId,
        dateFrom: formData.date,
        dateTo: formData.date,
      })
    );
    const day = data.days.find(candidate => candidate.date === formData.date);
    const slot = day?.slots.find(
      candidate => candidate.start === formData.time
    );
    return Boolean(slot?.available);
  }, [
    clinicId,
    formData.date,
    formData.menuId,
    formData.resourceId,
    formData.time,
  ]);

  const handleSelectSlot = useCallback(
    async (slot: AvailabilitySlot) => {
      if (!slot.available || !clinicId) return;
      setAvailabilityError(null);
      try {
        setAvailabilityLoading(true);
        const previousTime = formData.time;
        setField('time', slot.start);
        const stillAvailable = await fetchJson<AvailabilityData>(
          buildAvailabilityUrl({
            clinicId,
            menuId: formData.menuId,
            resourceId: formData.resourceId,
            dateFrom: formData.date,
            dateTo: formData.date,
          })
        ).then(data => {
          const day = data.days.find(
            candidate => candidate.date === formData.date
          );
          const freshSlot = day?.slots.find(
            candidate => candidate.start === slot.start
          );
          return Boolean(freshSlot?.available);
        });

        if (!stillAvailable) {
          setField('time', previousTime);
          setAvailabilityError('選択した枠は受付できなくなりました');
        }
      } catch (error) {
        setField('time', '');
        setAvailabilityError(
          error instanceof Error ? error.message : '空き枠の確認に失敗しました'
        );
      } finally {
        setAvailabilityLoading(false);
      }
    },
    [
      clinicId,
      formData.date,
      formData.menuId,
      formData.resourceId,
      formData.time,
      setField,
    ]
  );

  const handleSubmit = useCallback(async () => {
    if (!clinicId || !selectedMenu || !canContinue) return;

    setSubmitting(true);
    setSubmitState({ status: 'idle', message: null });

    try {
      const stillAvailable = await validateSelectedSlot();
      if (!stillAvailable) {
        throw new Error('選択した枠は受付できなくなりました');
      }

      if (isTurnstileRequired && !turnstileToken) {
        throw new Error('スパム対策の確認が完了していません');
      }

      const response = await fetch('/api/public/reservations', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          customer_name: formData.customerName.trim(),
          customer_name_kana: formData.customerNameKana.trim() || undefined,
          customer_phone: formData.customerPhone.trim() || undefined,
          customer_email: formData.customerEmail.trim() || undefined,
          birth_date: formData.birthDate.trim() || undefined,
          gender: formData.gender.trim() || undefined,
          menu_id: formData.menuId,
          resource_id: formData.resourceId,
          start_time: createStartTimeIso(formData.date, formData.time),
          notes: formData.notes.trim() || undefined,
          intake_responses: Object.entries(questionResponses).map(
            ([id, value]) => ({ id, value })
          ),
          consents: consentResponses,
          line_id_token: lineIdToken ?? undefined,
          turnstile_token: isTurnstileRequired ? turnstileToken : undefined,
          campaign_id: normalizedCampaignId,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<{
        reservation_id: string;
      }>;

      if (!response.ok || !json.success) {
        throw new Error(
          json.success === false ? json.error : '予約の作成に失敗しました'
        );
      }

      setSubmitState({
        status: 'success',
        message: '予約リクエストを受け付けました。',
        reservationId: json.data.reservation_id,
      });
      setStep(7);
    } catch (error) {
      setSubmitState({
        status: 'error',
        message:
          error instanceof Error ? error.message : '予約の作成に失敗しました',
      });
      if (isTurnstileRequired) {
        setTurnstileToken(null);
        setTurnstileResetSignal(value => value + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    canContinue,
    clinicId,
    formData,
    isTurnstileRequired,
    lineIdToken,
    normalizedCampaignId,
    questionResponses,
    consentResponses,
    selectedMenu,
    turnstileToken,
    validateSelectedSlot,
  ]);

  const goBack = useCallback(() => {
    setStep(prev => {
      if (prev === 6 && !hasQuestionStep) return 4;
      return prev > 1 ? ((prev - 1) as WizardStep) : prev;
    });
  }, [hasQuestionStep]);

  const goNext = useCallback(async () => {
    if (step === 3) {
      setAvailabilityError(null);
      try {
        setAvailabilityLoading(true);
        const stillAvailable = await validateSelectedSlot();
        if (!stillAvailable) {
          setAvailabilityError('選択した枠は受付できなくなりました');
          setField('time', '');
          return;
        }
      } catch (error) {
        setAvailabilityError(
          error instanceof Error ? error.message : '空き枠の確認に失敗しました'
        );
        return;
      } finally {
        setAvailabilityLoading(false);
      }
    }

    if (step === 6) {
      await handleSubmit();
      return;
    }

    setStep(prev => {
      if (prev === 4 && !hasQuestionStep) return 6;
      return prev < 7 ? ((prev + 1) as WizardStep) : prev;
    });
  }, [handleSubmit, hasQuestionStep, setField, step, validateSelectedSlot]);

  if (loading) {
    return <BookingLoadingState embedded={embedded} />;
  }

  if (loadError || !bookingData) {
    return (
      <main
        className={
          embedded
            ? 'flex min-h-full items-center justify-center bg-slate-50 p-4'
            : 'flex min-h-screen items-center justify-center bg-slate-50 p-4'
        }
      >
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
      <main
        className={
          embedded
            ? 'flex min-h-full items-center justify-center bg-slate-50 p-4'
            : 'flex min-h-screen items-center justify-center bg-slate-50 p-4'
        }
      >
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
    <WizardShell
      embedded={embedded}
      clinicName={bookingData.clinicName}
      step={step}
    >
      {submitState.status === 'error' && (
        <div
          className='mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700'
          role='alert'
        >
          {submitState.message}
        </div>
      )}

      {step === 1 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>
              メニューを選択
            </h2>
          </div>
          <div className='grid gap-3'>
            {menus.map(menu => (
              <button
                key={menu.id}
                type='button'
                className={[
                  'rounded-md border p-4 text-left transition',
                  formData.menuId === menu.id
                    ? 'border-sky-600 bg-sky-50'
                    : 'border-slate-200 bg-white active:bg-slate-50',
                ].join(' ')}
                onClick={() => {
                  setField('menuId', menu.id);
                  setField('time', '');
                }}
              >
                <div className='font-semibold text-slate-950'>{menu.name}</div>
                <div className='mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600'>
                  <span>{menu.duration_minutes ?? 60}分</span>
                  <span>{formatPrice(menu.price)}</span>
                </div>
                {menu.description && (
                  <p className='mt-2 text-sm leading-6 text-slate-600'>
                    {menu.description}
                  </p>
                )}
              </button>
            ))}
          </div>
          <NavigationButtons
            step={step}
            canGoNext={canContinue}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 2 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>
              担当者を選択
            </h2>
          </div>
          <div className='grid gap-3'>
            {bookingForm.staffSelection === 'hidden' && (
              <div className='rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600'>
                担当者は院側で割り当てます。
              </div>
            )}
            {bookingForm.staffSelection === 'optional' && (
              <button
                type='button'
                className={[
                  'rounded-md border p-4 text-left transition',
                  formData.resourceId === ANY_RESOURCE_ID
                    ? 'border-sky-600 bg-sky-50'
                    : 'border-slate-200 bg-white active:bg-slate-50',
                ].join(' ')}
                onClick={() => {
                  setField('resourceId', ANY_RESOURCE_ID);
                  setField('time', '');
                }}
              >
                <div className='flex items-center gap-2 font-semibold text-slate-950'>
                  <UserRound className='h-4 w-4' />
                  指名なし
                </div>
                <p className='mt-2 text-sm leading-6 text-slate-600'>
                  空いている担当者を院側で割り当てます。
                </p>
              </button>
            )}
            {resources.map(resource => (
              <button
                key={resource.id}
                type='button'
                className={[
                  'rounded-md border p-4 text-left transition',
                  formData.resourceId === resource.id
                    ? 'border-sky-600 bg-sky-50'
                    : 'border-slate-200 bg-white active:bg-slate-50',
                ].join(' ')}
                onClick={() => {
                  setField('resourceId', resource.id);
                  setField('time', '');
                }}
              >
                <div className='font-semibold text-slate-950'>
                  {resource.name}
                </div>
              </button>
            ))}
          </div>
          <NavigationButtons
            step={step}
            canGoNext={canContinue}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 3 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>日時を選択</h2>
          </div>
          <div className='flex gap-2 overflow-x-auto pb-1'>
            {dateOptions.map(date => (
              <button
                key={date}
                type='button'
                className={[
                  'min-h-12 min-w-24 rounded-md border px-3 text-sm font-semibold',
                  formData.date === date
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700',
                ].join(' ')}
                onClick={() => {
                  setField('date', date);
                  setField('time', '');
                }}
              >
                {formatDateLabel(date)}
              </button>
            ))}
          </div>

          {availabilityError && (
            <div
              className='rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800'
              role='status'
            >
              {availabilityError}
            </div>
          )}

          {availabilityLoading && (
            <div className='flex min-h-28 items-center justify-center text-sm text-slate-600'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              空き枠を確認中...
            </div>
          )}

          {!availabilityLoading && selectedDay?.is_closed && (
            <div className='rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600'>
              この日は受付できる時間がありません。
            </div>
          )}

          {!availabilityLoading && selectedDay && !selectedDay.is_closed && (
            <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
              {selectedDay.slots.map(slot => (
                <button
                  key={slot.start}
                  type='button'
                  disabled={!slot.available}
                  className={[
                    'min-h-12 rounded-md border text-sm font-semibold transition',
                    formData.time === slot.start
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : slot.available
                        ? 'border-slate-200 bg-white text-slate-800 active:bg-slate-50'
                        : 'border-slate-100 bg-slate-100 text-slate-400',
                  ].join(' ')}
                  onClick={() => handleSelectSlot(slot)}
                >
                  {slot.start}
                </button>
              ))}
            </div>
          )}

          {!availabilityLoading && !selectedDay && (
            <div className='rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600'>
              空き枠を取得できませんでした。
            </div>
          )}

          <NavigationButtons
            step={step}
            canGoNext={canContinue && !availabilityLoading}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 4 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>
              患者情報を入力
            </h2>
          </div>
          <label className='space-y-2 text-sm font-semibold text-slate-800'>
            お名前
            <Input
              className='min-h-12 text-base'
              value={formData.customerName}
              onChange={event => setField('customerName', event.target.value)}
              autoComplete='name'
              enterKeyHint='next'
              placeholder='山田 太郎'
              required
            />
          </label>
          {bookingForm.fields.nameKana.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              ふりがな
              <Input
                className='min-h-12 text-base'
                value={formData.customerNameKana}
                onChange={event =>
                  setField('customerNameKana', event.target.value)
                }
                autoComplete='name'
                enterKeyHint='next'
                placeholder='やまだ たろう'
                required={bookingForm.fields.nameKana.required}
              />
            </label>
          )}
          {bookingForm.fields.phone.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              電話番号
              <Input
                className='min-h-12 text-base'
                type='tel'
                value={formData.customerPhone}
                onChange={event =>
                  setField('customerPhone', event.target.value)
                }
                autoComplete='tel'
                enterKeyHint='next'
                inputMode='tel'
                placeholder='09012345678'
                required={bookingForm.fields.phone.required}
              />
            </label>
          )}
          {bookingForm.fields.email.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              メールアドレス
              <Input
                className='min-h-12 text-base'
                type='email'
                value={formData.customerEmail}
                onChange={event =>
                  setField('customerEmail', event.target.value)
                }
                autoComplete='email'
                enterKeyHint='next'
                inputMode='email'
                placeholder={bookingForm.fields.email.required ? '' : '任意'}
                required={bookingForm.fields.email.required}
              />
            </label>
          )}
          {bookingForm.fields.birthDate.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              生年月日
              <Input
                className='min-h-12 text-base'
                type='date'
                value={formData.birthDate}
                onChange={event => setField('birthDate', event.target.value)}
                required={bookingForm.fields.birthDate.required}
              />
            </label>
          )}
          {bookingForm.fields.gender.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              性別
              <select
                className='min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base'
                value={formData.gender}
                onChange={event => setField('gender', event.target.value)}
                required={bookingForm.fields.gender.required}
              >
                <option value=''>選択してください</option>
                <option value='female'>女性</option>
                <option value='male'>男性</option>
                <option value='other'>その他</option>
                <option value='no_answer'>回答しない</option>
              </select>
            </label>
          )}
          {bookingForm.fields.notes.enabled && (
            <label className='space-y-2 text-sm font-semibold text-slate-800'>
              相談内容・メモ
              <Textarea
                className='min-h-28 text-base'
                value={formData.notes}
                onChange={event => setField('notes', event.target.value)}
                enterKeyHint='done'
                placeholder='症状や相談したい内容があれば入力してください'
                rows={4}
                required={bookingForm.fields.notes.required}
              />
            </label>
          )}
          <NavigationButtons
            step={step}
            canGoNext={canContinue}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 5 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>質問項目</h2>
          </div>
          {bookingForm.questions.length === 0 &&
          bookingForm.consents.length === 0 ? (
            <div className='rounded-md border border-dashed border-slate-300 p-5 text-sm leading-6 text-slate-600'>
              現在、追加の質問はありません。
            </div>
          ) : (
            <div className='space-y-4'>
              {bookingForm.questions.map(question => (
                <label
                  key={question.id}
                  className='space-y-2 text-sm font-semibold text-slate-800'
                >
                  <span>
                    {question.label}
                    {question.required && (
                      <span className='ml-1 text-red-600'>*</span>
                    )}
                  </span>
                  <QuestionInput
                    question={question}
                    value={questionResponses[question.id]}
                    onChange={value => setQuestionResponse(question.id, value)}
                  />
                </label>
              ))}
              {bookingForm.consents.map(consent => (
                <label
                  key={consent.id}
                  className='flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700'
                >
                  <input
                    className='mt-1'
                    type='checkbox'
                    checked={consentResponses[consent.id] === true}
                    onChange={event =>
                      setConsentResponse(consent.id, event.target.checked)
                    }
                    required={consent.required}
                  />
                  <span>
                    {consent.label}
                    {consent.required && (
                      <span className='ml-1 text-red-600'>*</span>
                    )}
                    {consent.linkUrl && (
                      <a
                        className='ml-2 text-sky-700 underline'
                        href={consent.linkUrl}
                        target='_blank'
                        rel='noreferrer'
                      >
                        確認
                      </a>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          <NavigationButtons
            step={step}
            canGoNext={canContinue}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 6 && (
        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-slate-950'>確認</h2>
          </div>
          <dl className='divide-y divide-slate-200 rounded-md border border-slate-200 text-sm'>
            <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
              <dt className='text-slate-500'>メニュー</dt>
              <dd className='font-medium text-slate-900'>
                {selectedMenu?.name}
              </dd>
            </div>
            <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
              <dt className='text-slate-500'>担当</dt>
              <dd className='font-medium text-slate-900'>
                {selectedResource?.name ??
                  getResourceLabel(formData.resourceId, resources)}
              </dd>
            </div>
            <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
              <dt className='text-slate-500'>日時</dt>
              <dd className='font-medium text-slate-900'>
                {formatDateLabel(formData.date)} {formData.time}
              </dd>
            </div>
            <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
              <dt className='text-slate-500'>お名前</dt>
              <dd className='font-medium text-slate-900'>
                {formData.customerName}
              </dd>
            </div>
            {bookingForm.fields.phone.enabled && (
              <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
                <dt className='text-slate-500'>電話番号</dt>
                <dd className='font-medium text-slate-900'>
                  {formData.customerPhone}
                </dd>
              </div>
            )}
            {bookingForm.fields.nameKana.enabled &&
              formData.customerNameKana && (
                <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
                  <dt className='text-slate-500'>ふりがな</dt>
                  <dd className='font-medium text-slate-900'>
                    {formData.customerNameKana}
                  </dd>
                </div>
              )}
            {bookingForm.fields.email.enabled && formData.customerEmail && (
              <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
                <dt className='text-slate-500'>メール</dt>
                <dd className='font-medium text-slate-900'>
                  {formData.customerEmail}
                </dd>
              </div>
            )}
            {bookingForm.fields.birthDate.enabled && formData.birthDate && (
              <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
                <dt className='text-slate-500'>生年月日</dt>
                <dd className='font-medium text-slate-900'>
                  {formData.birthDate}
                </dd>
              </div>
            )}
            {bookingForm.fields.gender.enabled && formData.gender && (
              <div className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'>
                <dt className='text-slate-500'>性別</dt>
                <dd className='font-medium text-slate-900'>
                  {formData.gender}
                </dd>
              </div>
            )}
            {bookingForm.questions.map(question => {
              const value = questionResponses[question.id];
              if (formatResponseValue(value).length === 0) return null;
              return (
                <div
                  key={question.id}
                  className='grid grid-cols-[7rem_1fr] gap-3 px-3 py-3'
                >
                  <dt className='text-slate-500'>{question.label}</dt>
                  <dd className='font-medium text-slate-900'>
                    {formatResponseValue(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className='rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700'>
            送信時に空き枠を再確認します。院側で確認後、未確定予約として受け付けられます。
          </div>
          {previewMode && (
            <div className='rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800'>
              プレビューでは予約送信を無効化しています。
            </div>
          )}
          {isTurnstileRequired && bookingForm.turnstile_site_key && (
            <TurnstileWidget
              siteKey={bookingForm.turnstile_site_key}
              resetSignal={turnstileResetSignal}
              onTokenChange={setTurnstileToken}
            />
          )}
          <NavigationButtons
            step={step}
            canGoNext={canContinue}
            submitting={submitting}
            onBack={goBack}
            onNext={goNext}
          />
        </section>
      )}

      {step === 7 && submitState.status === 'success' && (
        <section className='space-y-5 py-4 text-center'>
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
          {bookingForm.completionMessage && (
            <div className='rounded-md border border-sky-100 bg-sky-50 p-3 text-sm leading-6 text-sky-800'>
              {bookingForm.completionMessage}
            </div>
          )}
          {bookingForm.oa_basic_id && (
            <a
              className='inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#06C755] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#05a848] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755] focus-visible:ring-offset-2'
              href={buildLineFriendAddUrl(bookingForm.oa_basic_id)}
              target='_blank'
              rel='noreferrer'
            >
              <MessageCircle className='h-4 w-4' />
              LINEで友だち追加
            </a>
          )}
          <div className='space-y-2 rounded-md border border-slate-200 p-4 text-left text-sm leading-6 text-slate-700'>
            <div className='flex items-center gap-2 font-semibold text-slate-900'>
              <CalendarDays className='h-4 w-4' />
              注意事項
            </div>
            <p>予約時間の5分前を目安にご来院ください。</p>
            <p>
              変更やキャンセルが必要な場合は、できるだけ早めに院へご連絡ください。
            </p>
          </div>
          <div className='space-y-2 rounded-md border border-slate-200 p-4 text-left text-sm leading-6 text-slate-700'>
            <div className='flex items-center gap-2 font-semibold text-slate-900'>
              <Clock className='h-4 w-4' />
              キャンセルポリシー
            </div>
            <p>
              直前のキャンセルや無断キャンセルは、次回以降の予約受付に影響する場合があります。
            </p>
          </div>
        </section>
      )}
    </WizardShell>
  );
}

export default function PublicBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clinicId = getFirstParam(params?.clinic_id);

  return (
    <PublicBookingForm clinicId={clinicId} campaignId={searchParams.get('c')} />
  );
}

'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { toJSTDateString } from '@/lib/jst';
import {
  deriveLegacyBillingType,
  deriveRevenueContextCodeFromBillingType,
  REVENUE_CONTEXT_LABELS,
  SELECTABLE_REVENUE_CONTEXT_CODES,
  type AmountSource,
  type BillingType,
  type EstimateStatus,
  type RevenueContextSource,
  type SelectableRevenueContextCode,
} from '@/lib/revenue-context';
import {
  isPatientBurdenRate,
  PATIENT_BURDEN_RATES,
  type PatientBurdenRate,
} from '@/lib/customer-insurance-coverage';

type MenuBillingCalculationMethod =
  | 'fixed_amount'
  | 'insurance_master'
  | 'manual_estimate';

interface ActiveMenuBillingProfile {
  id: string;
  revenueContextCode: SelectableRevenueContextCode;
  calculationMethod: MenuBillingCalculationMethod;
  fixedAmountYen: number | null;
  defaultPatientBurdenRate: PatientBurdenRate | null;
  requiresReview: boolean;
}

interface DailyReportPricingContext {
  currentPatientBurdenRate: PatientBurdenRate | null;
  coverageResolutionSource: 'customer_default' | 'missing' | 'ambiguous' | null;
  coverageReviewMessage: string | null;
  activeMenuBillingProfile: ActiveMenuBillingProfile | null;
}

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
  revenueContextCode: SelectableRevenueContextCode;
  revenueContextSource: RevenueContextSource;
  amountSource: AmountSource;
  estimateStatus: EstimateStatus;
  menuBillingProfileId: string | null;
  customerInsuranceCoverageId: string | null;
  patientBurdenRate: PatientBurdenRate | null;
  coverageResolutionSource: string | null;
  pricingSnapshotStatus: string;
  pricingConfirmedAt: string | null;
  pricingContext: DailyReportPricingContext | null;
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
  revenueContextCode: SelectableRevenueContextCode;
  paymentMethodId: string;
}

type ItemPatchPayload = {
  patientName?: string;
  treatmentName?: string;
  durationMinutes?: number;
  fee?: number;
  billingType?: BillingType;
  revenueContextCode?: SelectableRevenueContextCode;
  paymentMethodId?: string | null;
  nextReservationStartTime?: string | null;
  notes?: string | null;
};

type PricingConfirmResponse = {
  dailyReportItemId: string;
  revenueEstimateId: string;
  estimateStatus: EstimateStatus;
  estimatedTotal: number;
  pricingSnapshotStatus: string;
  patientBurdenRate: PatientBurdenRate | null;
};

type PricingPreview = {
  contextLabel: string;
  statusLabel: string;
  lines: string[];
  warning: string | null;
};

type LoadItemsOptions = {
  signal?: AbortSignal;
  includePaymentMethods?: boolean;
  showSpinner?: boolean;
};

type ParsedItemsResponse = {
  items: DailyReportItem[];
  paymentMethods?: PaymentMethod[];
};

const emptyNewItem: NewItemForm = {
  patientName: '',
  treatmentName: '',
  durationMinutes: 0,
  fee: 0,
  billingType: 'insurance',
  revenueContextCode: 'insurance',
  paymentMethodId: '',
};

const managerRoles = new Set(['admin', 'clinic_admin', 'manager']);

function getTodayDateInputValue() {
  // revenue 集計が JST 基準で today を判定するため、入力側も JST に合わせる。
  // これにより report_date と /api/revenue の dateRange.lte が確実に一致する。
  return toJSTDateString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBillingType(value: unknown): value is BillingType {
  return value === 'insurance' || value === 'private';
}

function isRevenueContextCode(
  value: unknown
): value is SelectableRevenueContextCode {
  return SELECTABLE_REVENUE_CONTEXT_CODES.some(code => code === value);
}

function isEstimateStatus(value: unknown): value is EstimateStatus {
  return (
    value === 'not_calculated' ||
    value === 'calculated' ||
    value === 'needs_review' ||
    value === 'blocked' ||
    value === 'overridden'
  );
}

function isMenuBillingCalculationMethod(
  value: unknown
): value is MenuBillingCalculationMethod {
  return (
    value === 'fixed_amount' ||
    value === 'insurance_master' ||
    value === 'manual_estimate'
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullablePatientBurdenRate(
  value: unknown
): value is PatientBurdenRate | null {
  return (
    value === null || (typeof value === 'number' && isPatientBurdenRate(value))
  );
}

function isActiveMenuBillingProfile(
  value: unknown
): value is ActiveMenuBillingProfile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRevenueContextCode(value.revenueContextCode) &&
    isMenuBillingCalculationMethod(value.calculationMethod) &&
    (value.fixedAmountYen === null ||
      typeof value.fixedAmountYen === 'number') &&
    isNullablePatientBurdenRate(value.defaultPatientBurdenRate) &&
    typeof value.requiresReview === 'boolean'
  );
}

function isDailyReportPricingContext(
  value: unknown
): value is DailyReportPricingContext {
  return (
    isRecord(value) &&
    isNullablePatientBurdenRate(value.currentPatientBurdenRate) &&
    (value.coverageResolutionSource === null ||
      value.coverageResolutionSource === 'customer_default' ||
      value.coverageResolutionSource === 'missing' ||
      value.coverageResolutionSource === 'ambiguous') &&
    isNullableString(value.coverageReviewMessage) &&
    (value.activeMenuBillingProfile === null ||
      isActiveMenuBillingProfile(value.activeMenuBillingProfile))
  );
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
    isBillingType(value.billingType) &&
    isRevenueContextCode(value.revenueContextCode) &&
    isNullableString(value.menuBillingProfileId) &&
    isNullableString(value.customerInsuranceCoverageId) &&
    isNullablePatientBurdenRate(value.patientBurdenRate) &&
    isNullableString(value.coverageResolutionSource) &&
    typeof value.pricingSnapshotStatus === 'string' &&
    isNullableString(value.pricingConfirmedAt) &&
    (value.pricingContext === null ||
      isDailyReportPricingContext(value.pricingContext))
  );
}

function getReviewTagCode(
  revenueContextCode: SelectableRevenueContextCode
): 'TRAFFIC_ACCIDENT_REVIEW' | 'WORKERS_COMP_REVIEW' | null {
  if (revenueContextCode === 'traffic_accident') {
    return 'TRAFFIC_ACCIDENT_REVIEW';
  }
  if (revenueContextCode === 'workers_comp') {
    return 'WORKERS_COMP_REVIEW';
  }
  return null;
}

function formatYen(amount: number) {
  return `¥${Math.round(amount).toLocaleString()}`;
}

function formatPatientBurdenRate(rate: PatientBurdenRate) {
  return rate === 0 ? '0割' : `${rate / 10}割`;
}

function parsePatientBurdenRateOverride(
  value: string
): PatientBurdenRate | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return isPatientBurdenRate(parsed) ? parsed : null;
}

function getPricingSnapshotStatusLabel(status: string) {
  switch (status) {
    case 'confirmed':
      return '確定済み';
    case 'needs_review':
      return '要確認';
    case 'recalculated':
      return '再計算済み';
    default:
      return '未確定';
  }
}

function resolvePreviewBurdenRate(
  item: DailyReportItem,
  override: PatientBurdenRate | null
): { rate: PatientBurdenRate | null; sourceLabel: string } {
  if (override !== null) {
    return { rate: override, sourceLabel: '今回上書き' };
  }

  if (item.patientBurdenRate !== null) {
    return { rate: item.patientBurdenRate, sourceLabel: '確定済み' };
  }

  const currentRate = item.pricingContext?.currentPatientBurdenRate ?? null;
  if (currentRate !== null) {
    return { rate: currentRate, sourceLabel: '患者設定' };
  }

  const profileRate =
    item.pricingContext?.activeMenuBillingProfile?.defaultPatientBurdenRate ??
    null;
  if (profileRate !== null) {
    return { rate: profileRate, sourceLabel: 'メニュー標準' };
  }

  return { rate: null, sourceLabel: '未設定' };
}

function buildPricingPreview(
  item: DailyReportItem,
  override: PatientBurdenRate | null
): PricingPreview {
  const statusLabel = getPricingSnapshotStatusLabel(item.pricingSnapshotStatus);

  if (item.revenueContextCode === 'insurance') {
    const burden = resolvePreviewBurdenRate(item, override);
    if (burden.rate === null) {
      return {
        contextLabel: '健康保険: 負担割合の確認が必要',
        statusLabel,
        lines: [`療養費見込み: ${formatYen(item.fee)}`],
        warning:
          item.pricingContext?.coverageReviewMessage ??
          '患者負担割合を選んで金額を確定してください。',
      };
    }

    const patientCopay = Math.round((item.fee * burden.rate) / 100);
    const insurerReceivable = Math.max(0, item.fee - patientCopay);
    return {
      contextLabel: `${burden.sourceLabel}: ${formatPatientBurdenRate(
        burden.rate
      )}`,
      statusLabel,
      lines: [
        `療養費見込み: ${formatYen(item.fee)}`,
        `窓口負担見込み: ${formatYen(patientCopay)}`,
        `保険者請求見込み: ${formatYen(insurerReceivable)}`,
      ],
      warning: null,
    };
  }

  if (item.revenueContextCode === 'traffic_accident') {
    return {
      contextLabel: '交通事故: 手入力概算・要確認',
      statusLabel,
      lines: [`経営概算: ${formatYen(item.fee)}`],
      warning:
        '請求確定前の経営分析用です。公式マスタ自動単価として扱いません。',
    };
  }

  if (item.revenueContextCode === 'workers_comp') {
    return {
      contextLabel: '労災: 手入力概算・要確認',
      statusLabel,
      lines: [`経営概算: ${formatYen(item.fee)}`],
      warning: 'Phase 4Aでは労災の自動算定は行わず、手入力概算を保存します。',
    };
  }

  return {
    contextLabel:
      item.revenueContextCode === 'private'
        ? '自費: 入力金額で売上計上'
        : `${REVENUE_CONTEXT_LABELS[item.revenueContextCode]}: 入力金額`,
    statusLabel,
    lines: [`売上見込み: ${formatYen(item.fee)}`],
    warning: null,
  };
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

function parseItemsResponse(payload: unknown): ParsedItemsResponse | null {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const data = payload.data;
  if (!isRecord(data)) {
    return null;
  }

  const items = Array.isArray(data.items)
    ? data.items.filter(isDailyReportItem)
    : [];
  const paymentMethods = Array.isArray(data.paymentMethods)
    ? data.paymentMethods.filter(isPaymentMethod)
    : undefined;

  return paymentMethods ? { items, paymentMethods } : { items };
}

function isPricingConfirmResponse(
  value: unknown
): value is PricingConfirmResponse {
  return (
    isRecord(value) &&
    typeof value.dailyReportItemId === 'string' &&
    typeof value.revenueEstimateId === 'string' &&
    isEstimateStatus(value.estimateStatus) &&
    typeof value.estimatedTotal === 'number' &&
    typeof value.pricingSnapshotStatus === 'string' &&
    isNullablePatientBurdenRate(value.patientBurdenRate)
  );
}

function getCoverageResolutionSourceAfterConfirm(
  item: DailyReportItem,
  patientBurdenRateOverride: PatientBurdenRate | null,
  patientBurdenRate: PatientBurdenRate | null
) {
  if (patientBurdenRate === null) {
    return item.coverageResolutionSource;
  }

  if (patientBurdenRateOverride !== null) {
    return 'manual';
  }

  return (
    item.pricingContext?.coverageResolutionSource ??
    item.coverageResolutionSource
  );
}

function normalizeComparableDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function isSameDateTime(left: string | null, right: string | null) {
  return (
    normalizeComparableDateTime(left) === normalizeComparableDateTime(right)
  );
}

function getChangedItemPatch(
  savedItem: DailyReportItem,
  patch: ItemPatchPayload
): ItemPatchPayload | null {
  const changed: ItemPatchPayload = {};

  if (
    patch.patientName !== undefined &&
    patch.patientName !== savedItem.patientName
  ) {
    changed.patientName = patch.patientName;
  }
  if (
    patch.treatmentName !== undefined &&
    patch.treatmentName !== savedItem.treatmentName
  ) {
    changed.treatmentName = patch.treatmentName;
  }
  if (
    patch.durationMinutes !== undefined &&
    patch.durationMinutes !== savedItem.durationMinutes
  ) {
    changed.durationMinutes = patch.durationMinutes;
  }
  if (patch.fee !== undefined && patch.fee !== savedItem.fee) {
    changed.fee = patch.fee;
  }
  if (
    patch.billingType !== undefined &&
    patch.billingType !== savedItem.billingType
  ) {
    changed.billingType = patch.billingType;
  }
  if (
    patch.revenueContextCode !== undefined &&
    patch.revenueContextCode !== savedItem.revenueContextCode
  ) {
    changed.revenueContextCode = patch.revenueContextCode;
  }
  if (
    patch.paymentMethodId !== undefined &&
    patch.paymentMethodId !== savedItem.paymentMethodId
  ) {
    changed.paymentMethodId = patch.paymentMethodId;
  }
  if (
    patch.nextReservationStartTime !== undefined &&
    !isSameDateTime(
      patch.nextReservationStartTime,
      savedItem.nextReservationStartTime
    )
  ) {
    changed.nextReservationStartTime = patch.nextReservationStartTime;
  }
  if (patch.notes !== undefined && patch.notes !== savedItem.notes) {
    changed.notes = patch.notes;
  }

  return Object.keys(changed).length > 0 ? changed : null;
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
  const [patientBurdenOverrides, setPatientBurdenOverrides] = useState<
    Record<string, string>
  >({});
  const [coverageUpdateIntent, setCoverageUpdateIntent] = useState<
    Record<string, boolean>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [taggingItemId, setTaggingItemId] = useState<string | null>(null);
  const [confirmingPricingItemId, setConfirmingPricingItemId] = useState<
    string | null
  >(null);
  const savedItemsRef = useRef<Map<string, DailyReportItem>>(new Map());
  const loadRequestIdRef = useRef(0);

  const hasClinic = Boolean(clinicId);
  const isLoading = profileLoading || isLoadingItems;
  const errorMessage = profileError;

  const replaceSavedItems = useCallback((nextItems: DailyReportItem[]) => {
    savedItemsRef.current = new Map(
      nextItems.map(item => [item.id, item] as const)
    );
  }, []);

  const loadItems = useCallback(
    async (options: LoadItemsOptions = {}) => {
      const {
        signal,
        includePaymentMethods = true,
        showSpinner = true,
      } = options;
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      if (!clinicId) {
        setItems([]);
        setPaymentMethods([]);
        setNextReservationDrafts({});
        replaceSavedItems([]);
        setIsLoadingItems(false);
        return;
      }

      if (showSpinner) {
        setIsLoadingItems(true);
      }
      setLoadError(null);

      try {
        const params = new URLSearchParams({
          clinic_id: clinicId,
          report_date: date,
          include_pricing_context: 'true',
        });
        if (!includePaymentMethods) {
          params.set('include_payment_methods', 'false');
        }

        const response = await fetch(`/api/daily-reports/items?${params}`, {
          signal,
        });
        const payload = await readJson(response);

        if (signal?.aborted || requestId !== loadRequestIdRef.current) {
          return;
        }

        if (!response.ok) {
          setLoadError(
            getApiErrorMessage(payload, '日報明細の取得に失敗しました')
          );
          return;
        }

        const parsed = parseItemsResponse(payload);
        if (!parsed) {
          setLoadError('日報明細の取得に失敗しました');
          return;
        }

        setItems(parsed.items);
        replaceSavedItems(parsed.items);
        if (parsed.paymentMethods) {
          setPaymentMethods(parsed.paymentMethods);
        }
        setNextReservationDrafts(buildNextReservationDrafts(parsed.items));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : '日報明細の取得に失敗しました'
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setIsLoadingItems(false);
        }
      }
    },
    [clinicId, date, replaceSavedItems]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadItems({ signal: controller.signal });
    return () => controller.abort();
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

    const savedItem = savedItemsRef.current.get(id);
    const changedPatch = savedItem
      ? getChangedItemPatch(savedItem, patch)
      : patch;
    if (!changedPatch) {
      setFormError(null);
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
          ...changedPatch,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '明細の保存に失敗しました'));
        await loadItems({ includePaymentMethods: false, showSpinner: false });
        return;
      }

      if (
        isRecord(payload) &&
        payload.success === true &&
        isDailyReportItem(payload.data)
      ) {
        const savedItem = payload.data;
        savedItemsRef.current.set(id, savedItem);
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
      await loadItems({ includePaymentMethods: false, showSpinner: false });
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
          revenueContextCode: newItem.revenueContextCode,
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
        savedItemsRef.current.set(createdItem.id, createdItem);
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
      savedItemsRef.current.delete(id);
      setNextReservationDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setPatientBurdenOverrides(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCoverageUpdateIntent(prev => {
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

  const addReviewTag = async (item: DailyReportItem) => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    const tagCode = getReviewTagCode(item.revenueContextCode);
    if (!tagCode) {
      return;
    }

    setTaggingItemId(item.id);
    setFormError(null);

    try {
      const response = await fetch(`/api/daily-reports/items/${item.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          tagCode,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, 'タグの追加に失敗しました'));
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'タグの追加に失敗しました'
      );
    } finally {
      setTaggingItemId(null);
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

  const confirmItemPricing = async (item: DailyReportItem) => {
    if (!clinicId) {
      setFormError('アクセス可能なクリニックが確認できません');
      return;
    }

    const overrideValue = patientBurdenOverrides[item.id] ?? '';
    const patientBurdenRateOverride =
      parsePatientBurdenRateOverride(overrideValue);
    if (overrideValue && patientBurdenRateOverride === null) {
      setFormError('負担割合は0割、1割、2割、3割から選択してください');
      return;
    }

    const isManualEstimate =
      item.revenueContextCode === 'traffic_accident' ||
      item.revenueContextCode === 'workers_comp';

    setConfirmingPricingItemId(item.id);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/daily-reports/items/${item.id}/pricing/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            patientBurdenRateOverride,
            manualEstimatedAmount: isManualEstimate ? item.fee : null,
            updateCustomerCoverage:
              item.revenueContextCode === 'insurance' &&
              Boolean(coverageUpdateIntent[item.id]) &&
              patientBurdenRateOverride !== null,
            confirmationNote:
              item.revenueContextCode === 'insurance' &&
              Boolean(coverageUpdateIntent[item.id])
                ? '日報入力画面で負担割合を確認'
                : null,
          }),
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        setFormError(getApiErrorMessage(payload, '金額確定に失敗しました'));
        return;
      }

      if (
        !isRecord(payload) ||
        payload.success !== true ||
        !isPricingConfirmResponse(payload.data)
      ) {
        setFormError('金額確定結果の形式が正しくありません');
        return;
      }

      setPatientBurdenOverrides(prev => ({
        ...prev,
        [item.id]: '',
      }));
      setCoverageUpdateIntent(prev => ({
        ...prev,
        [item.id]: false,
      }));

      const itemPatch: Partial<DailyReportItem> = {
        estimateStatus: payload.data.estimateStatus,
        amountSource: 'estimate',
        pricingSnapshotStatus: payload.data.pricingSnapshotStatus,
        patientBurdenRate: payload.data.patientBurdenRate,
        coverageResolutionSource: getCoverageResolutionSourceAfterConfirm(
          item,
          patientBurdenRateOverride,
          payload.data.patientBurdenRate
        ),
      };
      const savedItem = savedItemsRef.current.get(item.id);
      if (savedItem) {
        savedItemsRef.current.set(item.id, { ...savedItem, ...itemPatch });
      }
      updateItemLocal(item.id, itemPatch);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '金額確定に失敗しました'
      );
    } finally {
      setConfirmingPricingItemId(null);
    }
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
      confirmingPricingItemId !== null ||
      isAddingItem ||
      isSavingReport
    );
  }, [
    hasClinic,
    isLoading,
    errorMessage,
    items.length,
    savingItemId,
    confirmingPricingItemId,
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
                    setNewItem(prev => {
                      const billingType = isBillingType(event.target.value)
                        ? event.target.value
                        : 'private';
                      return {
                        ...prev,
                        billingType,
                        revenueContextCode:
                          deriveRevenueContextCodeFromBillingType(billingType),
                      };
                    })
                  }
                  disabled={isAddingItem}
                >
                  <option value='insurance'>保険診療</option>
                  <option value='private'>自費診療</option>
                </select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='newRevenueContext'>売上文脈</Label>
                <select
                  id='newRevenueContext'
                  className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                  value={newItem.revenueContextCode}
                  onChange={event => {
                    const revenueContextCode = isRevenueContextCode(
                      event.target.value
                    )
                      ? event.target.value
                      : 'private';
                    setNewItem(prev => ({
                      ...prev,
                      revenueContextCode,
                      billingType: deriveLegacyBillingType(revenueContextCode),
                    }));
                  }}
                  disabled={isAddingItem}
                >
                  {SELECTABLE_REVENUE_CONTEXT_CODES.map(code => (
                    <option key={code} value={code}>
                      {REVENUE_CONTEXT_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div className='md:col-span-1 flex items-end'>
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
                  const itemPricingConfirming =
                    confirmingPricingItemId === item.id;
                  const nextReservationEnabled = canUseNextReservation(item);
                  const burdenOverrideValue =
                    patientBurdenOverrides[item.id] ?? '';
                  const selectedBurdenOverride =
                    parsePatientBurdenRateOverride(burdenOverrideValue);
                  const pricingPreview = buildPricingPreview(
                    item,
                    selectedBurdenOverride
                  );
                  const canUpdateCustomerCoverage =
                    item.revenueContextCode === 'insurance' &&
                    item.customerId !== null &&
                    selectedBurdenOverride !== null;
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
                              const revenueContextCode =
                                deriveRevenueContextCodeFromBillingType(
                                  billingType
                                );
                              updateItemLocal(item.id, {
                                billingType,
                                revenueContextCode,
                              });
                              void persistItemPatch(item.id, { billingType });
                            }}
                            disabled={itemSaving}
                          >
                            <option value='insurance'>保険</option>
                            <option value='private'>自費</option>
                          </select>
                        </div>
                        <div className='space-y-1'>
                          <Label htmlFor={`context-${item.id}`}>売上文脈</Label>
                          <select
                            id={`context-${item.id}`}
                            className='w-full h-10 px-3 border rounded bg-white dark:bg-gray-900'
                            value={item.revenueContextCode}
                            onChange={event => {
                              const revenueContextCode = isRevenueContextCode(
                                event.target.value
                              )
                                ? event.target.value
                                : 'private';
                              const billingType =
                                deriveLegacyBillingType(revenueContextCode);
                              updateItemLocal(item.id, {
                                revenueContextCode,
                                billingType,
                              });
                              void persistItemPatch(item.id, {
                                revenueContextCode,
                              });
                            }}
                            disabled={itemSaving}
                          >
                            {SELECTABLE_REVENUE_CONTEXT_CODES.map(code => (
                              <option key={code} value={code}>
                                {REVENUE_CONTEXT_LABELS[code]}
                              </option>
                            ))}
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
                            onClick={() =>
                              loadItems({ includePaymentMethods: false })
                            }
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
                      <div className='mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40'>
                        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                          <div className='space-y-2'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='text-sm font-semibold text-slate-900 dark:text-slate-100'>
                                会計内訳
                              </span>
                              <span className='rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'>
                                状態: {pricingPreview.statusLabel}
                              </span>
                              <span className='rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'>
                                {pricingPreview.contextLabel}
                              </span>
                            </div>
                            <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-200'>
                              {pricingPreview.lines.map(line => (
                                <span key={line}>{line}</span>
                              ))}
                            </div>
                            {pricingPreview.warning && (
                              <p className='text-xs text-amber-800 dark:text-amber-300'>
                                {pricingPreview.warning}
                              </p>
                            )}
                          </div>
                          <div className='grid grid-cols-1 gap-2 sm:grid-cols-[minmax(10rem,12rem)_auto_auto] sm:items-end'>
                            {item.revenueContextCode === 'insurance' && (
                              <>
                                <div className='space-y-1'>
                                  <Label htmlFor={`burden-override-${item.id}`}>
                                    今回の負担割合
                                  </Label>
                                  <select
                                    id={`burden-override-${item.id}`}
                                    aria-label={`${item.patientName} 負担割合の上書き`}
                                    className='h-9 w-full rounded border bg-white px-3 text-sm dark:bg-gray-900'
                                    value={burdenOverrideValue}
                                    onChange={event =>
                                      setPatientBurdenOverrides(prev => ({
                                        ...prev,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                    disabled={
                                      itemSaving || itemPricingConfirming
                                    }
                                  >
                                    <option value=''>患者設定を使う</option>
                                    {PATIENT_BURDEN_RATES.map(rate => (
                                      <option key={rate} value={rate}>
                                        {formatPatientBurdenRate(rate)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <label className='flex items-center gap-2 pb-2 text-xs text-slate-700 dark:text-slate-200'>
                                  <input
                                    type='checkbox'
                                    checked={Boolean(
                                      coverageUpdateIntent[item.id]
                                    )}
                                    onChange={event =>
                                      setCoverageUpdateIntent(prev => ({
                                        ...prev,
                                        [item.id]: event.target.checked,
                                      }))
                                    }
                                    disabled={
                                      itemSaving ||
                                      itemPricingConfirming ||
                                      !canUpdateCustomerCoverage
                                    }
                                  />
                                  患者設定にも反映
                                </label>
                              </>
                            )}
                            <Button
                              variant='outline'
                              size='sm'
                              aria-label={`${item.patientName}の金額を確定`}
                              onClick={() => void confirmItemPricing(item)}
                              disabled={itemSaving || itemPricingConfirming}
                            >
                              {itemPricingConfirming ? '確定中...' : '金額確定'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className='mt-2 flex flex-wrap gap-2 text-xs text-gray-500'>
                        <span>
                          {item.source === 'reservation'
                            ? '予約から自動反映'
                            : '手動追加'}
                        </span>
                        <span>
                          {REVENUE_CONTEXT_LABELS[item.revenueContextCode]}
                        </span>
                        {item.revenueContextSource === 'manual' && (
                          <span className='rounded border px-2 py-0.5 text-gray-700 dark:text-gray-200'>
                            手動分類
                          </span>
                        )}
                        {getReviewTagCode(item.revenueContextCode) && (
                          <span className='rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800'>
                            要確認
                          </span>
                        )}
                        {item.nextReservationId && (
                          <span>次回予約作成済み</span>
                        )}
                        {!nextReservationEnabled && (
                          <span>
                            手動追加行は予約に紐づかないため次回予約を作成できません
                          </span>
                        )}
                        {getReviewTagCode(item.revenueContextCode) && (
                          <button
                            type='button'
                            className='underline disabled:no-underline disabled:text-gray-400'
                            onClick={() => void addReviewTag(item)}
                            disabled={taggingItemId === item.id}
                          >
                            {taggingItemId === item.id
                              ? 'タグ追加中'
                              : '確認タグを追加'}
                          </button>
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

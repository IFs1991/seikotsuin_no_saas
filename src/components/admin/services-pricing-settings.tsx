'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Clock,
  CopyPlus,
  Edit,
  HardHat,
  ShieldCheck,
  TriangleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Menu } from '@/types/reservation';
import { AdminMessage } from './AdminMessage';

type MenuCategory = 'treatment' | 'massage' | 'rehabilitation' | 'other';
type RevenueContextCode =
  | 'insurance'
  | 'private'
  | 'traffic_accident'
  | 'workers_comp'
  | 'product'
  | 'ticket'
  | 'other';
type BillingCalculationMethod =
  | 'fixed_amount'
  | 'insurance_master'
  | 'manual_estimate';
type PatientBurdenRate = 0 | 10 | 20 | 30;

interface MenuFormState {
  name: string;
  description: string;
  durationMinutes: string;
  price: string;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
}

interface MenuPayload {
  clinic_id: string;
  id?: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
}

interface TemplatePayload {
  owner_clinic_id: string;
  id?: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
  displayOrder?: number;
}

interface MenuTemplate {
  id: string;
  ownerClinicId: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category?: string;
  isInsuranceApplicable: boolean;
  isActive: boolean;
  displayOrder: number;
}

interface BillingProfile {
  id: string;
  clinicId?: string;
  ownerClinicId?: string;
  menuId?: string;
  menuTemplateId?: string;
  sourceTemplateProfileId?: string | null;
  revenueContextCode: RevenueContextCode;
  calculationMethod: BillingCalculationMethod;
  fixedAmountYen: number | null;
  defaultPatientBurdenRate: PatientBurdenRate | null;
  professionType: string | null;
  requiresReview: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BillingProfileFormState {
  revenueContextCode: RevenueContextCode;
  calculationMethod: BillingCalculationMethod;
  fixedAmountYen: string;
  defaultPatientBurdenRate: '' | '0' | '10' | '20' | '30';
  professionType: string;
  requiresReview: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
}

interface BillingProfilePayload {
  revenueContextCode: RevenueContextCode;
  calculationMethod: BillingCalculationMethod;
  fixedAmountYen: number | null;
  defaultPatientBurdenRate: PatientBurdenRate | null;
  professionType: string | null;
  requiresReview: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

interface MenuBillingProfilePayload extends BillingProfilePayload {
  clinic_id: string;
}

interface TemplateBillingProfilePayload extends BillingProfilePayload {
  owner_clinic_id: string;
}

interface TemplateScope {
  templates: MenuTemplate[];
  ownerClinicId: string;
  ownerClinicName: string;
  targetClinicId: string;
  isOwnerClinic: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

type CollectionUpdater<T> = (items: T[]) => T[];
type BillingProfileMap = Record<string, BillingProfile[]>;
type BillingProfileFormMap = Record<string, BillingProfileFormState>;

const EMPTY_FORM: MenuFormState = {
  name: '',
  description: '',
  durationMinutes: '30',
  price: '0',
  category: 'treatment',
  isInsuranceApplicable: false,
  isActive: true,
};

const EMPTY_TEMPLATES: MenuTemplate[] = [];
const EMPTY_BILLING_PROFILES: BillingProfile[] = [];

const REVENUE_CONTEXT_OPTIONS: Array<{
  value: RevenueContextCode;
  label: string;
}> = [
  { value: 'insurance', label: '健康保険' },
  { value: 'private', label: '自費' },
  { value: 'traffic_accident', label: '交通事故' },
  { value: 'workers_comp', label: '労災' },
  { value: 'product', label: '物販' },
  { value: 'ticket', label: '回数券' },
  { value: 'other', label: 'その他' },
];

const CALCULATION_METHOD_OPTIONS: Array<{
  value: BillingCalculationMethod;
  label: string;
}> = [
  { value: 'insurance_master', label: '公式マスタで保険計算' },
  { value: 'fixed_amount', label: '固定金額で自費計上' },
  { value: 'manual_estimate', label: '手入力の概算として扱う' },
];

const PATIENT_BURDEN_RATE_OPTIONS: Array<{
  value: '' | '0' | '10' | '20' | '30';
  label: string;
}> = [
  { value: '', label: '未設定' },
  { value: '0', label: '0割' },
  { value: '10', label: '1割' },
  { value: '20', label: '2割' },
  { value: '30', label: '3割' },
];

const BILLING_PROFILE_PRESETS: Array<{
  key: RevenueContextCode;
  label: string;
  icon: typeof ShieldCheck;
}> = [
  { key: 'insurance', label: '保険計算', icon: ShieldCheck },
  { key: 'private', label: '自費金額', icon: CircleDollarSign },
  { key: 'traffic_accident', label: '事故概算', icon: TriangleAlert },
  { key: 'workers_comp', label: '労災概算', icon: HardHat },
];

const PublicBookingFormPreview = dynamic(
  () =>
    import('@/app/(public)/booking/[clinic_id]/page').then(
      module => module.PublicBookingForm
    ),
  {
    ssr: false,
    loading: () => (
      <div className='flex h-full items-center justify-center text-sm text-gray-600'>
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        予約フォームを読み込み中...
      </div>
    ),
  }
);

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
  const index = items.findIndex(current => current.id === item.id);
  if (index === -1) return [...items, item];

  const next = [...items];
  next[index] = item;
  return next;
};

const MENU_CATEGORIES: Array<{ value: MenuCategory; label: string }> = [
  { value: 'treatment', label: '治療' },
  { value: 'massage', label: 'マッサージ' },
  { value: 'rehabilitation', label: 'リハビリ' },
  { value: 'other', label: 'その他' },
];

const getCategoryLabel = (value?: string) =>
  MENU_CATEGORIES.find(category => category.value === value)?.label ?? 'その他';

const getRevenueContextLabel = (value: RevenueContextCode) =>
  REVENUE_CONTEXT_OPTIONS.find(option => option.value === value)?.label ??
  'その他';

const getCalculationMethodLabel = (value: BillingCalculationMethod) =>
  CALCULATION_METHOD_OPTIONS.find(option => option.value === value)?.label ??
  '未設定';

const isPricingAdminRole = (role: string | null | undefined) =>
  role === 'admin' || role === 'clinic_admin';

const isTemplatePricingAdminRole = (role: string | null | undefined) =>
  role === 'admin';

function isRevenueContextCode(value: string): value is RevenueContextCode {
  return REVENUE_CONTEXT_OPTIONS.some(option => option.value === value);
}

function isBillingCalculationMethod(
  value: string
): value is BillingCalculationMethod {
  return CALCULATION_METHOD_OPTIONS.some(option => option.value === value);
}

function isPatientBurdenRateOptionValue(
  value: string
): value is BillingProfileFormState['defaultPatientBurdenRate'] {
  return PATIENT_BURDEN_RATE_OPTIONS.some(option => option.value === value);
}

function getCurrentMonthStartDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function createEmptyBillingProfileForm(): BillingProfileFormState {
  return {
    revenueContextCode: 'insurance',
    calculationMethod: 'insurance_master',
    fixedAmountYen: '',
    defaultPatientBurdenRate: '30',
    professionType: 'judo_therapist',
    requiresReview: false,
    effectiveFrom: getCurrentMonthStartDateInputValue(),
    effectiveTo: '',
    isActive: true,
  };
}

function normalizeBillingProfileFormForMethod(
  form: BillingProfileFormState,
  calculationMethod: BillingCalculationMethod
): BillingProfileFormState {
  if (calculationMethod === 'fixed_amount') {
    return {
      ...form,
      calculationMethod,
      revenueContextCode: 'private',
      defaultPatientBurdenRate: '',
      professionType: '',
      requiresReview: false,
    };
  }

  if (calculationMethod === 'manual_estimate') {
    return {
      ...form,
      calculationMethod,
      revenueContextCode:
        form.revenueContextCode === 'workers_comp'
          ? 'workers_comp'
          : 'traffic_accident',
      fixedAmountYen: '',
      defaultPatientBurdenRate: '',
      professionType: '',
      requiresReview: true,
    };
  }

  return {
    ...form,
    calculationMethod,
    revenueContextCode: 'insurance',
    fixedAmountYen: '',
    defaultPatientBurdenRate: form.defaultPatientBurdenRate || '30',
    professionType: form.professionType || 'judo_therapist',
    requiresReview: false,
  };
}

function normalizeBillingProfileFormForPreset(
  form: BillingProfileFormState,
  revenueContextCode: RevenueContextCode
): BillingProfileFormState {
  if (revenueContextCode === 'insurance') {
    return normalizeBillingProfileFormForMethod(form, 'insurance_master');
  }

  if (revenueContextCode === 'private') {
    return normalizeBillingProfileFormForMethod(form, 'fixed_amount');
  }

  if (
    revenueContextCode === 'traffic_accident' ||
    revenueContextCode === 'workers_comp'
  ) {
    return {
      ...normalizeBillingProfileFormForMethod(form, 'manual_estimate'),
      revenueContextCode,
    };
  }

  return {
    ...form,
    revenueContextCode,
  };
}

function parsePatientBurdenRate(
  value: BillingProfileFormState['defaultPatientBurdenRate']
): PatientBurdenRate | null {
  switch (value) {
    case '0':
      return 0;
    case '10':
      return 10;
    case '20':
      return 20;
    case '30':
      return 30;
    default:
      return null;
  }
}

function buildBillingProfilePayload(
  form: BillingProfileFormState
): BillingProfilePayload {
  const fixedAmount =
    form.calculationMethod === 'fixed_amount'
      ? Number(form.fixedAmountYen)
      : null;

  if (
    form.calculationMethod === 'fixed_amount' &&
    (form.fixedAmountYen.trim() === '' ||
      !Number.isFinite(fixedAmount) ||
      fixedAmount < 0)
  ) {
    throw new Error('固定金額は0円以上で入力してください');
  }

  return {
    revenueContextCode: form.revenueContextCode,
    calculationMethod: form.calculationMethod,
    fixedAmountYen: fixedAmount,
    defaultPatientBurdenRate:
      form.calculationMethod === 'insurance_master'
        ? parsePatientBurdenRate(form.defaultPatientBurdenRate)
        : null,
    professionType:
      form.calculationMethod === 'insurance_master' && form.professionType
        ? form.professionType.trim()
        : null,
    requiresReview:
      form.calculationMethod === 'manual_estimate' || form.requiresReview,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo || null,
    isActive: form.isActive,
  };
}

function getBillingProfileSummary(profile: BillingProfile) {
  return `${getRevenueContextLabel(
    profile.revenueContextCode
  )}: ${getCalculationMethodLabel(profile.calculationMethod)}`;
}

function getProfileStatusLabel(profile: BillingProfile) {
  if (profile.isDeleted) return '削除済み';
  return profile.isActive ? '有効' : '無効';
}

function getBillingPreviewText(form: BillingProfileFormState) {
  if (form.calculationMethod === 'insurance_master') {
    return `保存内容: ${getRevenueContextLabel(
      form.revenueContextCode
    )} / 公式マスタ計算 / ${
      form.defaultPatientBurdenRate
        ? `${Number(form.defaultPatientBurdenRate) / 10}割`
        : '負担割合未設定'
    }`;
  }

  if (form.calculationMethod === 'fixed_amount') {
    return `保存内容: ${getRevenueContextLabel(
      form.revenueContextCode
    )} / 固定金額 ${
      form.fixedAmountYen
        ? `${Number(form.fixedAmountYen).toLocaleString()}円`
        : '未入力'
    }`;
  }

  return `保存内容: ${getRevenueContextLabel(
    form.revenueContextCode
  )} / 手入力概算 / 要確認`;
}

const buildMenuPayload = (
  clinicId: string,
  form: MenuFormState,
  id?: string
): MenuPayload => {
  const durationMinutes = Number(form.durationMinutes);
  const price = Number(form.price);

  if (!form.name.trim()) {
    throw new Error('メニュー名を入力してください');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('所要時間は1分以上で入力してください');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('料金は0円以上で入力してください');
  }

  return {
    clinic_id: clinicId,
    id,
    name: form.name.trim(),
    description: form.description.trim(),
    durationMinutes,
    price,
    category: form.category,
    isInsuranceApplicable: form.isInsuranceApplicable,
    isActive: form.isActive,
  };
};

const buildTemplatePayload = (
  ownerClinicId: string,
  form: MenuFormState,
  id?: string
): TemplatePayload => {
  const menuPayload = buildMenuPayload(ownerClinicId, form, id);

  return {
    owner_clinic_id: ownerClinicId,
    id,
    name: menuPayload.name,
    description: menuPayload.description,
    durationMinutes: menuPayload.durationMinutes,
    price: menuPayload.price,
    category: menuPayload.category,
    isInsuranceApplicable: menuPayload.isInsuranceApplicable,
    isActive: menuPayload.isActive,
  };
};

const menuToForm = (menu: Menu): MenuFormState => ({
  name: menu.name,
  description: menu.description ?? '',
  durationMinutes: String(menu.durationMinutes),
  price: String(menu.price),
  category: (menu.category as MenuCategory | undefined) ?? 'other',
  isInsuranceApplicable: menu.isInsuranceApplicable ?? false,
  isActive: menu.isActive,
});

const templateToForm = (template: MenuTemplate): MenuFormState => ({
  name: template.name,
  description: template.description ?? '',
  durationMinutes: String(template.durationMinutes),
  price: String(template.price),
  category: (template.category as MenuCategory | undefined) ?? 'other',
  isInsuranceApplicable: template.isInsuranceApplicable,
  isActive: template.isActive,
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const buildBookingPreviewPath = (clinicId: string, channel?: 'line') => {
  const encodedClinicId = encodeURIComponent(clinicId);
  return channel
    ? `/booking/${encodedClinicId}?channel=${channel}`
    : `/booking/${encodedClinicId}`;
};

async function readApiResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }

  return result.data;
}

const fetchMenus = async (
  clinicId: string,
  signal?: AbortSignal
): Promise<Menu[]> => {
  const response = await fetch(
    `/api/menus?clinic_id=${encodeURIComponent(clinicId)}`,
    { signal }
  );
  return readApiResponse<Menu[]>(response, '施術メニューの取得に失敗しました');
};

const fetchTemplateScope = async (
  clinicId: string,
  signal?: AbortSignal
): Promise<TemplateScope> => {
  const response = await fetch(
    `/api/menu-templates?clinic_id=${encodeURIComponent(clinicId)}`,
    { signal }
  );
  return readApiResponse<TemplateScope>(
    response,
    '共通テンプレートの取得に失敗しました'
  );
};

const fetchMenuBillingProfiles = async (
  clinicId: string,
  menuId: string,
  signal?: AbortSignal
): Promise<BillingProfile[]> => {
  const response = await fetch(
    `/api/menus/${encodeURIComponent(
      menuId
    )}/billing-profiles?clinic_id=${encodeURIComponent(clinicId)}`,
    { signal }
  );
  return readApiResponse<BillingProfile[]>(
    response,
    '院別課金プロファイルの取得に失敗しました'
  );
};

const fetchTemplateBillingProfiles = async (
  ownerClinicId: string,
  templateId: string,
  signal?: AbortSignal
): Promise<BillingProfile[]> => {
  const response = await fetch(
    `/api/menu-templates/${encodeURIComponent(
      templateId
    )}/billing-profiles?owner_clinic_id=${encodeURIComponent(ownerClinicId)}`,
    { signal }
  );
  return readApiResponse<BillingProfile[]>(
    response,
    '標準課金プロファイルの取得に失敗しました'
  );
};

async function fetchMenuBillingProfileMap(
  clinicId: string,
  menus: Menu[],
  signal?: AbortSignal
): Promise<BillingProfileMap> {
  const entries = await Promise.all(
    menus.map(async menu => ({
      id: menu.id,
      profiles: await fetchMenuBillingProfiles(clinicId, menu.id, signal),
    }))
  );
  const profileMap: BillingProfileMap = {};
  for (const entry of entries) {
    profileMap[entry.id] = entry.profiles;
  }
  return profileMap;
}

async function fetchTemplateBillingProfileMap(
  ownerClinicId: string,
  templates: MenuTemplate[],
  signal?: AbortSignal
): Promise<BillingProfileMap> {
  const entries = await Promise.all(
    templates.map(async template => ({
      id: template.id,
      profiles: await fetchTemplateBillingProfiles(
        ownerClinicId,
        template.id,
        signal
      ),
    }))
  );
  const profileMap: BillingProfileMap = {};
  for (const entry of entries) {
    profileMap[entry.id] = entry.profiles;
  }
  return profileMap;
}

interface BillingProfilePanelProps {
  title: string;
  entityName: string;
  profiles: BillingProfile[];
  form: BillingProfileFormState;
  disabled: boolean;
  saving: boolean;
  onFormChange: (form: BillingProfileFormState) => void;
  onSubmit: () => void;
  onArchive: (profile: BillingProfile) => void;
}

const BillingProfilePanel = memo(function BillingProfilePanel({
  title,
  entityName,
  profiles,
  form,
  disabled,
  saving,
  onFormChange,
  onSubmit,
  onArchive,
}: BillingProfilePanelProps) {
  const updateForm = useCallback(
    (patch: Partial<BillingProfileFormState>) => {
      onFormChange({ ...form, ...patch });
    },
    [form, onFormChange]
  );

  const handleCalculationMethodChange = useCallback(
    (value: string) => {
      if (!isBillingCalculationMethod(value)) return;
      onFormChange(normalizeBillingProfileFormForMethod(form, value));
    },
    [form, onFormChange]
  );

  const handleRevenueContextChange = useCallback(
    (value: string) => {
      if (!isRevenueContextCode(value)) return;
      onFormChange(normalizeBillingProfileFormForPreset(form, value));
    },
    [form, onFormChange]
  );

  const fixedAmountDisabled =
    disabled || form.calculationMethod !== 'fixed_amount';
  const burdenRateDisabled =
    disabled || form.calculationMethod !== 'insurance_master';

  return (
    <div className='mt-4 space-y-3 border-t border-gray-200 pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-sm font-semibold text-gray-900'>{title}</div>
        <Badge variant='outline'>{profiles.length}件</Badge>
      </div>

      <div className='grid gap-2 sm:grid-cols-4'>
        {BILLING_PROFILE_PRESETS.map(preset => {
          const Icon = preset.icon;
          const isSelected = form.revenueContextCode === preset.key;

          return (
            <Button
              key={preset.key}
              type='button'
              variant={isSelected ? 'default' : 'outline'}
              size='sm'
              className='justify-start'
              disabled={disabled}
              onClick={() =>
                onFormChange(
                  normalizeBillingProfileFormForPreset(form, preset.key)
                )
              }
            >
              <Icon className='mr-2 h-4 w-4' />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {profiles.length === 0 ? (
        <div className='rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500'>
          まだ会計設定はありません
        </div>
      ) : (
        <div className='space-y-2'>
          {profiles.map(profile => (
            <div
              key={profile.id}
              className='flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between'
            >
              <div className='min-w-0 space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium text-gray-900'>
                    {getBillingProfileSummary(profile)}
                  </span>
                  <Badge variant={profile.isActive ? 'default' : 'secondary'}>
                    {getProfileStatusLabel(profile)}
                  </Badge>
                  {profile.requiresReview && (
                    <Badge variant='outline'>要確認</Badge>
                  )}
                </div>
                <div className='flex flex-wrap gap-x-3 gap-y-1 text-gray-600'>
                  {profile.fixedAmountYen !== null && (
                    <span>{profile.fixedAmountYen.toLocaleString()}円</span>
                  )}
                  {profile.defaultPatientBurdenRate !== null && (
                    <span>{profile.defaultPatientBurdenRate / 10}割</span>
                  )}
                  <span>{profile.effectiveFrom} から</span>
                  {profile.effectiveTo && (
                    <span>{profile.effectiveTo} まで</span>
                  )}
                </div>
                {profile.revenueContextCode === 'traffic_accident' && (
                  <div className='text-amber-700'>
                    交通事故: 手入力概算・要確認。請求確定額ではありません。
                  </div>
                )}
                {profile.revenueContextCode === 'workers_comp' && (
                  <div className='text-amber-700'>
                    労災: 手入力概算・要確認。自動算定ではありません。
                  </div>
                )}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='text-red-600'
                disabled={disabled || saving}
                onClick={() => onArchive(profile)}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                削除
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className='grid gap-3 md:grid-cols-6'>
        <div className='space-y-1 md:col-span-2'>
          <Label htmlFor={`${entityName}-revenue-context`}>
            日報の売上区分
          </Label>
          <select
            id={`${entityName}-revenue-context`}
            aria-label={`${entityName} 売上区分`}
            className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
            value={form.revenueContextCode}
            disabled={disabled}
            onChange={event => handleRevenueContextChange(event.target.value)}
          >
            {REVENUE_CONTEXT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className='space-y-1 md:col-span-2'>
          <Label htmlFor={`${entityName}-calculation-method`}>
            金額の決め方
          </Label>
          <select
            id={`${entityName}-calculation-method`}
            aria-label={`${entityName} 課金方式`}
            className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
            value={form.calculationMethod}
            disabled={disabled}
            onChange={event =>
              handleCalculationMethodChange(event.target.value)
            }
          >
            {CALCULATION_METHOD_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`${entityName}-fixed-amount`}>自費・物販の金額</Label>
          <Input
            id={`${entityName}-fixed-amount`}
            aria-label={`${entityName} 固定金額`}
            type='number'
            min={0}
            value={form.fixedAmountYen}
            disabled={fixedAmountDisabled}
            onChange={event =>
              updateForm({ fixedAmountYen: event.target.value })
            }
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`${entityName}-burden-rate`}>保険の標準負担</Label>
          <select
            id={`${entityName}-burden-rate`}
            aria-label={`${entityName} 負担割合`}
            className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
            value={form.defaultPatientBurdenRate}
            disabled={burdenRateDisabled}
            onChange={event => {
              if (!isPatientBurdenRateOptionValue(event.target.value)) return;
              updateForm({ defaultPatientBurdenRate: event.target.value });
            }}
          >
            {PATIENT_BURDEN_RATE_OPTIONS.map(option => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className='space-y-1 md:col-span-2'>
          <Label htmlFor={`${entityName}-profession`}>制度マスタ種別</Label>
          <Input
            id={`${entityName}-profession`}
            aria-label={`${entityName} 職種/制度種別`}
            value={form.professionType}
            disabled={disabled || form.calculationMethod !== 'insurance_master'}
            onChange={event =>
              updateForm({ professionType: event.target.value })
            }
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`${entityName}-effective-from`}>使い始める日</Label>
          <Input
            id={`${entityName}-effective-from`}
            aria-label={`${entityName} 開始日`}
            type='date'
            value={form.effectiveFrom}
            disabled={disabled}
            onChange={event =>
              updateForm({ effectiveFrom: event.target.value })
            }
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`${entityName}-effective-to`}>終了日</Label>
          <Input
            id={`${entityName}-effective-to`}
            aria-label={`${entityName} 終了日`}
            type='date'
            value={form.effectiveTo}
            disabled={disabled}
            onChange={event => updateForm({ effectiveTo: event.target.value })}
          />
        </div>
        <div className='flex items-center gap-2 pt-6 text-sm text-gray-700'>
          <Switch
            aria-label={`${entityName} 要確認`}
            checked={form.requiresReview}
            disabled={disabled || form.calculationMethod === 'manual_estimate'}
            onCheckedChange={checked => updateForm({ requiresReview: checked })}
          />
          <span>要確認</span>
        </div>
        <div className='flex items-center gap-2 pt-6 text-sm text-gray-700'>
          <Switch
            aria-label={`${entityName} プロファイル有効`}
            checked={form.isActive}
            disabled={disabled}
            onCheckedChange={checked => updateForm({ isActive: checked })}
          />
          <span>有効</span>
        </div>
        <div className='rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 md:col-span-4'>
          {getBillingPreviewText(form)}
        </div>
        <div className='flex items-end md:col-span-2'>
          <Button
            type='button'
            className='w-full'
            aria-label={`${entityName} 会計設定追加`}
            disabled={disabled || saving}
            onClick={onSubmit}
          >
            {saving ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Plus className='mr-2 h-4 w-4' />
            )}
            この会計設定を追加
          </Button>
        </div>
      </div>
    </div>
  );
});

interface MenuTemplateCardProps {
  template: MenuTemplate;
  clinicSelected: boolean;
  isOwnerClinic: boolean;
  canManageTemplateBillingProfiles: boolean;
  saving: boolean;
  billingProfiles: BillingProfile[];
  billingForm: BillingProfileFormState;
  onApply: (template: MenuTemplate) => void;
  onEdit: (template: MenuTemplate) => void;
  onDelete: (template: MenuTemplate) => void;
  onBillingFormChange: (
    templateId: string,
    form: BillingProfileFormState
  ) => void;
  onBillingSubmit: (template: MenuTemplate) => void;
  onBillingArchive: (template: MenuTemplate, profile: BillingProfile) => void;
}

const MenuTemplateCard = memo(function MenuTemplateCard({
  template,
  clinicSelected,
  isOwnerClinic,
  canManageTemplateBillingProfiles,
  saving,
  billingProfiles,
  billingForm,
  onApply,
  onEdit,
  onDelete,
  onBillingFormChange,
  onBillingSubmit,
  onBillingArchive,
}: MenuTemplateCardProps) {
  return (
    <div className='rounded-md border border-gray-200 bg-white p-4'>
      <div className='mb-2 flex items-start justify-between gap-3'>
        <div>
          <div className='font-medium text-gray-900'>{template.name}</div>
          <div className='text-xs text-gray-500'>
            {getCategoryLabel(template.category)}
          </div>
        </div>
        <Badge
          variant={template.isInsuranceApplicable ? 'default' : 'secondary'}
        >
          {template.isInsuranceApplicable ? '保険' : '自費'}
        </Badge>
      </div>
      <div className='mb-3 text-sm text-gray-600'>{template.description}</div>
      <div className='mb-4 flex items-center justify-between text-sm'>
        <span className='inline-flex items-center text-gray-600'>
          <Clock className='mr-1 h-4 w-4' />
          {template.durationMinutes}分
        </span>
        <span className='font-medium text-gray-900'>
          {template.price.toLocaleString()}円
        </span>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          className='flex-1'
          onClick={() => onApply(template)}
          disabled={saving || !clinicSelected || !template.isActive}
        >
          <CopyPlus className='mr-2 h-4 w-4' />
          自院に追加
        </Button>
        {isOwnerClinic && (
          <>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label='テンプレート編集'
              onClick={() => onEdit(template)}
              disabled={saving}
            >
              <Edit className='h-4 w-4' />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label='テンプレート削除'
              className='text-red-600'
              onClick={() => onDelete(template)}
              disabled={saving}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </>
        )}
      </div>
      {canManageTemplateBillingProfiles && (
        <BillingProfilePanel
          title='標準テンプレの会計設定'
          entityName={template.name}
          profiles={billingProfiles}
          form={billingForm}
          disabled={saving || !clinicSelected}
          saving={saving}
          onFormChange={nextForm => onBillingFormChange(template.id, nextForm)}
          onSubmit={() => onBillingSubmit(template)}
          onArchive={profile => onBillingArchive(template, profile)}
        />
      )}
    </div>
  );
});

interface MenuListItemProps {
  menu: Menu;
  saving: boolean;
  canManageBillingProfiles: boolean;
  billingProfiles: BillingProfile[];
  billingForm: BillingProfileFormState;
  onEdit: (menu: Menu) => void;
  onToggleActive: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
  onBillingFormChange: (menuId: string, form: BillingProfileFormState) => void;
  onBillingSubmit: (menu: Menu) => void;
  onBillingArchive: (menu: Menu, profile: BillingProfile) => void;
}

const MenuListItem = memo(function MenuListItem({
  menu,
  saving,
  canManageBillingProfiles,
  billingProfiles,
  billingForm,
  onEdit,
  onToggleActive,
  onDelete,
  onBillingFormChange,
  onBillingSubmit,
  onBillingArchive,
}: MenuListItemProps) {
  return (
    <div className='rounded-md border border-gray-200 p-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='mb-2 flex flex-wrap items-center gap-2'>
            <div className='font-medium text-gray-900'>{menu.name}</div>
            <Badge variant={menu.isActive ? 'default' : 'secondary'}>
              {menu.isActive ? '有効' : '無効'}
            </Badge>
            <Badge
              variant={menu.isInsuranceApplicable ? 'outline' : 'secondary'}
            >
              {menu.isInsuranceApplicable ? '保険' : '自費'}
            </Badge>
          </div>
          <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600'>
            <span>{getCategoryLabel(menu.category)}</span>
            <span>{menu.durationMinutes}分</span>
            <span>{menu.price.toLocaleString()}円</span>
          </div>
          {menu.description && (
            <div className='mt-1 text-sm text-gray-500'>{menu.description}</div>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onEdit(menu)}
            disabled={saving}
          >
            <Edit className='mr-2 h-4 w-4' />
            編集
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onToggleActive(menu)}
            disabled={saving}
          >
            <CheckCircle2 className='mr-2 h-4 w-4' />
            {menu.isActive ? '無効化' : '有効化'}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='text-red-600'
            onClick={() => onDelete(menu)}
            disabled={saving}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            削除
          </Button>
        </div>
      </div>
      {canManageBillingProfiles && (
        <BillingProfilePanel
          title='院別メニューの会計設定'
          entityName={menu.name}
          profiles={billingProfiles}
          form={billingForm}
          disabled={saving}
          saving={saving}
          onFormChange={nextForm => onBillingFormChange(menu.id, nextForm)}
          onSubmit={() => onBillingSubmit(menu)}
          onArchive={profile => onBillingArchive(menu, profile)}
        />
      )}
    </div>
  );
});

interface MenuEditorFormProps {
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  disabled: boolean;
  saving: boolean;
  editing: boolean;
  idPrefix: string;
  nameLabel: string;
  submitCreateLabel: string;
  submitEditLabel: string;
  insuranceAriaLabel: string;
  activeAriaLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}

const MenuEditorForm = memo(function MenuEditorForm({
  form,
  setForm,
  disabled,
  saving,
  editing,
  idPrefix,
  nameLabel,
  submitCreateLabel,
  submitEditLabel,
  insuranceAriaLabel,
  activeAriaLabel,
  onSubmit,
  onCancel,
}: MenuEditorFormProps) {
  const updateField = useCallback(
    <K extends keyof MenuFormState>(key: K, value: MenuFormState[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
    },
    [setForm]
  );

  return (
    <form className='grid gap-4 md:grid-cols-2' onSubmit={onSubmit}>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-name`}>{nameLabel}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={event => updateField('name', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-category`}>カテゴリ</Label>
        <select
          id={`${idPrefix}-category`}
          className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
          value={form.category}
          onChange={event =>
            updateField('category', event.target.value as MenuCategory)
          }
          disabled={disabled}
        >
          {MENU_CATEGORIES.map(category => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-duration`}>所要時間（分）</Label>
        <Input
          id={`${idPrefix}-duration`}
          type='number'
          min={1}
          value={form.durationMinutes}
          onChange={event => updateField('durationMinutes', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-price`}>料金（円）</Label>
        <Input
          id={`${idPrefix}-price`}
          type='number'
          min={0}
          value={form.price}
          onChange={event => updateField('price', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2 md:col-span-2'>
        <Label htmlFor={`${idPrefix}-description`}>説明</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={event => updateField('description', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='flex flex-wrap items-center gap-6 md:col-span-2'>
        <div className='flex items-center gap-2 text-sm text-gray-700'>
          <Switch
            aria-label={insuranceAriaLabel}
            checked={form.isInsuranceApplicable}
            onCheckedChange={checked =>
              updateField('isInsuranceApplicable', checked)
            }
            disabled={disabled}
          />
          <span>保険適用</span>
        </div>
        <div className='flex items-center gap-2 text-sm text-gray-700'>
          <Switch
            aria-label={activeAriaLabel}
            checked={form.isActive}
            onCheckedChange={checked => updateField('isActive', checked)}
            disabled={disabled}
          />
          <span>有効</span>
        </div>
      </div>
      <div className='flex justify-end gap-2 md:col-span-2'>
        {editing && onCancel && (
          <Button
            type='button'
            variant='outline'
            onClick={onCancel}
            disabled={saving}
          >
            キャンセル
          </Button>
        )}
        <Button type='submit' disabled={disabled}>
          {saving ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : editing ? (
            <Save className='mr-2 h-4 w-4' />
          ) : (
            <Plus className='mr-2 h-4 w-4' />
          )}
          {editing ? submitEditLabel : submitCreateLabel}
        </Button>
      </div>
    </form>
  );
});

interface MenuEditDialogProps {
  menu: Menu | null;
  clinicSelected: boolean;
  saving: boolean;
  onSave: (menuId: string, form: MenuFormState) => Promise<void>;
  onClose: () => void;
}

const MenuEditDialog = memo(function MenuEditDialog({
  menu,
  clinicSelected,
  saving,
  onSave,
  onClose,
}: MenuEditDialogProps) {
  const [editForm, setEditForm] = useState<MenuFormState>(EMPTY_FORM);

  useEffect(() => {
    setEditForm(menu ? menuToForm(menu) : EMPTY_FORM);
  }, [menu]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!menu) return;
      await onSave(menu.id, editForm);
    },
    [editForm, menu, onSave]
  );

  return (
    <Dialog
      open={Boolean(menu)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>メニュー編集</DialogTitle>
          <DialogDescription>
            登録済みメニューの内容を更新します。
          </DialogDescription>
        </DialogHeader>
        <MenuEditorForm
          form={editForm}
          setForm={setEditForm}
          disabled={!clinicSelected || saving}
          saving={saving}
          editing
          idPrefix='menu-edit'
          nameLabel='メニュー名'
          submitCreateLabel='追加'
          submitEditLabel='更新'
          insuranceAriaLabel='保険適用'
          activeAriaLabel='有効'
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
});

interface BookingPreviewCardProps {
  clinicId: string | null;
}

const BookingPreviewCard = memo(function BookingPreviewCard({
  clinicId,
}: BookingPreviewCardProps) {
  const [origin, setOrigin] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'web' | 'line' | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const previewPath = useMemo(
    () => (clinicId ? buildBookingPreviewPath(clinicId) : ''),
    [clinicId]
  );

  const linePath = useMemo(
    () => (clinicId ? buildBookingPreviewPath(clinicId, 'line') : ''),
    [clinicId]
  );

  const previewUrl = origin && previewPath ? `${origin}${previewPath}` : '';
  const lineUrl = origin && linePath ? `${origin}${linePath}` : '';
  const activePreviewChannel = previewMode === 'line' ? 'line' : 'web';
  const activePreviewTitle =
    previewMode === 'line'
      ? 'LINE導線のプレビュー'
      : 'Web予約フォームのプレビュー';

  const handleCopy = useCallback(async (url: string, label: string) => {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage(`${label}をコピーしました`);
    } catch {
      setCopyMessage('コピーできませんでした。URLを開いて確認してください');
    }
  }, []);

  useEffect(() => {
    if (!copyMessage) return;

    const timeoutId = window.setTimeout(() => setCopyMessage(''), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle className='text-lg'>予約フォームプレビュー</CardTitle>
            <CardDescription>
              患者さんに公開される予約フォームを現在の院で確認できます
            </CardDescription>
          </div>
          <Badge variant={clinicId ? 'default' : 'secondary'}>
            {clinicId ? '公開URL生成済み' : '院未選択'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center'>
          <div className='min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700'>
            <div className='text-xs font-medium text-gray-500'>Web予約URL</div>
            <div className='mt-1 truncate font-mono'>
              {previewUrl || '対象クリニックを選択してください'}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={!previewUrl}
              onClick={() => handleCopy(previewUrl, 'Web予約URL')}
            >
              <Copy className='mr-2 h-4 w-4' />
              コピー
            </Button>
            <Button
              type='button'
              disabled={!previewPath}
              onClick={() => setPreviewMode('web')}
            >
              <Clock className='mr-2 h-4 w-4' />
              プレビュー
            </Button>
          </div>
        </div>

        <div className='grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center'>
          <div className='min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700'>
            <div className='text-xs font-medium text-gray-500'>
              LINE導線用URL
            </div>
            <div className='mt-1 truncate font-mono'>
              {lineUrl || '対象クリニックを選択してください'}
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={!lineUrl}
              onClick={() => handleCopy(lineUrl, 'LINE導線用URL')}
            >
              <Copy className='mr-2 h-4 w-4' />
              コピー
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={!linePath}
              onClick={() => setPreviewMode('line')}
            >
              <Clock className='mr-2 h-4 w-4' />
              LINE表示
            </Button>
          </div>
        </div>

        {copyMessage && (
          <div className='text-sm font-medium text-green-700'>
            {copyMessage}
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(previewMode)}
        onOpenChange={open => {
          if (!open) setPreviewMode(null);
        }}
      >
        <DialogContent className='max-h-[92vh] max-w-5xl overflow-hidden p-0'>
          <DialogHeader className='border-b px-5 py-4'>
            <DialogTitle>{activePreviewTitle}</DialogTitle>
            <DialogDescription>
              実際に患者さんへ表示される予約フォームです。
            </DialogDescription>
          </DialogHeader>
          <div className='h-[78vh] overflow-y-auto bg-gray-50'>
            {previewMode && clinicId && (
              <PublicBookingFormPreview
                clinicId={clinicId}
                channel={activePreviewChannel}
                embedded
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
});

export function ServicesPricingSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const { selectedClinicId } = useSelectedClinic();
  const clinicId = selectedClinicId ?? profile?.clinicId ?? null;
  const profileRole = profile?.role ?? null;
  const canManageBillingProfiles = isPricingAdminRole(profileRole);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [templateScope, setTemplateScope] = useState<TemplateScope | null>(
    null
  );
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
  const [templateForm, setTemplateForm] = useState<MenuFormState>(EMPTY_FORM);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [menuBillingProfiles, setMenuBillingProfiles] =
    useState<BillingProfileMap>({});
  const [templateBillingProfiles, setTemplateBillingProfiles] =
    useState<BillingProfileMap>({});
  const [menuBillingForms, setMenuBillingForms] =
    useState<BillingProfileFormMap>({});
  const [templateBillingForms, setTemplateBillingForms] =
    useState<BillingProfileFormMap>({});
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [billingProfilesLoading, setBillingProfilesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templates = templateScope?.templates ?? EMPTY_TEMPLATES;
  const isOwnerClinic = templateScope?.isOwnerClinic ?? false;
  const canManageTemplateBillingProfiles =
    isTemplatePricingAdminRole(profileRole) && isOwnerClinic;

  const sortedMenus = useMemo(
    () =>
      [...menus].sort((a, b) =>
        a.name.localeCompare(b.name, 'ja', { numeric: true })
      ),
    [menus]
  );

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.name.localeCompare(b.name, 'ja', { numeric: true });
      }),
    [templates]
  );

  const refreshAll = useCallback(
    async (signal?: AbortSignal) => {
      if (!clinicId) {
        setMenus([]);
        setTemplateScope(null);
        setMenuBillingProfiles({});
        setTemplateBillingProfiles({});
        setError(null);
        setLoading(false);
        setTemplateLoading(false);
        setBillingProfilesLoading(false);
        return;
      }

      setLoading(true);
      setTemplateLoading(true);
      setBillingProfilesLoading(canManageBillingProfiles);
      setError(null);

      const [menusResult, templateScopeResult] = await Promise.allSettled([
        fetchMenus(clinicId, signal),
        fetchTemplateScope(clinicId, signal),
      ]);

      if (signal?.aborted) return;

      const errors: string[] = [];
      if (menusResult.status === 'fulfilled') {
        setMenus(menusResult.value);
      } else {
        setMenus([]);
        setMenuBillingProfiles({});
        errors.push(
          getErrorMessage(
            menusResult.reason,
            '施術メニューの取得に失敗しました'
          )
        );
      }

      if (templateScopeResult.status === 'fulfilled') {
        setTemplateScope(templateScopeResult.value);
        if (
          isTemplatePricingAdminRole(profileRole) &&
          templateScopeResult.value.isOwnerClinic
        ) {
          setTemplatesOpen(true);
        }
      } else {
        setTemplateScope(null);
        setTemplateBillingProfiles({});
        errors.push(
          getErrorMessage(
            templateScopeResult.reason,
            '共通テンプレートの取得に失敗しました'
          )
        );
      }

      if (canManageBillingProfiles && menusResult.status === 'fulfilled') {
        const billingResults: Array<Promise<void>> = [
          fetchMenuBillingProfileMap(clinicId, menusResult.value, signal).then(
            setMenuBillingProfiles
          ),
        ];

        if (
          templateScopeResult.status === 'fulfilled' &&
          isTemplatePricingAdminRole(profileRole) &&
          templateScopeResult.value.isOwnerClinic
        ) {
          billingResults.push(
            fetchTemplateBillingProfileMap(
              templateScopeResult.value.ownerClinicId,
              templateScopeResult.value.templates,
              signal
            ).then(setTemplateBillingProfiles)
          );
        } else {
          setTemplateBillingProfiles({});
        }

        const profileResults = await Promise.allSettled(billingResults);
        if (signal?.aborted) return;

        for (const result of profileResults) {
          if (result.status === 'rejected') {
            errors.push(
              getErrorMessage(
                result.reason,
                '課金プロファイルの取得に失敗しました'
              )
            );
          }
        }
      } else {
        setMenuBillingProfiles({});
        setTemplateBillingProfiles({});
      }

      setError(errors[0] ?? null);
      setLoading(false);
      setTemplateLoading(false);
      setBillingProfilesLoading(false);
    },
    [canManageBillingProfiles, clinicId, profileRole]
  );

  const handleRefresh = useCallback(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshAll(controller.signal);

    return () => {
      controller.abort();
    };
  }, [refreshAll]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingMenu(null);
  }, []);

  const resetTemplateForm = useCallback(() => {
    setTemplateForm(EMPTY_FORM);
    setEditingTemplateId(null);
  }, []);

  const updateMenuBillingForm = useCallback(
    (menuId: string, nextForm: BillingProfileFormState) => {
      setMenuBillingForms(prev => ({ ...prev, [menuId]: nextForm }));
    },
    []
  );

  const updateTemplateBillingForm = useCallback(
    (templateId: string, nextForm: BillingProfileFormState) => {
      setTemplateBillingForms(prev => ({ ...prev, [templateId]: nextForm }));
    },
    []
  );

  const resetMenuBillingForm = useCallback((menuId: string) => {
    setMenuBillingForms(prev => ({
      ...prev,
      [menuId]: createEmptyBillingProfileForm(),
    }));
  }, []);

  const resetTemplateBillingForm = useCallback((templateId: string) => {
    setTemplateBillingForms(prev => ({
      ...prev,
      [templateId]: createEmptyBillingProfileForm(),
    }));
  }, []);

  const updateTemplateList = useCallback(
    (updater: CollectionUpdater<MenuTemplate>) => {
      setTemplateScope(prev =>
        prev
          ? {
              ...prev,
              templates: updater(prev.templates),
            }
          : prev
      );
    },
    []
  );

  const saveMenu = useCallback(
    async (payload: MenuPayload, method: 'POST' | 'PATCH') => {
      const response = await fetch('/api/menus', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return readApiResponse<Menu>(
        response,
        '施術メニューの保存に失敗しました'
      );
    },
    []
  );

  const saveTemplate = useCallback(
    async (payload: TemplatePayload, method: 'POST' | 'PATCH') => {
      const response = await fetch('/api/menu-templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return readApiResponse<MenuTemplate>(
        response,
        '共通テンプレートの保存に失敗しました'
      );
    },
    []
  );

  const saveMenuBillingProfile = useCallback(
    async (menu: Menu) => {
      if (!clinicId || !canManageBillingProfiles) return;

      const formState =
        menuBillingForms[menu.id] ?? createEmptyBillingProfileForm();

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload: MenuBillingProfilePayload = {
          clinic_id: clinicId,
          ...buildBillingProfilePayload(formState),
        };
        const response = await fetch(
          `/api/menus/${encodeURIComponent(menu.id)}/billing-profiles`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const savedProfile = await readApiResponse<BillingProfile>(
          response,
          '院別課金プロファイルの保存に失敗しました'
        );
        setMenuBillingProfiles(prev => ({
          ...prev,
          [menu.id]: upsertById(prev[menu.id] ?? [], savedProfile),
        }));
        resetMenuBillingForm(menu.id);
        setSavedMessage('院別課金プロファイルを追加しました');
      } catch (err) {
        setError(
          getErrorMessage(err, '院別課金プロファイルの保存に失敗しました')
        );
      } finally {
        setSaving(false);
      }
    },
    [canManageBillingProfiles, clinicId, menuBillingForms, resetMenuBillingForm]
  );

  const saveTemplateBillingProfile = useCallback(
    async (template: MenuTemplate) => {
      if (!canManageTemplateBillingProfiles) return;

      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId) {
        setError('標準課金プロファイルの owner_clinic_id が取得できません');
        return;
      }

      const formState =
        templateBillingForms[template.id] ?? createEmptyBillingProfileForm();

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload: TemplateBillingProfilePayload = {
          owner_clinic_id: ownerClinicId,
          ...buildBillingProfilePayload(formState),
        };
        const response = await fetch(
          `/api/menu-templates/${encodeURIComponent(
            template.id
          )}/billing-profiles`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const savedProfile = await readApiResponse<BillingProfile>(
          response,
          '標準課金プロファイルの保存に失敗しました'
        );
        setTemplateBillingProfiles(prev => ({
          ...prev,
          [template.id]: upsertById(prev[template.id] ?? [], savedProfile),
        }));
        resetTemplateBillingForm(template.id);
        setSavedMessage('標準課金プロファイルを追加しました');
      } catch (err) {
        setError(
          getErrorMessage(err, '標準課金プロファイルの保存に失敗しました')
        );
      } finally {
        setSaving(false);
      }
    },
    [
      canManageTemplateBillingProfiles,
      resetTemplateBillingForm,
      templateBillingForms,
      templateScope?.ownerClinicId,
    ]
  );

  const archiveMenuBillingProfile = useCallback(
    async (menu: Menu, profileToArchive: BillingProfile) => {
      if (!clinicId || !canManageBillingProfiles) return;
      if (!window.confirm('この院別課金プロファイルを削除しますか？')) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menus/${encodeURIComponent(
            menu.id
          )}/billing-profiles/${encodeURIComponent(profileToArchive.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinic_id: clinicId,
              isActive: false,
              isDeleted: true,
            }),
          }
        );
        await readApiResponse<BillingProfile>(
          response,
          '院別課金プロファイルの削除に失敗しました'
        );
        setMenuBillingProfiles(prev => ({
          ...prev,
          [menu.id]: (prev[menu.id] ?? []).filter(
            profile => profile.id !== profileToArchive.id
          ),
        }));
        setSavedMessage('院別課金プロファイルを削除しました');
      } catch (err) {
        setError(
          getErrorMessage(err, '院別課金プロファイルの削除に失敗しました')
        );
      } finally {
        setSaving(false);
      }
    },
    [canManageBillingProfiles, clinicId]
  );

  const archiveTemplateBillingProfile = useCallback(
    async (template: MenuTemplate, profileToArchive: BillingProfile) => {
      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId || !canManageTemplateBillingProfiles) return;
      if (!window.confirm('この標準課金プロファイルを削除しますか？')) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menu-templates/${encodeURIComponent(
            template.id
          )}/billing-profiles/${encodeURIComponent(profileToArchive.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner_clinic_id: ownerClinicId,
              isActive: false,
              isDeleted: true,
            }),
          }
        );
        await readApiResponse<BillingProfile>(
          response,
          '標準課金プロファイルの削除に失敗しました'
        );
        setTemplateBillingProfiles(prev => ({
          ...prev,
          [template.id]: (prev[template.id] ?? []).filter(
            profile => profile.id !== profileToArchive.id
          ),
        }));
        setSavedMessage('標準課金プロファイルを削除しました');
      } catch (err) {
        setError(
          getErrorMessage(err, '標準課金プロファイルの削除に失敗しました')
        );
      } finally {
        setSaving(false);
      }
    },
    [canManageTemplateBillingProfiles, templateScope?.ownerClinicId]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!clinicId) {
        setError('clinic_id が取得できません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildMenuPayload(clinicId, form);
        const savedMenu = await saveMenu(payload, 'POST');
        setMenus(prev => upsertById(prev, savedMenu));
        resetForm();
        setSavedMessage('メニューを追加しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, form, resetForm, saveMenu]
  );

  const saveEditedMenu = useCallback(
    async (menuId: string, editForm: MenuFormState) => {
      if (!clinicId) {
        setError('編集対象のメニューが見つかりません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildMenuPayload(clinicId, editForm, menuId);
        const savedMenu = await saveMenu(payload, 'PATCH');
        setMenus(prev => upsertById(prev, savedMenu));
        closeEditDialog();
        setSavedMessage('メニューを更新しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, closeEditDialog, saveMenu]
  );

  const handleTemplateSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId || !isOwnerClinic) {
        setError('共通テンプレートを編集できる対象クリニックではありません');
        return;
      }

      const wasEditing = Boolean(editingTemplateId);
      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildTemplatePayload(
          ownerClinicId,
          templateForm,
          editingTemplateId ?? undefined
        );
        const savedTemplate = await saveTemplate(
          payload,
          wasEditing ? 'PATCH' : 'POST'
        );
        updateTemplateList(prev => upsertById(prev, savedTemplate));
        resetTemplateForm();
        setSavedMessage(
          wasEditing
            ? '共通テンプレートを更新しました'
            : '共通テンプレートを追加しました'
        );
      } catch (err) {
        setError(getErrorMessage(err, '共通テンプレートの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [
      editingTemplateId,
      isOwnerClinic,
      resetTemplateForm,
      saveTemplate,
      templateForm,
      templateScope?.ownerClinicId,
      updateTemplateList,
    ]
  );

  const applyTemplate = useCallback(
    async (template: MenuTemplate) => {
      if (!clinicId) {
        setError('clinic_id が取得できません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch('/api/menu-templates/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            template_id: template.id,
          }),
        });
        const savedMenu = await readApiResponse<Menu>(
          response,
          'テンプレートの追加に失敗しました'
        );

        setMenus(prev => upsertById(prev, savedMenu));
        if (canManageBillingProfiles) {
          const profiles = await fetchMenuBillingProfiles(
            clinicId,
            savedMenu.id
          );
          setMenuBillingProfiles(prev => ({
            ...prev,
            [savedMenu.id]: profiles,
          }));
        }
        setSavedMessage(`${template.name} を追加しました`);
      } catch (err) {
        setError(getErrorMessage(err, 'テンプレートの追加に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [canManageBillingProfiles, clinicId]
  );

  const handleEdit = useCallback((menu: Menu) => {
    setEditingMenu(menu);
    setError(null);
    setSavedMessage('');
  }, []);

  const handleTemplateEdit = useCallback((template: MenuTemplate) => {
    setTemplatesOpen(true);
    setEditingTemplateId(template.id);
    setTemplateForm(templateToForm(template));
    setError(null);
    setSavedMessage('');
  }, []);

  const handleTemplateDelete = useCallback(
    async (template: MenuTemplate) => {
      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId || !isOwnerClinic) return;
      if (!window.confirm(`${template.name} を削除しますか？`)) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menu-templates?owner_clinic_id=${encodeURIComponent(
            ownerClinicId
          )}&id=${encodeURIComponent(template.id)}`,
          { method: 'DELETE' }
        );
        await readApiResponse<{ deleted: true }>(
          response,
          '共通テンプレートの削除に失敗しました'
        );

        if (editingTemplateId === template.id) resetTemplateForm();
        updateTemplateList(prev =>
          prev.filter(current => current.id !== template.id)
        );
        setTemplateBillingProfiles(prev => {
          const next = { ...prev };
          delete next[template.id];
          return next;
        });
        setSavedMessage('共通テンプレートを削除しました');
      } catch (err) {
        setError(getErrorMessage(err, '共通テンプレートの削除に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [
      editingTemplateId,
      isOwnerClinic,
      resetTemplateForm,
      templateScope?.ownerClinicId,
      updateTemplateList,
    ]
  );

  const handleToggleActive = useCallback(
    async (menu: Menu) => {
      if (!clinicId) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const savedMenu = await saveMenu(
          {
            clinic_id: clinicId,
            id: menu.id,
            name: menu.name,
            description: menu.description ?? '',
            durationMinutes: menu.durationMinutes,
            price: menu.price,
            category: (menu.category as MenuCategory | undefined) ?? 'other',
            isInsuranceApplicable: menu.isInsuranceApplicable ?? false,
            isActive: !menu.isActive,
          },
          'PATCH'
        );
        setMenus(prev => upsertById(prev, savedMenu));
        setSavedMessage(
          menu.isActive
            ? 'メニューを無効化しました'
            : 'メニューを有効化しました'
        );
      } catch (err) {
        setError(getErrorMessage(err, 'メニュー状態の更新に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, saveMenu]
  );

  const handleDelete = useCallback(
    async (menu: Menu) => {
      if (!clinicId) return;
      if (!window.confirm(`${menu.name} を削除しますか？`)) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menus?clinic_id=${encodeURIComponent(
            clinicId
          )}&id=${encodeURIComponent(menu.id)}`,
          { method: 'DELETE' }
        );
        await readApiResponse<{ deleted: true }>(
          response,
          '施術メニューの削除に失敗しました'
        );

        if (editingMenu?.id === menu.id) closeEditDialog();
        setMenus(prev => prev.filter(current => current.id !== menu.id));
        setMenuBillingProfiles(prev => {
          const next = { ...prev };
          delete next[menu.id];
          return next;
        });
        setSavedMessage('メニューを削除しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの削除に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, closeEditDialog, editingMenu?.id]
  );

  if (profileLoading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {error && <AdminMessage message={error} type='error' />}
      {savedMessage && !error && (
        <AdminMessage message={savedMessage} type='success' />
      )}

      {!clinicId && (
        <AdminMessage message='対象クリニックを選択してください' type='error' />
      )}

      <BookingPreviewCard clinicId={clinicId} />

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <CardTitle className='text-xl'>施術メニュー</CardTitle>
              <CardDescription>
                予約画面で使用する院別メニューを管理します
              </CardDescription>
            </div>
            <Button
              type='button'
              variant='outline'
              onClick={handleRefresh}
              disabled={
                loading ||
                templateLoading ||
                billingProfilesLoading ||
                !clinicId
              }
            >
              <RefreshCw className='mr-2 h-4 w-4' />
              再読み込み
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MenuEditorForm
            form={form}
            setForm={setForm}
            disabled={!clinicId || saving}
            saving={saving}
            editing={false}
            idPrefix='menu'
            nameLabel='メニュー名'
            submitCreateLabel='追加'
            submitEditLabel='更新'
            insuranceAriaLabel='保険適用'
            activeAriaLabel='有効'
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='pb-4'>
          <button
            type='button'
            className='flex w-full items-start justify-between gap-3 text-left'
            aria-expanded={templatesOpen}
            onClick={() => setTemplatesOpen(prev => !prev)}
          >
            <div>
              <CardTitle className='text-lg'>メニューテンプレート</CardTitle>
              <CardDescription>
                {templateScope
                  ? `${templateScope.ownerClinicName} のテンプレートから院別メニューへ追加できます`
                  : '親テナントが用意したメニューのコピー元です'}
              </CardDescription>
            </div>
            <div className='flex items-center gap-2 text-sm text-gray-500'>
              {templateLoading ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <span>{sortedTemplates.length}件</span>
              )}
              {templatesOpen ? (
                <ChevronDown className='h-4 w-4' />
              ) : (
                <ChevronRight className='h-4 w-4' />
              )}
            </div>
          </button>
        </CardHeader>
        {templatesOpen && (
          <CardContent className='space-y-5'>
            {isOwnerClinic && (
              <div className='rounded-md border border-gray-200 p-4'>
                <MenuEditorForm
                  form={templateForm}
                  setForm={setTemplateForm}
                  disabled={!clinicId || saving}
                  saving={saving}
                  editing={Boolean(editingTemplateId)}
                  idPrefix='template'
                  nameLabel='テンプレート名'
                  submitCreateLabel='テンプレート追加'
                  submitEditLabel='テンプレート更新'
                  insuranceAriaLabel='テンプレート保険適用'
                  activeAriaLabel='テンプレート有効'
                  onSubmit={handleTemplateSubmit}
                  onCancel={resetTemplateForm}
                />
              </div>
            )}

            {templateLoading && (
              <div className='flex items-center py-4 text-sm text-gray-600'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                メニューテンプレートを読み込み中...
              </div>
            )}

            {!templateLoading && sortedTemplates.length === 0 && (
              <div className='rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500'>
                メニューテンプレートはありません
              </div>
            )}

            <div className='grid gap-3 md:grid-cols-3'>
              {sortedTemplates.map(template => (
                <MenuTemplateCard
                  key={template.id}
                  template={template}
                  clinicSelected={Boolean(clinicId)}
                  isOwnerClinic={isOwnerClinic}
                  canManageTemplateBillingProfiles={
                    canManageTemplateBillingProfiles
                  }
                  saving={saving}
                  billingProfiles={
                    templateBillingProfiles[template.id] ??
                    EMPTY_BILLING_PROFILES
                  }
                  billingForm={
                    templateBillingForms[template.id] ??
                    createEmptyBillingProfileForm()
                  }
                  onApply={applyTemplate}
                  onEdit={handleTemplateEdit}
                  onDelete={handleTemplateDelete}
                  onBillingFormChange={updateTemplateBillingForm}
                  onBillingSubmit={saveTemplateBillingProfile}
                  onBillingArchive={archiveTemplateBillingProfile}
                />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>登録済みメニュー</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {loading && (
            <div className='flex items-center py-6 text-sm text-gray-600'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              メニューを読み込み中...
            </div>
          )}
          {!loading && sortedMenus.length === 0 && (
            <div className='rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500'>
              登録済みメニューはありません
            </div>
          )}
          {sortedMenus.map(menu => (
            <MenuListItem
              key={menu.id}
              menu={menu}
              saving={saving}
              canManageBillingProfiles={canManageBillingProfiles}
              billingProfiles={
                menuBillingProfiles[menu.id] ?? EMPTY_BILLING_PROFILES
              }
              billingForm={
                menuBillingForms[menu.id] ?? createEmptyBillingProfileForm()
              }
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              onBillingFormChange={updateMenuBillingForm}
              onBillingSubmit={saveMenuBillingProfile}
              onBillingArchive={archiveMenuBillingProfile}
            />
          ))}
        </CardContent>
      </Card>

      <MenuEditDialog
        menu={editingMenu}
        clinicSelected={Boolean(clinicId)}
        saving={saving}
        onSave={saveEditedMenu}
        onClose={closeEditDialog}
      />
    </div>
  );
}

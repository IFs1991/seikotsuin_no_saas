import React, { useEffect, useMemo, useState } from 'react';
import {
  Appointment,
  MenuItem,
  MenuOptionItem,
  SchedulerResource,
} from '../types';

import { createCustomer, createReservation, fetchCustomers } from '../api';
import { statusToColor } from '../hooks/statusToColor';
import {
  calculateEndTime,
  timeToMinutes,
  hasTimeConflict,
} from '../utils/time';

type CustomAttributeField = {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required?: boolean;
  placeholder?: string;
};

type AppointmentFormState = {
  resourceId: string;
  lastName: string;
  firstName: string;
  date: string;
  startHour: number;
  startMinute: number;
  menuId: string;
  optionId: string;
  isStaffRequested: boolean;
  phone: string;
  type: 'normal';
  customAttributes: Record<string, string>;
};

const CUSTOM_ATTR_TEMPLATE: CustomAttributeField[] = [
  {
    key: 'symptom',
    label: '主な症状',
    type: 'text',
    placeholder: '例: 肩こり',
  },
  {
    key: 'visitReason',
    label: '来院目的',
    type: 'text',
    placeholder: '例: 慢性的な腰痛',
  },
  { key: 'memo', label: '補足メモ', type: 'textarea', placeholder: '任意' },
];

const createInitialCustomAttributes = () =>
  CUSTOM_ATTR_TEMPLATE.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = '';
    return acc;
  }, {});

const isSelectableResource = (resource: SchedulerResource) =>
  resource.id !== 'separator';

const formatResourceLabel = (resource: SchedulerResource) =>
  `${resource.name}${resource.capacity ? ` (${resource.capacity})` : ''}`;

const normalizeCustomerIdentity = (value: string) =>
  value.replace(/\s+/g, '').trim();

const normalizePriceAmount = (amount: number) =>
  Number.isFinite(amount) ? amount : 0;

const formatYen = (amount: number) =>
  `${normalizePriceAmount(amount).toLocaleString('ja-JP')}円`;

const formatPriceDelta = (amount: number) => {
  if (amount === 0) return '';
  const prefix = amount > 0 ? '+' : '-';
  return ` (${prefix}${formatYen(Math.abs(amount))})`;
};

interface Props {
  clinicId: string;
  resources: SchedulerResource[];
  menus: MenuItem[];
  onSuccess: (newAppointment: Appointment) => void | Promise<void>;
  onCancel: () => void;
  initialData?: {
    resourceId?: string;
    startHour?: number;
    startMinute?: number;
    date?: string;
  };
  appointments: Appointment[];
  embedded?: boolean;
}

export const AppointmentForm: React.FC<Props> = ({
  clinicId,
  resources,
  menus,
  onSuccess,
  onCancel,
  initialData,
  appointments,
  embedded = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Today's date YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];
  const staffResources = useMemo(
    () =>
      resources.filter(
        resource => isSelectableResource(resource) && resource.type === 'staff'
      ),
    [resources]
  );
  const facilityResources = useMemo(
    () =>
      resources.filter(
        resource =>
          isSelectableResource(resource) && resource.type === 'facility'
      ),
    [resources]
  );
  const selectableResources = useMemo(
    () => [...staffResources, ...facilityResources],
    [facilityResources, staffResources]
  );

  const [formData, setFormData] = useState<AppointmentFormState>({
    resourceId: initialData?.resourceId || selectableResources[0]?.id || '',
    lastName: '',
    firstName: '',
    date: initialData?.date || todayStr,
    startHour: initialData?.startHour ?? 10,
    startMinute: initialData?.startMinute ?? 0,
    menuId: menus[0]?.id || '',
    optionId: 'none',
    isStaffRequested: false,
    phone: '',
    type: 'normal' as const,
    customAttributes: createInitialCustomAttributes(),
  });

  useEffect(() => {
    const selectedResourceExists = selectableResources.some(
      resource => resource.id === formData.resourceId
    );

    if (formData.resourceId && !selectedResourceExists) {
      setFormData(prev => ({
        ...prev,
        resourceId: selectableResources[0]?.id ?? '',
      }));
      return;
    }

    if (!formData.resourceId && selectableResources.length > 0) {
      setFormData(prev => ({ ...prev, resourceId: selectableResources[0].id }));
    }
  }, [selectableResources, formData.resourceId]);

  useEffect(() => {
    if (!formData.menuId && menus.length > 0) {
      setFormData(prev => ({ ...prev, menuId: menus[0].id }));
    }
  }, [menus, formData.menuId]);

  const selectedMenu = useMemo(
    () => menus.find(menu => menu.id === formData.menuId),
    [menus, formData.menuId]
  );
  const selectedResource = useMemo(
    () =>
      selectableResources.find(resource => resource.id === formData.resourceId),
    [selectableResources, formData.resourceId]
  );

  const optionItems = useMemo<MenuOptionItem[]>(() => {
    const base = (selectedMenu?.options ?? []).filter(
      option => option.isActive
    );
    return [
      {
        id: 'none',
        name: '\u306a\u3057',
        priceDelta: 0,
        durationDeltaMinutes: 0,
      },
      ...base,
    ];
  }, [selectedMenu]);

  const selectedOption = useMemo(
    () => optionItems.find(option => option.id === formData.optionId),
    [optionItems, formData.optionId]
  );

  const selectedStaffNominationFee =
    selectedResource?.type === 'staff' && formData.isStaffRequested
      ? (selectedResource.nominationFee ?? 0)
      : 0;

  const selectedTotalPrice =
    (selectedMenu?.price ?? 0) +
    (selectedOption?.priceDelta ?? 0) +
    selectedStaffNominationFee;

  const endTime = useMemo(() => {
    const duration =
      (selectedMenu?.durationMinutes ?? 0) +
      (selectedOption?.durationDeltaMinutes ?? 0);
    const { endHour, endMinute } = calculateEndTime(
      formData.startHour,
      formData.startMinute,
      duration
    );

    return { hour: endHour, minute: endMinute };
  }, [
    formData.startHour,
    formData.startMinute,
    selectedMenu?.durationMinutes,
    selectedOption?.durationDeltaMinutes,
  ]);

  useEffect(() => {
    if (!optionItems.find(option => option.id === formData.optionId)) {
      setFormData(prev => ({ ...prev, optionId: 'none' }));
    }
  }, [optionItems, formData.optionId]);

  useEffect(() => {
    if (selectedResource?.type !== 'staff' && formData.isStaffRequested) {
      setFormData(prev => ({ ...prev, isStaffRequested: false }));
    }
  }, [selectedResource?.type, formData.isStaffRequested]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate conflicts
    const newStartMins = timeToMinutes(
      formData.startHour,
      formData.startMinute
    );
    const newEndMins = timeToMinutes(endTime.hour, endTime.minute);

    const hasConflict = appointments.some(a => {
      // Must match date
      if (a.date !== formData.date) return false;
      // Must match resource
      if (a.resourceId !== formData.resourceId) return false;
      if (a.status === 'cancelled' || a.status === 'no_show') return false;

      const aStartMins = timeToMinutes(a.startHour, a.startMinute);
      const aEndMins = timeToMinutes(a.endHour, a.endMinute);

      return hasTimeConflict(newStartMins, newEndMins, aStartMins, aEndMins);
    });

    if (hasConflict) {
      setErrorMessage('指定された時間帯にはすでに予約が入っています。');
      return;
    }

    const customerName = `${formData.lastName} ${formData.firstName}`.trim();
    const normalizedPhone = formData.phone.trim();
    if (!customerName || !normalizedPhone) {
      setErrorMessage('顧客名と電話番号を入力してください');
      return;
    }

    const missingRequired = CUSTOM_ATTR_TEMPLATE.filter(
      field =>
        field.required &&
        !String(formData.customAttributes[field.key] ?? '').trim()
    );
    if (missingRequired.length > 0) {
      setErrorMessage('必須のカスタム属性を入力してください');
      return;
    }

    const customAttributes = Object.fromEntries(
      Object.entries(formData.customAttributes).filter(
        ([, value]) => String(value ?? '').trim().length > 0
      )
    );
    const customAttributesPayload =
      Object.keys(customAttributes).length > 0 ? customAttributes : undefined;

    const selectedOptions =
      selectedOption && selectedOption.id !== 'none'
        ? [
            {
              optionId: selectedOption.id,
              name: selectedOption.name,
              priceDelta: selectedOption.priceDelta ?? 0,
              durationDeltaMinutes: selectedOption.durationDeltaMinutes ?? 0,
            },
          ]
        : [];

    setLoading(true);
    try {
      const customers = await fetchCustomers(clinicId, normalizedPhone).catch(
        error => {
          throw new Error(
            `患者データの検索に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
          );
        }
      );
      const normalizedCustomerName = normalizeCustomerIdentity(customerName);
      const matchedCustomer = customers.find(
        customer =>
          customer.phone === normalizedPhone &&
          normalizeCustomerIdentity(customer.name) === normalizedCustomerName
      );
      const customer = matchedCustomer
        ? { id: matchedCustomer.id, name: matchedCustomer.name }
        : await createCustomer({
            clinicId,
            name: customerName,
            phone: normalizedPhone,
            customAttributes: customAttributesPayload,
          }).catch(error => {
            throw new Error(
              `患者データの作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
            );
          });

      const startTime = new Date(formData.date);
      startTime.setHours(formData.startHour, formData.startMinute, 0, 0);
      const endTimeDate = new Date(formData.date);
      endTimeDate.setHours(endTime.hour, endTime.minute, 0, 0);

      const reservation = await createReservation({
        clinicId,
        customerId: customer.id,
        menuId: formData.menuId,
        staffId: formData.resourceId,
        startTime,
        endTime: endTimeDate,
        channel: 'phone',
        selectedOptions,
        isStaffRequested:
          selectedResource?.type === 'staff' && formData.isStaffRequested,
      }).catch(error => {
        throw new Error(
          `予約データの作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`
        );
      });

      const displayName = matchedCustomer?.name ?? customerName;
      const resourceName = resources.find(
        r => r.id === formData.resourceId
      )?.name;
      const menuName = menus.find(m => m.id === formData.menuId)?.name;

      await onSuccess({
        id: reservation.id,
        resourceId: formData.resourceId,
        date: formData.date,
        startHour: formData.startHour,
        startMinute: formData.startMinute,
        endHour: endTime.hour,
        endMinute: endTime.minute,
        title: displayName,
        lastName: formData.lastName,
        firstName: formData.firstName,
        menuId: formData.menuId,
        optionId:
          selectedOption?.id === 'none' ? undefined : selectedOption?.id,
        subTitle: menuName,
        type: 'normal',
        color: statusToColor(reservation.status ?? 'unconfirmed'),
        status: reservation.status ?? 'unconfirmed',
        customerId: customer.id,
        staffId: formData.resourceId,
        menuName,
        staffName: resourceName,
        selectedOptions,
        isStaffRequested:
          reservation.isStaffRequested ??
          (selectedResource?.type === 'staff' && formData.isStaffRequested),
        staffNominationFee:
          reservation.staffNominationFee ??
          (selectedResource?.type === 'staff' && formData.isStaffRequested
            ? (selectedResource.nominationFee ?? 0)
            : 0),
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '\u4e88\u7d04\u306e\u4f5c\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = <K extends keyof AppointmentFormState>(
    field: K,
    value: AppointmentFormState[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomAttributeChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      customAttributes: {
        ...prev.customAttributes,
        [key]: value,
      },
    }));
  };

  return (
    <div
      className={
        embedded
          ? 'p-4 sm:p-6'
          : 'max-w-2xl mx-auto p-4 sm:p-6 bg-white shadow-lg rounded-lg border border-gray-200 mt-4 sm:mt-8 animate-in fade-in slide-in-from-bottom-4 duration-300'
      }
    >
      {!embedded && (
        <h2 className='text-xl font-bold text-gray-800 mb-6 pb-2 border-b border-gray-200'>
          新規予約登録
        </h2>
      )}
      {errorMessage && (
        <div
          className='mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
          role='alert'
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Date */}
        <div>
          <label
            htmlFor='appointment-form-date'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            来店日
          </label>
          <input
            id='appointment-form-date'
            type='date'
            required
            value={formData.date}
            onChange={e => handleInputChange('date', e.target.value)}
            className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
          />
        </div>

        {/* Time */}
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          <div>
            <div className='block text-sm font-medium text-gray-700'>
              開始時間
            </div>
            <div className='flex gap-2 items-center mt-1'>
              <input
                aria-label='開始時'
                type='number'
                min='9'
                max='23'
                value={formData.startHour}
                onChange={e =>
                  handleInputChange('startHour', parseInt(e.target.value))
                }
                className='block w-20 shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
              />
              <span>:</span>
              <input
                aria-label='開始分'
                type='number'
                min='0'
                max='59'
                step='5'
                value={formData.startMinute}
                onChange={e =>
                  handleInputChange('startMinute', parseInt(e.target.value))
                }
                className='block w-20 shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
              />
            </div>
          </div>
          <div>
            <div className='block text-sm font-medium text-gray-700'>
              終了時間
              <span className='text-xs font-normal text-gray-500 ml-2'>
                (自動計算)
              </span>
            </div>
            <div className='flex gap-2 items-center mt-1'>
              <input
                aria-label='終了時'
                type='number'
                disabled
                value={endTime.hour}
                className='block w-20 bg-gray-100 shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 text-gray-600'
              />
              <span>:</span>
              <input
                aria-label='終了分'
                type='number'
                disabled
                value={endTime.minute}
                className='block w-20 bg-gray-100 shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 text-gray-600'
              />
            </div>
          </div>
        </div>

        {/* Resource Selection */}
        <div>
          <label
            htmlFor='appointment-form-resource'
            className='block text-sm font-medium text-gray-700'
          >
            担当・設備
          </label>
          <select
            id='appointment-form-resource'
            value={formData.resourceId}
            onChange={e => handleInputChange('resourceId', e.target.value)}
            className='mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border'
            disabled={selectableResources.length === 0}
          >
            {staffResources.length > 0 && (
              <optgroup label='施術者'>
                {staffResources.map(resource => (
                  <option key={resource.id} value={resource.id}>
                    {formatResourceLabel(resource)}
                  </option>
                ))}
              </optgroup>
            )}
            {facilityResources.length > 0 && (
              <optgroup label='設備・施術室'>
                {facilityResources.map(resource => (
                  <option key={resource.id} value={resource.id}>
                    {formatResourceLabel(resource)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {staffResources.length === 0 && (
            <p className='mt-2 text-xs text-amber-700'>
              施術者リソースが未登録です。スタッフ管理またはリソース管理で施術者を追加してください。
            </p>
          )}
          {selectedResource?.type === 'staff' && (
            <label
              htmlFor='appointment-form-staff-requested'
              aria-label='この施術者を指名'
              className='mt-3 flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2'
            >
              <span>
                <span className='block text-sm font-medium text-gray-800'>
                  この施術者を指名
                </span>
                <span className='block text-xs text-gray-500'>
                  指名料 {formatYen(selectedResource.nominationFee ?? 0)}
                </span>
              </span>
              <input
                id='appointment-form-staff-requested'
                type='checkbox'
                checked={formData.isStaffRequested}
                onChange={e =>
                  handleInputChange('isStaffRequested', e.target.checked)
                }
                className='h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500'
              />
            </label>
          )}
        </div>

        {/* Menu & Options */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <label
              htmlFor='appointment-form-menu'
              className='block text-sm font-medium text-gray-700'
            >
              メニュー
            </label>
            <select
              id='appointment-form-menu'
              value={formData.menuId}
              onChange={e => handleInputChange('menuId', e.target.value)}
              className='mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border'
            >
              {menus.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.durationMinutes}分 / {formatYen(m.price)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor='appointment-form-option'
              className='block text-sm font-medium text-gray-700'
            >
              オプション
            </label>
            <select
              id='appointment-form-option'
              value={formData.optionId}
              onChange={e => handleInputChange('optionId', e.target.value)}
              className='mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border'
            >
              {optionItems.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {formatPriceDelta(o.priceDelta)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className='rounded-md border border-gray-200 bg-gray-50 px-4 py-3'>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-sm font-medium text-gray-700'>料金</span>
            <span className='text-lg font-semibold text-gray-900'>
              {selectedMenu ? formatYen(selectedTotalPrice) : 'メニュー未選択'}
            </span>
          </div>
          {selectedMenu && (
            <div className='mt-1 text-xs text-gray-500'>
              基本料金 {formatYen(selectedMenu.price)}
              {selectedOption && selectedOption.id !== 'none'
                ? ` / オプション ${formatYen(selectedOption.priceDelta)}`
                : ''}
              {selectedStaffNominationFee > 0
                ? ` / 指名料 ${formatYen(selectedStaffNominationFee)}`
                : ''}
            </div>
          )}
        </div>

        {/* Customer Fields */}
        <div>
          <label
            htmlFor='appointment-form-phone'
            className='block text-sm font-medium text-gray-700 mb-1'
          >
            電話番号
          </label>
          <input
            id='appointment-form-phone'
            type='text'
            required
            value={formData.phone}
            onChange={e => handleInputChange('phone', e.target.value)}
            className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
            placeholder='090-1234-5678'
          />
        </div>
        <div>
          <div className='block text-sm font-medium text-gray-700 mb-1'>
            お名前
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <div>
              <input
                aria-label='姓'
                type='text'
                required
                value={formData.lastName}
                onChange={e => handleInputChange('lastName', e.target.value)}
                className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
                placeholder='姓 (例: 山田)'
              />
            </div>
            <div>
              <input
                aria-label='名'
                type='text'
                required
                value={formData.firstName}
                onChange={e => handleInputChange('firstName', e.target.value)}
                className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
                placeholder='名 (例: 太郎)'
              />
            </div>
          </div>
        </div>

        <div>
          <div className='block text-sm font-medium text-gray-700 mb-2'>
            カスタム属性
          </div>
          <div className='space-y-3'>
            {CUSTOM_ATTR_TEMPLATE.map(field => (
              <div key={field.key}>
                <label
                  htmlFor={`appointment-form-custom-${field.key}`}
                  className='block text-xs font-medium text-gray-600 mb-1'
                >
                  {field.label}
                  {field.required ? (
                    <span className='text-red-500 ml-1'>*</span>
                  ) : null}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={`appointment-form-custom-${field.key}`}
                    value={formData.customAttributes[field.key] ?? ''}
                    onChange={e =>
                      handleCustomAttributeChange(field.key, e.target.value)
                    }
                    className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
                    placeholder={field.placeholder}
                    rows={3}
                  />
                ) : (
                  <input
                    id={`appointment-form-custom-${field.key}`}
                    type='text'
                    value={formData.customAttributes[field.key] ?? ''}
                    onChange={e =>
                      handleCustomAttributeChange(field.key, e.target.value)
                    }
                    className='block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2'
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className='flex justify-end gap-3 pt-4 border-t border-gray-200'>
          <button
            type='button'
            onClick={onCancel}
            className='bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500'
          >
            キャンセル
          </button>
          <button
            type='submit'
            disabled={loading || !formData.resourceId || !formData.menuId}
            className='inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50'
          >
            {loading ? '登録中...' : '登録する'}
          </button>
        </div>
      </form>
    </div>
  );
};

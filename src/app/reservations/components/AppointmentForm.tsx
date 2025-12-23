import React, { useEffect, useMemo, useState } from 'react';
import { Appointment, MenuItem, MenuOptionItem, SchedulerResource } from '../types';

import { createCustomer, createReservation } from '../api';
import { calculateEndTime, timeToMinutes, hasTimeConflict } from '../utils/time';

interface Props {
  clinicId: string;
  resources: SchedulerResource[];
  menus: MenuItem[];
  onSuccess: (newAppointment: Appointment) => void;
  onCancel: () => void;
  initialData?: {
    resourceId?: string;
    startHour?: number;
    startMinute?: number;
    date?: string;
  };
  appointments: Appointment[];
}

export const AppointmentForm: React.FC<Props> = ({ clinicId, resources, menus, onSuccess, onCancel, initialData, appointments }) => {
  const [loading, setLoading] = useState(false);
  
  // Today's date YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    resourceId: initialData?.resourceId || resources[0]?.id || '',
    lastName: '',
    firstName: '',
    date: initialData?.date || todayStr,
    startHour: initialData?.startHour ?? 10,
    startMinute: initialData?.startMinute ?? 0,
    menuId: menus[0]?.id || '',
    optionId: 'none',
    phone: '',
    type: 'normal' as const,
    color: 'red' as const,
  });

  useEffect(() => {
    if (!formData.resourceId && resources.length > 0) {
      setFormData(prev => ({ ...prev, resourceId: resources[0].id }));
    }
  }, [resources, formData.resourceId]);

  useEffect(() => {
    if (!formData.menuId && menus.length > 0) {
      setFormData(prev => ({ ...prev, menuId: menus[0].id }));
    }
  }, [menus, formData.menuId]);

  const selectedMenu = useMemo(() =>
    menus.find(menu => menu.id === formData.menuId),
    [menus, formData.menuId]
  );

  const optionItems = useMemo<MenuOptionItem[]>(() => {
    const base = (selectedMenu?.options ?? []).filter(option => option.isActive);
    return [
      { id: 'none', name: '\u306a\u3057', priceDelta: 0, durationDeltaMinutes: 0 },
      ...base,
    ];
  }, [selectedMenu]);

  const [endTime, setEndTime] = useState({ hour: 11, minute: 0 });

  useEffect(() => {
    if (!optionItems.find(option => option.id === formData.optionId)) {
      setFormData(prev => ({ ...prev, optionId: 'none' }));
    }
  }, [optionItems, formData.optionId]);

  // Auto-calculate end time based on menu duration
  useEffect(() => {
    const menu = menus.find(m => m.id === formData.menuId);
    const option = optionItems.find(o => o.id === formData.optionId);
    
    const duration = (menu?.durationMinutes || 0) + (option?.durationDeltaMinutes || 0);
    
    const { endHour, endMinute } = calculateEndTime(formData.startHour, formData.startMinute, duration);
    
    setEndTime({ hour: endHour, minute: endMinute });
  }, [formData.startHour, formData.startMinute, formData.menuId, formData.optionId, menus, optionItems]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate conflicts
    const newStartMins = timeToMinutes(formData.startHour, formData.startMinute);
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
        alert('指定された時間帯にはすでに予約が入っています。');
        return;
    }

    const customerName = `${formData.lastName} ${formData.firstName}`.trim();
    if (!customerName || !formData.phone) {
      alert('顧客名と電話番号を入力してください');
      return;
    }

    const selectedOption = optionItems.find(o => o.id === formData.optionId);
    const selectedOptions = selectedOption && selectedOption.id !== 'none'
      ? [{
          optionId: selectedOption.id,
          name: selectedOption.name,
          priceDelta: selectedOption.priceDelta ?? 0,
          durationDeltaMinutes: selectedOption.durationDeltaMinutes ?? 0,
        }]
      : [];

    setLoading(true);
    try {
      const customer = await createCustomer({
        clinicId,
        name: customerName,
        phone: formData.phone,
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
      });

      const resourceName = resources.find(r => r.id === formData.resourceId)?.name;
      const menuName = menus.find(m => m.id === formData.menuId)?.name;

      onSuccess({
        id: reservation.id,
        resourceId: formData.resourceId,
        date: formData.date,
        startHour: formData.startHour,
        startMinute: formData.startMinute,
        endHour: endTime.hour,
        endMinute: endTime.minute,
        title: customerName,
        lastName: formData.lastName,
        firstName: formData.firstName,
        menuId: formData.menuId,
        optionId: selectedOption?.id === 'none' ? undefined : selectedOption?.id,
        subTitle: menuName,
        type: 'normal',
        color: formData.color,
        status: reservation.status ?? 'unconfirmed',
        customerId: customer.id,
        staffId: formData.resourceId,
        menuName,
        staffName: resourceName,
        selectedOptions,
      });
    } catch (err) {
      alert('予約の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-white shadow-lg rounded-lg border border-gray-200 mt-4 sm:mt-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <h2 className="text-xl font-bold text-gray-800 mb-6 pb-2 border-b border-gray-200">新規予約登録</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Name Fields */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
          <input
            type="text"
            required
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            className="block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
            placeholder="090-1234-5678"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">お名前</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className="block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
                    placeholder="姓 (例: 山田)"
                />
             </div>
             <div>
                <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className="block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
                    placeholder="名 (例: 太郎)"
                />
             </div>
          </div>
        </div>

        {/* Date */}
        <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">来店日</label>
             <input 
                type="date"
                required
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                className="block w-full shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
             />
        </div>

        {/* Resource Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700">担当・設備</label>
          <select
            value={formData.resourceId}
            onChange={(e) => handleInputChange('resourceId', e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border"
          >
            {resources.filter(r => r.id !== 'separator').map(r => (
              <option key={r.id} value={r.id}>{r.name} {r.capacity ? `(${r.capacity})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Menu & Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">メニュー</label>
                <select
                    value={formData.menuId}
                    onChange={(e) => handleInputChange('menuId', e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border"
                >
                    {menus.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.durationMinutes}分)</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">オプション</label>
                <select
                    value={formData.optionId}
                    onChange={(e) => handleInputChange('optionId', e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm rounded-md border"
                >
                    {optionItems.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                </select>
            </div>
        </div>

        {/* Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">開始時間</label>
            <div className="flex gap-2 items-center mt-1">
              <input
                type="number"
                min="9"
                max="23"
                value={formData.startHour}
                onChange={(e) => handleInputChange('startHour', parseInt(e.target.value))}
                className="block w-20 shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
              />
              <span>:</span>
              <input
                type="number"
                min="0"
                max="59"
                step="5"
                value={formData.startMinute}
                onChange={(e) => handleInputChange('startMinute', parseInt(e.target.value))}
                className="block w-20 shadow-sm focus:ring-sky-500 focus:border-sky-500 sm:text-sm border-gray-300 rounded-md border p-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
                終了時間 
                <span className="text-xs font-normal text-gray-500 ml-2">(自動計算)</span>
            </label>
            <div className="flex gap-2 items-center mt-1">
              <input
                type="number"
                disabled
                value={endTime.hour}
                className="block w-20 bg-gray-100 shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 text-gray-600"
              />
              <span>:</span>
              <input
                type="number"
                disabled
                value={endTime.minute}
                className="block w-20 bg-gray-100 shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 text-gray-600"
              />
            </div>
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700">カラーラベル</label>
          <div className="mt-2 flex gap-3 flex-wrap">
            {(['red', 'pink', 'blue', 'orange', 'purple'] as const).map(color => (
              <button
                key={color}
                type="button"
                onClick={() => handleInputChange('color', color)}
                className={`w-8 h-8 rounded-full ${formData.color === color ? 'ring-2 ring-offset-2 ring-sky-500' : ''}`}
                style={{ backgroundColor: color === 'red' ? '#fb7185' : color === 'pink' ? '#f9a8d4' : color === 'blue' ? '#38bdf8' : color === 'orange' ? '#fb923c' : '#4f46e5' }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={loading || !formData.resourceId || !formData.menuId}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50"
          >
            {loading ? '登録中...' : '登録する'}
          </button>
        </div>
      </form>
    </div>
  );
};
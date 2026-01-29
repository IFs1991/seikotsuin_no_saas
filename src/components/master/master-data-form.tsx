'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';
import { clsx } from 'clsx';
import {
  createMasterData,
  listMasterData,
  updateMasterData,
} from '@/lib/api/admin/master-data-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { UserProfile } from '@/types/user-profile';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  duration: number;
  category: string;
  isActive: boolean;
}

interface MasterDataFormProps {
  className?: string;
}

const MENU_ITEMS_SETTING_KEY = 'menu_items';
const MENU_ITEMS_CATEGORY = 'menu';

const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    name: '基本施術',
    price: 3000,
    duration: 30,
    category: '一般',
    isActive: true,
  },
  {
    id: '2',
    name: '特別施術',
    price: 5000,
    duration: 60,
    category: '特殊',
    isActive: true,
  },
];

const normalizeMenuItems = (raw: unknown): MenuItem[] => {
  if (!Array.isArray(raw)) return DEFAULT_MENU_ITEMS;

  const items = raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const data = entry as Record<string, unknown>;
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const price =
        typeof data.price === 'number' ? data.price : Number(data.price ?? NaN);
      const duration =
        typeof data.duration === 'number'
          ? data.duration
          : Number(data.duration ?? NaN);
      if (!name || !Number.isFinite(price) || !Number.isFinite(duration)) {
        return null;
      }

      return {
        id:
          typeof data.id === 'string' && data.id.length > 0
            ? data.id
            : `imported-${index}`,
        name,
        price,
        duration,
        category:
          typeof data.category === 'string' && data.category.length > 0
            ? data.category
            : '一般',
        isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
      };
    })
    .filter((item): item is MenuItem => item !== null);

  return items.length > 0 ? items : DEFAULT_MENU_ITEMS;
};

const resolveClinicId = (profile: UserProfile | null) => {
  if (!profile) return undefined;
  if (profile.role === 'admin') return null;
  return profile.clinicId ?? null;
};

const resolveClinicQueryParam = (profile: UserProfile | null) => {
  if (!profile) return undefined;
  if (profile.role === 'admin') return 'global';
  return profile.clinicId ?? undefined;
};

export function MasterDataForm({ className }: MasterDataFormProps) {
  const { profile, loading: profileLoading } = useUserProfile();
  const [menuItems, setMenuItems] = useState<MenuItem[]>(DEFAULT_MENU_ITEMS);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: '',
    price: 0,
    duration: 30,
    category: '一般',
    isActive: true,
  });

  useEffect(() => {
    if (profileLoading) return;

    let isMounted = true;

    const loadMasterData = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await listMasterData({
          category: MENU_ITEMS_CATEGORY,
          clinic_id: resolveClinicQueryParam(profile),
        });
        const target = response.items.find(
          item => item.name === MENU_ITEMS_SETTING_KEY
        );
        if (!isMounted) return;
        if (target) {
          setSettingId(target.id);
          setMenuItems(normalizeMenuItems(target.value));
        } else {
          setSettingId(null);
          setMenuItems(DEFAULT_MENU_ITEMS);
        }
      } catch (error) {
        console.error('Failed to load master data', error);
        if (isMounted) {
          setLoadError('マスターデータの読み込みに失敗しました');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadMasterData();

    return () => {
      isMounted = false;
    };
  }, [profileLoading, profile]);

  const addMenuItem = useCallback(() => {
    if (!newItem.name || !newItem.price) return;

    const item: MenuItem = {
      id: Date.now().toString(),
      name: newItem.name,
      price: newItem.price,
      duration: newItem.duration || 30,
      category: newItem.category || '一般',
      isActive: true,
    };

    setMenuItems(prev => [...prev, item]);
    setNewItem({
      name: '',
      price: 0,
      duration: 30,
      category: '一般',
      isActive: true,
    });
  }, [newItem]);

  const removeMenuItem = useCallback((id: string) => {
    setMenuItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateMenuItem = useCallback(
    (id: string, updates: Partial<MenuItem>) => {
      setMenuItems(prev =>
        prev.map(item => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const payload = {
        clinic_id: resolveClinicId(profile),
        name: MENU_ITEMS_SETTING_KEY,
        category: MENU_ITEMS_CATEGORY,
        value: menuItems,
        data_type: 'array' as const,
        description: '施術メニュー設定',
        is_editable: true,
        is_public: false,
      };

      if (settingId) {
        await updateMasterData(settingId, {
          value: payload.value,
          data_type: payload.data_type,
          description: payload.description,
          is_editable: payload.is_editable,
          is_public: payload.is_public,
        });
      } else {
        const created = await createMasterData(payload);
        setSettingId(created.id);
      }
      alert('マスターデータを保存しました');
    } catch (error) {
      console.error('Save error:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [menuItems, profile, settingId]);

  return (
    <div className={clsx('medical-card p-6', className)}>
      <div className='flex items-center justify-between mb-6'>
        <h2 className='text-xl font-semibold text-gray-900'>
          施術メニュー管理
        </h2>
        <button
          onClick={handleSave}
          className='medical-button-primary flex items-center space-x-2 disabled:opacity-60'
          disabled={isLoading || isSaving}
        >
          <Save className='h-4 w-4' />
          <span>{isSaving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      {loadError && (
        <div className='mb-4 rounded-medical border border-red-200 bg-red-50 p-3 text-sm text-red-700'>
          {loadError}
        </div>
      )}

      {/* 新規追加フォーム */}
      <div className='bg-gray-50 rounded-medical p-4 mb-6'>
        <h3 className='font-medium text-gray-900 mb-4'>新規メニュー追加</h3>
        <div className='grid gap-4 md:grid-cols-4'>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              メニュー名
            </label>
            <input
              type='text'
              value={newItem.name || ''}
              onChange={e =>
                setNewItem(prev => ({ ...prev, name: e.target.value }))
              }
              className='medical-input w-full'
              placeholder='施術名を入力'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              料金（円）
            </label>
            <input
              type='number'
              value={newItem.price || ''}
              onChange={e =>
                setNewItem(prev => ({ ...prev, price: Number(e.target.value) }))
              }
              className='medical-input w-full'
              placeholder='0'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              所要時間（分）
            </label>
            <input
              type='number'
              value={newItem.duration || ''}
              onChange={e =>
                setNewItem(prev => ({
                  ...prev,
                  duration: Number(e.target.value),
                }))
              }
              className='medical-input w-full'
              placeholder='30'
            />
          </div>
          <div className='flex items-end'>
            <button
              onClick={addMenuItem}
              disabled={!newItem.name || !newItem.price}
              className='medical-button-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50'
            >
              <Plus className='h-4 w-4' />
              <span>追加</span>
            </button>
          </div>
        </div>
      </div>

      {/* メニューリスト */}
      <div className='space-y-3'>
        <h3 className='font-medium text-gray-900'>登録済みメニュー</h3>
        {menuItems.map(item => (
          <div
            key={item.id}
            className='flex items-center space-x-4 p-4 bg-white border border-gray-200 rounded-medical'
          >
            <GripVertical className='h-4 w-4 text-gray-400 cursor-move' />

            <div className='flex-1 grid gap-4 md:grid-cols-4'>
              <input
                type='text'
                value={item.name}
                onChange={e =>
                  updateMenuItem(item.id, { name: e.target.value })
                }
                className='medical-input'
              />
              <input
                type='number'
                value={item.price}
                onChange={e =>
                  updateMenuItem(item.id, { price: Number(e.target.value) })
                }
                className='medical-input'
              />
              <input
                type='number'
                value={item.duration}
                onChange={e =>
                  updateMenuItem(item.id, { duration: Number(e.target.value) })
                }
                className='medical-input'
              />
              <div className='flex items-center space-x-2'>
                <label className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={item.isActive}
                    onChange={e =>
                      updateMenuItem(item.id, { isActive: e.target.checked })
                    }
                    className='rounded border-gray-300'
                  />
                  <span className='text-sm text-gray-700'>有効</span>
                </label>
              </div>
            </div>

            <button
              onClick={() => removeMenuItem(item.id)}
              className='p-2 text-red-600 hover:bg-red-50 rounded-medical'
            >
              <Trash2 className='h-4 w-4' />
            </button>
          </div>
        ))}
      </div>

      {menuItems.length === 0 && (
        <div className='text-center py-8 text-gray-500'>
          <p>登録されているメニューがありません</p>
          <p className='text-sm'>
            上のフォームから新しいメニューを追加してください
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { Menu } from '@/types/reservation';

export default function MenuSettingsPage() {
  const { profile } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMenu, setNewMenu] = useState({
    name: '',
    description: '',
    durationMinutes: 60,
    price: 0,
    optionsJson: '[]',
  });

  const loadMenus = async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/menus?clinic_id=${clinicId}`);
      const json = await res.json();
      setMenus(json.success ? json.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenus();
  }, [clinicId]);

  const handleCreate = async () => {
    if (!clinicId || !newMenu.name.trim()) return;
    let options: any[] = [];
    try {
      options = JSON.parse(newMenu.optionsJson || '[]');
      if (!Array.isArray(options)) options = [];
    } catch {
      alert('オプションJSONの形式が不正です');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          name: newMenu.name,
          description: newMenu.description,
          durationMinutes: Number(newMenu.durationMinutes),
          price: Number(newMenu.price),
          isActive: true,
          options,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setNewMenu({
        name: '',
        description: '',
        durationMinutes: 60,
        price: 0,
        optionsJson: '[]',
      });
      await loadMenus();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'メニュー作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (menu: Menu) => {
    if (!clinicId) return;
    setMenus(prev =>
      prev.map(m => (m.id === menu.id ? { ...m, isActive: !m.isActive } : m))
    );
    await fetch('/api/menus', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicId,
        id: menu.id,
        isActive: !menu.isActive,
      }),
    });
  };

  const handleDelete = async (menuId: string) => {
    if (!clinicId) return;
    if (!confirm('このメニューを削除しますか？')) return;
    await fetch(`/api/menus?clinic_id=${clinicId}&id=${menuId}`, {
      method: 'DELETE',
    });
    await loadMenus();
  };

  if (!clinicId) return <div className='p-6'>clinic_id が取得できません。</div>;

  return (
    <div className='p-6 max-w-4xl mx-auto space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>メニュー管理</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <Label>メニュー名</Label>
            <Input
              value={newMenu.name}
              onChange={e => setNewMenu(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>所要時間（分）</Label>
            <Input
              type='number'
              value={newMenu.durationMinutes}
              onChange={e =>
                setNewMenu(prev => ({
                  ...prev,
                  durationMinutes: Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>価格（円）</Label>
            <Input
              type='number'
              value={newMenu.price}
              onChange={e =>
                setNewMenu(prev => ({ ...prev, price: Number(e.target.value) }))
              }
            />
          </div>
          <div className='md:col-span-2'>
            <Label>説明</Label>
            <Textarea
              value={newMenu.description}
              onChange={e =>
                setNewMenu(prev => ({ ...prev, description: e.target.value }))
              }
            />
          </div>
          <div className='md:col-span-2'>
            <Label>オプション(JSON)</Label>
            <Textarea
              className='font-mono text-xs'
              value={newMenu.optionsJson}
              onChange={e =>
                setNewMenu(prev => ({ ...prev, optionsJson: e.target.value }))
              }
              placeholder='[]'
            />
          </div>
          <div className='md:col-span-2 flex justify-end'>
            <Button onClick={handleCreate} disabled={loading}>
              追加
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>登録済みメニュー</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {menus.length === 0 && (
            <div className='text-sm text-muted-foreground'>メニューがありません</div>
          )}
          {menus.map(menu => (
            <div
              key={menu.id}
              className='flex items-center justify-between border rounded-md p-3'
            >
              <div>
                <div className='font-medium'>
                  {menu.name}（{menu.durationMinutes}分 / {menu.price.toLocaleString()}円）
                </div>
                <div className='text-xs text-muted-foreground'>
                  {menu.description}
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <div className='flex items-center gap-2'>
                  <Switch
                    checked={menu.isActive}
                    onCheckedChange={() => handleToggleActive(menu)}
                  />
                  <span className='text-xs'>有効</span>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleDelete(menu.id)}
                >
                  削除
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

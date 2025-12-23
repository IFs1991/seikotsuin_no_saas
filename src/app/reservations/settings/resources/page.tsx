'use client';

import { useEffect, useState } from 'react';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import type { Resource } from '@/types/reservation';

const TYPE_LABELS: Record<Resource['type'], string> = {
  staff: 'スタッフ',
  room: '施術室',
  bed: 'ベッド',
  device: '設備',
};

export default function ResourceSettingsPage() {
  const { profile } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [newResource, setNewResource] = useState({
    name: '',
    type: 'staff' as Resource['type'],
    maxConcurrent: 1,
    supportedMenusJson: '[]',
    workingHoursJson: '{}',
  });

  const loadResources = async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/resources?clinic_id=${clinicId}`);
      const json = await res.json();
      setResources(json.success ? json.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
  }, [clinicId]);

  const handleCreate = async () => {
    if (!clinicId || !newResource.name.trim()) return;
    let supportedMenus: string[] = [];
    let workingHours: Record<string, any> = {};
    try {
      supportedMenus = JSON.parse(newResource.supportedMenusJson || '[]');
      if (!Array.isArray(supportedMenus)) supportedMenus = [];
      workingHours = JSON.parse(newResource.workingHoursJson || '{}');
    } catch {
      alert('JSONの形式が不正です');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          name: newResource.name,
          type: newResource.type,
          maxConcurrent: Number(newResource.maxConcurrent),
          supportedMenus,
          workingHours,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setNewResource({
        name: '',
        type: 'staff',
        maxConcurrent: 1,
        supportedMenusJson: '[]',
        workingHoursJson: '{}',
      });
      await loadResources();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'リソース作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (resource: Resource) => {
    if (!clinicId) return;
    setResources(prev =>
      prev.map(r =>
        r.id === resource.id ? { ...r, isActive: !r.isActive } : r
      )
    );
    await fetch('/api/resources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicId,
        id: resource.id,
        isActive: !resource.isActive,
      }),
    });
  };

  const handleDelete = async (resourceId: string) => {
    if (!clinicId) return;
    if (!confirm('このリソースを削除しますか？')) return;
    await fetch(`/api/resources?clinic_id=${clinicId}&id=${resourceId}`, {
      method: 'DELETE',
    });
    await loadResources();
  };

  if (!clinicId) return <div className='p-6'>clinic_id が取得できません。</div>;

  return (
    <div className='p-6 max-w-4xl mx-auto space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>リソース管理（スタッフ/施術室/設備）</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div>
            <Label>名称</Label>
            <Input
              value={newResource.name}
              onChange={e =>
                setNewResource(prev => ({ ...prev, name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>種別</Label>
            <Select
              value={newResource.type}
              onValueChange={value =>
                setNewResource(prev => ({
                  ...prev,
                  type: value as Resource['type'],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>同時対応数</Label>
            <Input
              type='number'
              value={newResource.maxConcurrent}
              onChange={e =>
                setNewResource(prev => ({
                  ...prev,
                  maxConcurrent: Number(e.target.value),
                }))
              }
            />
          </div>
          <div className='md:col-span-2'>
            <Label>対応メニュー(JSON/UUID配列)</Label>
            <Textarea
              className='font-mono text-xs'
              value={newResource.supportedMenusJson}
              onChange={e =>
                setNewResource(prev => ({
                  ...prev,
                  supportedMenusJson: e.target.value,
                }))
              }
            />
          </div>
          <div className='md:col-span-2'>
            <Label>勤務時間(JSON)</Label>
            <Textarea
              className='font-mono text-xs'
              value={newResource.workingHoursJson}
              onChange={e =>
                setNewResource(prev => ({
                  ...prev,
                  workingHoursJson: e.target.value,
                }))
              }
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
          <CardTitle className='text-base'>登録済みリソース</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {resources.length === 0 && (
            <div className='text-sm text-muted-foreground'>
              リソースがありません
            </div>
          )}
          {resources.map(resource => (
            <div
              key={resource.id}
              className='flex items-center justify-between border rounded-md p-3'
            >
              <div>
                <div className='font-medium'>
                  {resource.name}（{TYPE_LABELS[resource.type]}）
                </div>
                <div className='text-xs text-muted-foreground'>
                  同時対応: {resource.maxConcurrent}
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <div className='flex items-center gap-2'>
                  <Switch
                    checked={resource.isActive}
                    onCheckedChange={() => handleToggleActive(resource)}
                  />
                  <span className='text-xs'>有効</span>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleDelete(resource.id)}
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


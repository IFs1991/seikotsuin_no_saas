'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BlockService } from '@/lib/services/block-service';
import type { Block, CreateBlockData } from '@/types/reservation';

// 通知関数
const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (type === 'error') {
    alert(message);
  }
};

// サンプルリソース
const sampleResources = [
  { id: 'staff1', name: '田中先生', type: 'staff' },
  { id: 'staff2', name: '佐藤先生', type: 'staff' },
  { id: 'room1', name: '施術室A', type: 'room' },
  { id: 'room2', name: '施術室B', type: 'room' },
];

export default function BlockManagementPage() {
  const blockService = useMemo(() => new BlockService(), []);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedResource, setSelectedResource] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringCount, setRecurringCount] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Block作成処理
  const handleCreateBlock = async () => {
    if (!selectedResource || !startDate || !startTime || !endDate || !endTime) {
      showNotification('必要な情報を入力してください', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);

      if (startDateTime >= endDateTime) {
        showNotification('終了時刻は開始時刻より後にしてください', 'error');
        setIsSubmitting(false);
        return;
      }

      const blockData: CreateBlockData = {
        resourceId: selectedResource,
        startTime: startDateTime,
        endTime: endDateTime,
        reason,
        createdBy: 'current-user-id', // TODO: 実際のユーザーIDに置き換え
      };

      // 繰り返し設定がある場合
      if (isRecurring) {
        blockData.recurrenceRule = `FREQ=WEEKLY;COUNT=${recurringCount}`;
      }

      await blockService.createBlock(blockData);

      showNotification(
        `販売停止を設定しました${isRecurring ? `（${recurringCount}週間繰り返し）` : ''}`,
        'success'
      );

      // フォームリセット
      setShowCreateForm(false);
      setSelectedResource('');
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
      setReason('');
      setIsRecurring(false);
      setRecurringCount(4);

      // Block一覧を再取得
      refreshBlocks();
    } catch (error) {
      console.error('Block creation error:', error);
      showNotification(
        error instanceof Error ? error.message : '販売停止の設定に失敗しました',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Block一覧取得
  const refreshBlocks = async () => {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 3);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);

      const fetchedBlocks = await blockService.getBlocksByDateRange(startOfMonth, endOfMonth);
      setBlocks(fetchedBlocks);
    } catch (error) {
      console.error('Block fetch error:', error);
    }
  };

  // Block削除
  const handleDeleteBlock = async (id: string) => {
    if (!confirm('この販売停止設定を削除しますか？')) {
      return;
    }

    try {
      await blockService.deleteBlock(id);
      showNotification('販売停止設定を削除しました', 'success');
      refreshBlocks();
    } catch (error) {
      console.error('Block deletion error:', error);
      showNotification('削除に失敗しました', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">販売停止設定 (F008)</h1>
            <p className="text-sm text-gray-600 mt-1">
              スタッフや施術室の利用不可時間を設定します
            </p>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? '閉じる' : '+ 新規作成'}
          </Button>
        </div>

        {/* Block作成フォーム */}
        {showCreateForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>販売停止設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>対象リソース</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {sampleResources.map(resource => (
                    <div
                      key={resource.id}
                      className={cn(
                        'p-3 border rounded-lg cursor-pointer text-center text-sm',
                        selectedResource === resource.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:bg-gray-50'
                      )}
                      onClick={() => setSelectedResource(resource.id)}
                    >
                      <div className="font-medium">{resource.name}</div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {resource.type === 'staff' ? 'スタッフ' : '施術室'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">開始日時</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="end-date">終了日時</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  <label htmlFor="recurring" className="text-sm font-medium">
                    繰り返し設定（毎週）
                  </label>
                </div>

                {isRecurring && (
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="count" className="text-sm">
                      繰り返し回数:
                    </Label>
                    <Input
                      id="count"
                      type="number"
                      min="2"
                      max="52"
                      value={recurringCount}
                      onChange={(e) => setRecurringCount(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-600">週</span>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="reason">理由（任意）</Label>
                <Textarea
                  id="reason"
                  placeholder="休暇、研修、設備メンテナンスなど"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSubmitting}
                >
                  キャンセル
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleCreateBlock}
                  disabled={isSubmitting || !selectedResource}
                >
                  {isSubmitting ? '処理中...' : '設定を保存'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Block一覧 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>設定済み販売停止</CardTitle>
              <Button variant="outline" size="sm" onClick={refreshBlocks}>
                更新
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {blocks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>販売停止設定がありません</p>
                <p className="text-sm mt-1">「+ 新規作成」ボタンから設定を追加してください</p>
              </div>
            ) : (
              <div className="space-y-3">
                {blocks.map(block => {
                  const resource = sampleResources.find(r => r.id === block.resourceId);
                  return (
                    <div
                      key={block.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant="secondary">{resource?.name || '不明'}</Badge>
                            {block.recurrenceRule && (
                              <Badge variant="outline" className="text-xs">
                                繰り返し
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm space-y-1">
                            <div>
                              <span className="font-medium">期間: </span>
                              {new Date(block.startTime).toLocaleString('ja-JP')}
                              {' 〜 '}
                              {new Date(block.endTime).toLocaleString('ja-JP')}
                            </div>
                            {block.reason && (
                              <div>
                                <span className="font-medium">理由: </span>
                                {block.reason}
                              </div>
                            )}
                            {block.recurrenceRule && (
                              <div className="text-xs text-gray-500">
                                <span className="font-medium">繰り返し: </span>
                                {block.recurrenceRule}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteBlock(block.id)}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

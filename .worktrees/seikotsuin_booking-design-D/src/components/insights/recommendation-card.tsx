import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowRight } from 'lucide-react';

const RecommendationCard: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState('pending');
  const [feedback, setFeedback] = useState('');

  const priorityColors = {
    high: '#dc2626',
    medium: '#f59e0b',
    low: '#10b981',
  };

  const statusLabels = {
    pending: '未実施',
    inProgress: '実施中',
    completed: '完了',
  };

  return (
    <div
      className='w-full max-w-2xl mx-auto p-4'
      style={{ backgroundColor: '#ffffff' }}
    >
      <Card style={{ backgroundColor: '#f8fafc' }}>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle style={{ color: '#1e293b' }}>
                売上向上施策の提案
              </CardTitle>
              <CardDescription style={{ color: '#64748b' }}>
                自費診療メニューの拡充による収益改善
              </CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <span
                className='px-2 py-1 rounded-full text-sm'
                style={{
                  backgroundColor: priorityColors.high,
                  color: '#ffffff',
                }}
              >
                優先度: 高
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className='space-y-4'>
            <div
              className='flex justify-between items-center p-3 rounded-lg'
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <span style={{ color: '#1e293b' }}>期待される効果</span>
              <span className='text-lg font-bold' style={{ color: '#10b981' }}>
                売上 +15%
              </span>
            </div>

            <div className='flex items-center gap-4'>
              <Label style={{ color: '#1e293b' }}>実施状況</Label>
              <RadioGroup value={status} onValueChange={setStatus}>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <div key={value} className='flex items-center space-x-2'>
                    <RadioGroupItem value={value} id={value} />
                    <Label htmlFor={value} style={{ color: '#1e293b' }}>
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            <div>
              <Button
                variant='ghost'
                onClick={() => setIsExpanded(!isExpanded)}
                className='w-full justify-between'
                style={{ color: '#1e293b' }}
              >
                詳細を{isExpanded ? '閉じる' : '表示'}
                <ArrowRight
                  className={`transform ${isExpanded ? 'rotate-90' : ''}`}
                />
              </Button>

              {isExpanded && (
                <div
                  className='mt-4 p-4 rounded-lg'
                  style={{ backgroundColor: '#f1f5f9' }}
                >
                  <p style={{ color: '#1e293b' }}>
                    現在の自費診療メニューを見直し、患者ニーズに合わせた新メニューを追加することで、
                    収益の向上が期待できます。特に、美容整体や予防医学的なアプローチを取り入れることで、
                    新規患者の獲得も見込めます。
                  </p>
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='feedback' style={{ color: '#1e293b' }}>
                フィードバック
              </Label>
              <Input
                id='feedback'
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder='この提案についてのフィードバックを入力してください'
                style={{ backgroundColor: '#ffffff', color: '#1e293b' }}
              />
            </div>

            <div className='flex justify-between gap-4'>
              <Button style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                実施計画を作成
              </Button>
              <a
                href='#related-data'
                className='flex items-center gap-2 text-sm'
                style={{ color: '#1e40af' }}
              >
                関連データを確認
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecommendationCard;

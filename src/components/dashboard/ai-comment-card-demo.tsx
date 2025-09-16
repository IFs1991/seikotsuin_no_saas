import React from 'react';
import { AICommentCard } from './ai-comment-card';
import type { AIComment } from '@/types';

// テスト用のモックデータ
const mockComment: AIComment = {
  id: '1',
  date: '2025-01-01',
  summary: 'Today was a great day with high patient satisfaction.',
  highlights: ['High patient volume', 'Excellent service quality'],
  improvements: ['Reduce waiting time', 'Update equipment'],
  suggestions: ['Implement appointment reminders'],
  created_at: '2025-01-01T10:00:00Z',
};

// 空データのテスト
const emptyComment: AIComment = {
  id: '2',
  date: '2025-01-01',
  summary: 'Test with empty arrays',
  highlights: [],
  improvements: [],
  suggestions: [],
  created_at: '2025-01-01T10:00:00Z',
};

export function AICommentCardDemo() {
  return (
    <div className="p-6 space-y-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900">
        AIコメントカード デモ
      </h1>
      
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">通常データ</h2>
          <AICommentCard comment={mockComment} />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold mb-4">空データ（配列が空の場合）</h2>
          <AICommentCard comment={emptyComment} />
        </div>
      </div>
    </div>
  );
}
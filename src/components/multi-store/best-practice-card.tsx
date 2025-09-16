"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BestPracticeCard: React.FC = () => {
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [comments, setComments] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');

  const handleLike = () => setIsLiked(!isLiked);
  const handleBookmark = () => setIsBookmarked(!isBookmarked);
  
  const handleCommentSubmit = () => {
    if (newComment.trim()) {
      setComments([...comments, newComment]);
      setNewComment('');
    }
  };

  return (
    <div className="p-6" style={{ backgroundColor: '#ffffff' }}>
      <Card className="w-full" style={{ backgroundColor: '#f9fafb' }}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle style={{ color: '#1e3a8a' }}>来院率向上施策の成功事例</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleLike}
                style={{ backgroundColor: isLiked ? '#10b981' : '#ffffff' }}
              >
                <span style={{ color: isLiked ? '#ffffff' : '#111827' }}>
                  いいね {isLiked ? '済' : ''}
                </span>
              </Button>
              <Button
                variant="outline"
                onClick={handleBookmark}
                style={{ backgroundColor: isBookmarked ? '#1e3a8a' : '#ffffff' }}
              >
                <span style={{ color: isBookmarked ? '#ffffff' : '#111827' }}>
                  ブックマーク {isBookmarked ? '済' : ''}
                </span>
              </Button>
            </div>
          </div>
          <CardDescription style={{ color: '#4b5563' }}>
            新規患者の継続来院率を改善するための包括的なアプローチ
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
              <h3 className="font-bold mb-2" style={{ color: '#111827' }}>実施概要</h3>
              <p style={{ color: '#374151' }}>実施店舗: 東京中央院</p>
              <p style={{ color: '#374151' }}>実施期間: 2024年1月〜3月</p>
            </div>

            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
              <h3 className="font-bold mb-2" style={{ color: '#111827' }}>成果指標</h3>
              <ul className="list-disc list-inside" style={{ color: '#374151' }}>
                <li>継続来院率: 45% → 78%</li>
                <li>患者満足度: 3.8 → 4.6</li>
                <li>月間売上: 25%増加</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
              <h3 className="font-bold mb-2" style={{ color: '#111827' }}>実施方法</h3>
              <p style={{ color: '#374151' }}>
                1. 初回カウンセリングの充実化<br/>
                2. 治療計画の可視化<br/>
                3. 定期的な経過報告の実施<br/>
                4. LINEを活用したフォローアップ
              </p>
            </div>

            <div className="mt-6">
              <Button className="w-full" style={{ backgroundColor: '#10b981', color: '#ffffff' }}>
                自院での適用を検討する
              </Button>
            </div>

            <div className="mt-6">
              <a 
                href="/documents/success-case-study.pdf"
                className="flex items-center justify-center p-2 rounded-lg"
                style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}
              >
                関連資料をダウンロード
              </a>
            </div>

            <div className="mt-6">
              <h3 className="font-bold mb-2" style={{ color: '#111827' }}>コメント・質問</h3>
              <div className="space-y-2">
                {comments.map((comment, index) => (
                  <div 
                    key={index} 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
                  >
                    {comment}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="コメントを入力"
                  style={{ backgroundColor: '#ffffff', color: '#111827' }}
                />
                <Button 
                  onClick={handleCommentSubmit}
                  style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}
                >
                  送信
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BestPracticeCard;
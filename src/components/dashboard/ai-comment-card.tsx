import React from 'react';
import { MessageCircle, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { AICommentCardProps } from '@/types';
import { clsx } from 'clsx';

export function AICommentCard({ comment, className }: AICommentCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <article
      className={clsx(
        'medical-card p-6 space-y-6',
        'bg-white border border-gray-200 rounded-lg shadow-medical',
        'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2',
        className
      )}
      role="article"
      aria-label="AI分析コメント"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <MessageCircle 
              className="h-6 w-6 text-primary-600" 
              aria-hidden="true"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              AI分析コメント
            </h3>
            <p className="text-sm text-gray-500">
              {formatDate(comment.date)}
            </p>
          </div>
        </div>
      </div>

      {/* サマリー */}
      <div className="bg-gray-50 rounded-medical p-4">
        <p className="text-gray-900 leading-relaxed">
          {comment.summary}
        </p>
      </div>

      {/* セクション */}
      <div className="space-y-4">
        {/* 好調だった点 */}
        {comment.highlights.length > 0 && (
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <TrendingUp 
                className="h-5 w-5 text-accent-600" 
                aria-hidden="true"
              />
              <h4 className="font-medium text-gray-900">好調だった点</h4>
            </div>
            <ul className="space-y-2">
              {comment.highlights.map((highlight, index) => (
                <li 
                  key={index}
                  className="flex items-start space-x-2"
                >
                  <div className="flex-shrink-0 w-2 h-2 bg-accent-500 rounded-full mt-2" />
                  <span className="text-gray-700">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 改善が必要な点 */}
        {comment.improvements.length > 0 && (
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <AlertTriangle 
                className="h-5 w-5 text-yellow-600" 
                aria-hidden="true"
              />
              <h4 className="font-medium text-gray-900">改善が必要な点</h4>
            </div>
            <ul className="space-y-2">
              {comment.improvements.map((improvement, index) => (
                <li 
                  key={index}
                  className="flex items-start space-x-2"
                >
                  <div className="flex-shrink-0 w-2 h-2 bg-yellow-500 rounded-full mt-2" />
                  <span className="text-gray-700">{improvement}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 明日への提案 */}
        {comment.suggestions.length > 0 && (
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Lightbulb 
                className="h-5 w-5 text-primary-600" 
                aria-hidden="true"
              />
              <h4 className="font-medium text-gray-900">明日への提案</h4>
            </div>
            <ul className="space-y-2">
              {comment.suggestions.map((suggestion, index) => (
                <li 
                  key={index}
                  className="flex items-start space-x-2"
                >
                  <div className="flex-shrink-0 w-2 h-2 bg-primary-500 rounded-full mt-2" />
                  <span className="text-gray-700">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* フッター（作成日時） */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          生成日時: {new Date(comment.created_at).toLocaleString('ja-JP')}
        </p>
      </div>
    </article>
  );
}

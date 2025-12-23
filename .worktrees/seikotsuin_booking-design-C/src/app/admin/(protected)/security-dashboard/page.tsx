/**
 * セキュリティダッシュボードページ
 * Phase 3B: 管理者向けセキュリティ監視画面
 */

import React from 'react';
import { SecurityDashboard } from '@/components/admin/SecurityDashboard';
import { Card } from '@/components/ui/card';
import { Shield, AlertTriangle, Info } from 'lucide-react';

export default function SecurityDashboardPage() {
  return (
    <div className='min-h-screen bg-gray-50'>
      {/* ヘッダー */}
      <div className='bg-white border-b shadow-sm'>
        <div className='max-w-7xl mx-auto px-4 py-6'>
          <div className='flex items-center space-x-4'>
            <div className='w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center'>
              <Shield className='w-7 h-7 text-red-600' />
            </div>
            <div>
              <h1 className='text-3xl font-bold text-gray-900'>
                セキュリティ監視センター
              </h1>
              <p className='text-gray-600'>
                リアルタイムでクリニック全体のセキュリティを監視・管理
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* 重要な通知 */}
        <div className='mb-8 space-y-4'>
          {/* 高優先度アラート */}
          <Card className='p-4 border-red-200 bg-red-50'>
            <div className='flex items-start space-x-3'>
              <AlertTriangle className='w-6 h-6 text-red-600 flex-shrink-0 mt-0.5' />
              <div>
                <h4 className='font-medium text-red-900 mb-1'>
                  セキュリティアラート
                </h4>
                <p className='text-red-800 text-sm mb-2'>
                  過去24時間で3件の不審なログイン試行が検出されました。
                </p>
                <div className='flex space-x-2'>
                  <button className='text-sm text-red-600 underline hover:text-red-700'>
                    詳細を確認
                  </button>
                  <button className='text-sm text-red-600 underline hover:text-red-700'>
                    対応履歴
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* 情報通知 */}
          <Card className='p-4 border-blue-200 bg-blue-50'>
            <div className='flex items-start space-x-3'>
              <Info className='w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5' />
              <div>
                <h4 className='font-medium text-blue-900 mb-1'>システム情報</h4>
                <p className='text-blue-800 text-sm'>
                  セキュリティ監視システムは正常に動作しています。最終更新:{' '}
                  {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* セキュリティダッシュボード本体 */}
        <SecurityDashboard />

        {/* フッター情報 */}
        <div className='mt-12 pt-8 border-t border-gray-200'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600'>
            <div>
              <h4 className='font-medium text-gray-900 mb-2'>監視対象</h4>
              <ul className='space-y-1'>
                <li>• ログイン・ログアウトアクティビティ</li>
                <li>• セッション管理・異常検知</li>
                <li>• MFA認証イベント</li>
                <li>• 不正アクセス試行</li>
              </ul>
            </div>

            <div>
              <h4 className='font-medium text-gray-900 mb-2'>自動対応機能</h4>
              <ul className='space-y-1'>
                <li>• ブルートフォース攻撃自動ブロック</li>
                <li>• 異常セッション自動終了</li>
                <li>• 脅威レベル別アラート</li>
                <li>• 管理者通知システム</li>
              </ul>
            </div>

            <div>
              <h4 className='font-medium text-gray-900 mb-2'>
                コンプライアンス
              </h4>
              <ul className='space-y-1'>
                <li>• 医療情報システム安全管理ガイドライン準拠</li>
                <li>• 個人情報保護法対応</li>
                <li>• セキュリティ監査ログ保存</li>
                <li>• ISO 27001準拠設計</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * MFA設定ページ
 * Phase 3B: MFA設定専用管理画面
 */

import React from 'react';
import { MFADashboard } from '@/components/mfa/MFADashboard';
import { Card } from '@/components/ui/card';
import { Shield, Info } from 'lucide-react';

export default function MFASetupPage() {
  // TODO: 実際のユーザー認証から取得
  const userId = 'current-user-id';
  const clinicId = 'current-clinic-id';
  const isAdmin = true;

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* ヘッダー */}
      <div className='bg-white border-b'>
        <div className='max-w-4xl mx-auto px-4 py-6'>
          <div className='flex items-center space-x-3'>
            <div className='w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center'>
              <Shield className='w-6 h-6 text-blue-600' />
            </div>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>
                多要素認証（MFA）設定
              </h1>
              <p className='text-gray-600'>
                アカウントのセキュリティを強化しましょう
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className='max-w-4xl mx-auto px-4 py-8'>
        {/* 情報カード */}
        <Card className='p-6 mb-8 border-blue-200 bg-blue-50'>
          <div className='flex items-start space-x-3'>
            <Info className='w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5' />
            <div>
              <h3 className='font-medium text-blue-900 mb-2'>
                多要素認証（MFA）について
              </h3>
              <p className='text-blue-800 mb-3'>
                MFAは、パスワードに加えて追加の認証要素を要求することで、アカウントのセキュリティを大幅に向上させます。
              </p>
              <ul className='text-sm text-blue-800 space-y-1'>
                <li>• 不正アクセスのリスクを99.9%削減</li>
                <li>• フィッシング攻撃やパスワード漏洩からの保護</li>
                <li>• 医療データへの不正アクセス防止</li>
                <li>• 業界標準のセキュリティ要件を満たす</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* MFA管理ダッシュボード */}
        <MFADashboard userId={userId} clinicId={clinicId} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

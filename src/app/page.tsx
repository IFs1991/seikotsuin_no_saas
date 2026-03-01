'use client';

import React from 'react';
import Link from 'next/link';
import { useSystemStatus } from '@/hooks/useSystemStatus';

const SYSTEM_STATUS_LABELS: Record<string, string> = {
  operational: '稼働中',
  degraded: '一部障害',
  outage: '停止中',
};

const AI_STATUS_LABELS: Record<string, string> = {
  active: 'AI稼働中',
  inactive: 'AI停止中',
};

export default function HomePage() {
  const { status, loading } = useSystemStatus();

  // ロード中はプレースホルダ '...' を表示（店舗数バッジのみ）
  const clinicCountBadge = loading ? '...' : (status?.activeClinicCount ?? 0);
  const clinicCountTitle = loading ? '...' : (status?.activeClinicCount ?? 0);
  const systemStatusLabel = status
    ? (SYSTEM_STATUS_LABELS[status.systemStatus] ?? '稼働中')
    : '稼働中';
  const aiStatusLabel = status
    ? (AI_STATUS_LABELS[status.aiAnalysisStatus] ?? 'AI分析')
    : 'AI分析';

  return (
    <div className='space-y-6'>
      <div className='border-b border-gray-200 pb-4'>
        <h1 className='text-3xl font-bold text-gray-900'>
          整骨院経営管理システム
        </h1>
        <p className='mt-2 text-gray-600'>
          {clinicCountTitle}
          店舗展開の整骨院グループ向けリアルタイム経営分析システム
        </p>
        <p className='mt-2 text-sm text-gray-500'>
          一般スタッフは左側メニューから日報・患者・収益分析へアクセスできます。
          管理者権限が付与されている場合は、管理メニュー経由で各種管理画面に遷移できます。
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        <div className='bg-white p-6 rounded-lg shadow border'>
          <h2 className='text-xl font-semibold text-gray-900 mb-2'>
            ダッシュボード
          </h2>
          <p className='text-gray-600 mb-4'>リアルタイムの経営データを確認</p>
          <Link
            href='/dashboard'
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          >
            ダッシュボードへ
          </Link>
        </div>

        <div className='bg-white p-6 rounded-lg shadow border'>
          <h2 className='text-xl font-semibold text-gray-900 mb-2'>
            管理者機能
          </h2>
          <p className='text-gray-600 mb-4'>
            全店舗統合管理・セキュリティ監視・マスタ設定
          </p>
          <Link
            href='/admin/login'
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          >
            管理者ログイン
          </Link>
          <p className='mt-2 text-xs text-gray-500'>
            ※ 管理者ロールが付与されていないアカウントはアクセスできません。
          </p>
        </div>

        <div className='bg-white p-6 rounded-lg shadow border'>
          <h2 className='text-xl font-semibold text-gray-900 mb-2'>
            AIチャット
          </h2>
          <p className='text-gray-600 mb-4'>経営分析とインサイトの相談</p>
          <Link
            href='/chat'
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500'
          >
            チャットを開始
          </Link>
        </div>
      </div>

      <div className='bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-2'>
        <h3 className='text-lg font-medium text-blue-900'>システム状態</h3>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          <div className='text-center'>
            <div className='text-2xl font-bold text-blue-600'>
              {clinicCountBadge}
            </div>
            <div className='text-sm text-blue-800'>店舗数</div>
          </div>
          <div className='text-center'>
            <div className='text-2xl font-bold text-green-600'>
              {systemStatusLabel}
            </div>
            <div className='text-sm text-green-800'>システム状態</div>
          </div>
          <div className='text-center'>
            <div className='text-2xl font-bold text-purple-600'>
              {aiStatusLabel}
            </div>
            <div className='text-sm text-purple-800'>機能状態</div>
          </div>
        </div>
      </div>
    </div>
  );
}

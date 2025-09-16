import React from 'react';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">
          整骨院経営管理システム
        </h1>
        <p className="mt-2 text-gray-600">
          46店舗展開の整骨院グループ向けリアルタイム経営分析システム
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            ダッシュボード
          </h2>
          <p className="text-gray-600 mb-4">
            リアルタイムの経営データを確認
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            ダッシュボードへ
          </a>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            管理者機能
          </h2>
          <p className="text-gray-600 mb-4">
            全店舗の統合管理とレポート
          </p>
          <a
            href="/admin"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            管理者画面へ
          </a>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            AIチャット
          </h2>
          <p className="text-gray-600 mb-4">
            経営分析とインサイトの相談
          </p>
          <a
            href="/chat"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            チャットを開始
          </a>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">
          システム状態
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">46</div>
            <div className="text-sm text-blue-800">店舗数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">稼働中</div>
            <div className="text-sm text-green-800">システム状態</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">AI分析</div>
            <div className="text-sm text-purple-800">機能状態</div>
          </div>
        </div>
      </div>
    </div>
  );
}
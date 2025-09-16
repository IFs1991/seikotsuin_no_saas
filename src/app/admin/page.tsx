import React from 'react';
import AdminDashboard from '@/components/dashboard/admin-dashboard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const AdminPage: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 min-h-screen p-4 sm:p-6 lg:p-8 text-[#111827] dark:text-[#f9fafb]">
      <div className="max-w-6xl mx-auto">
        <Card className="w-full bg-card shadow-lg">
          <CardHeader className="bg-card pb-4">
            <CardTitle className="text-2xl font-bold text-[#1e3a8a] dark:text-[#10b981]">Admin統合管理ダッシュボード</CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-300 mt-2">
              全46店舗のリアルタイムパフォーマンス、KPIランキング、グループ全体の統計情報を一元管理します。
              問題店舗の自動検出、ベストプラクティスの共有、詳細なドリルダウン分析が可能です。
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-card pt-4">
            <AdminDashboard />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
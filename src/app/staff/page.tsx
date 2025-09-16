'use client';

import React, { useState } from 'react';
import { useStaffAnalysis } from '@/hooks/useStaffAnalysis';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

const StaffManagementPage: React.FC = () => {
  const {
    staffMetrics,
    revenueRanking,
    satisfactionCorrelation,
    skillMatrix,
    trainingHistory,
    performanceTrends,
    isLoading,
  } = useStaffAnalysis();

  const [activeTab, setActiveTab] = useState<'performance' | 'shifts' | 'skills'>('performance');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a]">
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1e3a8a]"
          role="status"
          aria-label="Loading"
        ></div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#f9fafb] dark:bg-[#1a1a1a]">
      <Card className="max-w-[800px] mx-auto mb-6 bg-[#ffffff] dark:bg-[#2d2d2d]">
        <CardHeader>
          <CardTitle className="text-[#111827] dark:text-[#f3f4f6]">スタッフ生産性管理</CardTitle>
          <CardDescription className="text-[#6b7280] dark:text-[#9ca3af]">
            施術者のパフォーマンスと成長を追跡・管理
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="w-full">
            <div className="mb-4">
              <div className="flex space-x-2">
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'performance'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('performance')}
                >
                  パフォーマンス
                </button>
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'shifts'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('shifts')}
                >
                  シフト最適化
                </button>
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'skills'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('skills')}
                >
                  スキル管理
                </button>
              </div>
            </div>

            {activeTab === 'performance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]">
                  収益ランキング
                </h3>
                <div className="space-y-3">
                  {revenueRanking.map((staff, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-[#f3f4f6] dark:bg-[#333333] rounded">
                      <span className="text-[#111827] dark:text-[#f3f4f6]">{staff.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-[#111827] dark:text-[#f3f4f6]">{staff.revenue.toLocaleString()}</span>
                        <span className="text-sm text-[#6b7280] dark:text-[#9ca3af] ml-2">{staff.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'shifts' && (
              <div>
                <h3 className="text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]">
                  シフト最適化
                </h3>
                <p className="text-[#6b7280] dark:text-[#9ca3af]">シフト最適化機能は開発中です。</p>
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="space-y-6">
                <div className="p-4 rounded-lg border border-[#e5e7eb] dark:border-[#404040]">
                  <h3 className="text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]">
                    スキルマトリックス
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {skillMatrix.map((skill) => (
                      <div key={skill.id} className="flex items-center justify-between p-3 bg-[#f3f4f6] dark:bg-[#333333] rounded">
                        <span className="text-[#111827] dark:text-[#f3f4f6]">{skill.name}</span>
                        <div className="flex items-center">
                          {[...Array(5)].map((_, index) => (
                            <div
                              key={index}
                              className={`w-4 h-4 mx-0.5 rounded-full ${
                                index < skill.level
                                  ? 'bg-[#1e3a8a] dark:bg-[#3b82f6]'
                                  : 'bg-[#e5e7eb] dark:bg-[#4b5563]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-[#e5e7eb] dark:border-[#404040]">
                  <h3 className="text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]">
                    研修・資格履歴
                  </h3>
                  <div className="space-y-3">
                    {trainingHistory.map((entry) => (
                      <div key={entry.id} className="flex items-center space-x-4 p-3 bg-[#f3f4f6] dark:bg-[#333333] rounded">
                        <CheckCircle className="text-[#10b981] dark:text-[#34d399]" />
                        <div>
                          <p className="font-medium text-[#111827] dark:text-[#f3f4f6]">{entry.title}</p>
                          <p className="text-sm text-[#6b7280] dark:text-[#9ca3af]">{entry.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffManagementPage;
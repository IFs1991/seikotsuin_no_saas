'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const AiInsightsPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: '全て' },
    { id: 'revenue', label: '収益向上' },
    { id: 'efficiency', label: '効率化' },
    { id: 'satisfaction', label: '満足度' }
  ];

  const insights = [
    {
      id: 1,
      title: '予約枠の最適化提案',
      category: 'efficiency',
      priority: 'high',
      impact: '月間収益10%向上',
      description: '混雑時間帯の予約枠を30分から45分に調整することで、患者満足度を維持しながら収容人数を最適化できます。',
      status: 'pending'
    },
    {
      id: 2,
      title: '自費診療メニューの拡充',
      category: 'revenue',
      priority: 'medium',
      impact: '自費売上15%向上',
      description: '高齢者向けの予防ケアメニューを導入することで、新規患者層の開拓が期待できます。',
      status: 'implemented'
    }
  ];

  return (
    <div className="container mx-auto p-6 bg-white dark:bg-gray-800">
      <Card className="w-full bg-card">
        <CardHeader className="bg-card">
          <CardTitle className="text-2xl font-bold text-[#1e3a8a]">AI分析インサイト</CardTitle>
          <CardDescription>Gemini Flashが分析した経営改善提案一覧</CardDescription>
        </CardHeader>
        <CardContent className="bg-card">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid grid-cols-4 gap-4">
              {categories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="mt-6 space-y-4">
              {insights
                .filter(insight => selectedCategory === 'all' || insight.category === selectedCategory)
                .map(insight => (
                  <Card key={insight.id} className="bg-card">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {insight.title}
                        <span className={`px-2 py-1 text-xs rounded ${
                          insight.priority === 'high' ? 'bg-red-100 text-red-800' :
                          insight.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {insight.priority === 'high' ? '高優先度' :
                           insight.priority === 'medium' ? '中優先度' : '低優先度'}
                        </span>
                      </CardTitle>
                      <CardDescription>{insight.impact}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 dark:text-gray-300">{insight.description}</p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </Tabs>

          <div className="mt-8 flex justify-end">
            <Button
              className="bg-[#10b981] text-white hover:bg-[#059669]"
              onClick={() => console.log('PDFレポート出力')}
            >
              PDFレポート出力
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiInsightsPage;
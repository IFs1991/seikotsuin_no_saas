import React, { useState } from 'react';

// ファネルのモックデータ
const mockFunnelData = [
  { id: 'newPatients', name: '新患', value: 1000, color: '#1e3a8a' },
  { id: 'firstVisit', name: '初回施術', value: 800, color: '#1e3a8a' },
  { id: 'revisit3', name: '3回目再診', value: 600, color: '#10b981' },
  { id: 'revisit5', name: '5回目再診', value: 450, color: '#10b981' },
  { id: 'treatmentComplete', name: '治療完了', value: 300, color: '#10b981' },
];

// 転換率の計算
const calculateConversionRates = (data: typeof mockFunnelData) => {
  return data.map((stage, index) => {
    if (index === 0) {
      return { ...stage, conversionRate: 100 }; // 最初の段階は100%
    }
    const previousValue = data[index - 1].value;
    const currentConversionRate = (stage.value / previousValue) * 100;
    return { ...stage, conversionRate: parseFloat(currentConversionRate.toFixed(1)) };
  });
};

const funnelDataWithRates = calculateConversionRates(mockFunnelData);

const ConversionFunnel: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('今月');
  const [selectedSegment, setSelectedSegment] = useState('全体');

  // ドリルダウン機能のダミー関数
  const handleDrillDown = (stageName: string) => {
    alert(`${stageName} の詳細データを表示します。`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md min-h-screen flex justify-center items-start">
      <Card className="w-full max-w-4xl bg-card text-[#111827] dark:text-[#f9fafb]">
        <CardHeader className="bg-card border-b border-gray-200 dark:border-gray-700 pb-4">
          <CardTitle className="text-center text-2xl font-bold text-[#1e3a8a] dark:text-[#10b981]">新患→再診転換ファネル</CardTitle>
          <CardDescription className="text-center text-gray-600 dark:text-gray-400 mt-2">
            新患から治療完了までの患者フローと各段階の転換率を視覚化します。
          </CardDescription>
        </CardHeader>
        <CardContent className="bg-card p-6">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="period-select" className="text-[#111827] dark:text-[#f9fafb]">期間:</Label>
              <select
                id="period-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-[#111827] dark:text-[#f9fafb]"
              >
                <option value="今月">今月</option>
                <option value="先月">先月</option>
                <option value="過去3ヶ月">過去3ヶ月</option>
                <option value="今年">今年</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="segment-select" className="text-[#111827] dark:text-[#f9fafb]">セグメント:</Label>
              <select
                id="segment-select"
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-[#111827] dark:text-[#f9fafb]"
              >
                <option value="全体">全体</option>
                <option value="20代男性">20代男性</option>
                <option value="30代女性">30代女性</option>
                <option value="腰痛">腰痛</option>
              </select>
            </div>
            <Button className="bg-[#1e3a8a] hover:bg-[#1a3070] text-white dark:bg-[#10b981] dark:hover:bg-[#0e9a6f]">
              データエクスポート
            </Button>
          </div>

          <div className="flex flex-col items-center space-y-2">
            {funnelDataWithRates.map((stage, index) => (
              <div
                key={stage.id}
                className={`relative w-full max-w-[700px] rounded-md overflow-hidden shadow-sm cursor-pointer transition-all duration-300 hover:shadow-md`}
                style={{
                  width: `${100 - index * 10}%`, // ファネル効果のための幅の減少
                  backgroundColor: stage.color,
                  minHeight: '60px', // 視認性を確保
                }}
                onClick={() => handleDrillDown(stage.name)}
              >
                <div className="flex justify-between items-center p-3 text-white font-semibold">
                  <span className="text-lg">{stage.name}</span>
                  <span className="text-xl">{stage.value.toLocaleString()}人</span>
                </div>
                {index > 0 && (
                  <div className="absolute top-1/2 left-full -translate-y-1/2 ml-4 text-[#111827] dark:text-[#f9fafb] text-sm font-medium whitespace-nowrap">
                    <span className="text-[#10b981] dark:text-[#10b981]">{stage.conversionRate}%</span> 転換
                  </div>
                )}
                {/* 改善ポイントのハイライト (例: 3回目再診の転換率が低い場合を想定) */}
                {stage.id === 'revisit3' && stage.conversionRate && stage.conversionRate < 70 && (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-red-500 bg-opacity-70 text-white text-sm font-bold">
                    改善ポイント！
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 text-center text-[#111827] dark:text-[#f9fafb]">
            <h3 className="text-xl font-semibold mb-4">トレンド表示 (開発中)</h3>
            <p className="text-gray-600 dark:text-gray-400">
              過去のデータと比較した転換率のトレンドをここに表示します。
            </p>
            <div className="w-full h-40 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center text-gray-400 dark:text-gray-500 mt-4">
              <p>トレンドチャートのプレースホルダー</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConversionFunnel;
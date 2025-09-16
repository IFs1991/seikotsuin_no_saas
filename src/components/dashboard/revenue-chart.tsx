"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const RevenueTrendChart: React.FC = () => {
  const [timeFrame, setTimeFrame] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [showInsurance, setShowInsurance] = useState(true);
  const [showSelfPay, setShowSelfPay] = useState(true);
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);

  const chartData = {
    daily: [
      { date: '2024-07-08', insurance: 15000, selfPay: 8000 },
      { date: '2024-07-09', insurance: 18000, selfPay: 9000 },
      { date: '2024-07-10', insurance: 16000, selfPay: 7500 },
      { date: '2024-07-11', insurance: 20000, selfPay: 10000 },
      { date: '2024-07-12', insurance: 17000, selfPay: 8500 },
    ],
    weekly: [
      { week: '2024-W28', insurance: 90000, selfPay: 45000 },
      { week: '2024-W29', insurance: 95000, selfPay: 48000 },
    ],
    monthly: [
      { month: '2024-07', insurance: 380000, selfPay: 190000 },
    ],
  };

  const previousPeriodData = {
    daily: [
      { date: '2024-07-01', insurance: 14000, selfPay: 7000 },
      { date: '2024-07-02', insurance: 17000, selfPay: 8000 },
      { date: '2024-07-03', insurance: 15000, selfPay: 7000 },
      { date: '2024-07-04', insurance: 19000, selfPay: 9000 },
      { date: '2024-07-05', insurance: 16000, selfPay: 8000 },
    ],
    weekly: [
      { week: '2024-W25', insurance: 85000, selfPay: 42000 },
      { week: '2024-W26', insurance: 92000, selfPay: 46000 },
    ],
    monthly: [
      { month: '2024-06', insurance: 360000, selfPay: 180000 },
    ],
  };

  const renderChart = () => {
    let data = chartData[timeFrame];
    let previousData = previousPeriodData[timeFrame];

    if (!showInsurance && !showSelfPay) {
      return <p>No data to display.</p>;
    }

    return (
      <div style={{ width: '100%', height: '300px', position: 'relative' }}>
        {/* Placeholder for chart library integration (e.g., Chart.js, Recharts) */}
        <p>Chart Placeholder ({timeFrame})</p>
        {showInsurance && <p>Insurance Data: {JSON.stringify(data.map(item => item.insurance))}</p>}
        {showSelfPay && <p>Self-Pay Data: {JSON.stringify(data.map(item => item.selfPay))}</p>}
        {showPreviousPeriod && <p>Previous Period Data: {JSON.stringify(previousData)}</p>}
      </div>
    );
  };

  return (
    <Card className="w-full bg-card">
      <CardHeader className="bg-card">
        <CardTitle className="bg-card">収益トレンド</CardTitle>
        <CardDescription className="bg-card">日次、週次、月次の収益推移を表示します。</CardDescription>
      </CardHeader>
      <CardContent className="bg-card">
        <div className="flex space-x-4 mb-4 bg-card">
          <Button variant="outline" onClick={() => setTimeFrame('daily')} className="bg-card">日次</Button>
          <Button variant="outline" onClick={() => setTimeFrame('weekly')} className="bg-card">週次</Button>
          <Button variant="outline" onClick={() => setTimeFrame('monthly')} className="bg-card">月次</Button>
        </div>
        <div className="flex space-x-4 mb-4 bg-card">
          <Label className="bg-card">
            <Input type="checkbox" checked={showInsurance} onChange={(e) => setShowInsurance(e.target.checked)} className="mr-2 bg-card" />
            保険診療
          </Label>
          <Label className="bg-card">
            <Input type="checkbox" checked={showSelfPay} onChange={(e) => setShowSelfPay(e.target.checked)} className="mr-2 bg-card" />
            自費診療
          </Label>
          <Label className="bg-card">
            <Input type="checkbox" checked={showPreviousPeriod} onChange={(e) => setShowPreviousPeriod(e.target.checked)} className="mr-2 bg-card" />
            前期比較
          </Label>
        </div>
        {renderChart()}
        <div className="flex justify-end bg-card">
          <Button className="bg-card">エクスポート</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RevenueTrendChart;
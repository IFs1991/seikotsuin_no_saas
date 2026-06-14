'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ClinicSeriesPoint,
  ManagerPatientAnalysisResponse,
  TimeSeriesPoint,
} from '@/lib/manager-patient-analysis';

const ManagerLineChartCard = React.memo(function ManagerLineChartCard({
  title,
  data,
}: {
  title: string;
  data: TimeSeriesPoint[];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='h-72'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' />
              <YAxis />
              <Tooltip />
              <Line
                type='monotone'
                dataKey='value'
                stroke='#2563eb'
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

const ManagerComparisonChartCard = React.memo(
  function ManagerComparisonChartCard({
    title,
    data,
  }: {
    title: string;
    data: ClinicSeriesPoint[];
  }) {
    return (
      <Card className='bg-card'>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='h-72'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='clinicName' />
                <YAxis />
                <Tooltip />
                <Bar dataKey='value' fill='#16a34a' />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  }
);

export const ManagerChartsSection = React.memo(function ManagerChartsSection({
  charts,
}: {
  charts: ManagerPatientAnalysisResponse['charts'];
}) {
  return (
    <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
      <ManagerLineChartCard title='売上推移' data={charts.revenue} />
      <ManagerLineChartCard title='来院患者数推移' data={charts.patients} />
      <ManagerLineChartCard title='新患推移' data={charts.newPatients} />
      <ManagerLineChartCard title='再来推移' data={charts.repeatPatients} />
      <ManagerLineChartCard title='来院数推移' data={charts.visits} />
      <ManagerLineChartCard
        title='新患再来率推移'
        data={charts.conversionRate}
      />
      <ManagerComparisonChartCard
        title='院別売上比較'
        data={charts.clinicRevenueComparison}
      />
      <ManagerComparisonChartCard
        title='院別来院患者数比較'
        data={charts.clinicPatientComparison}
      />
    </div>
  );
});
